import { test } from "node:test";
import assert from "node:assert/strict";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { recordedFor } from "../src/domain/workbench.js";

// Without stated goals, as after public research alone.
const built = buildDraftSnapshot(reports[0], recordedFor(reports[0].id).selection, catalogueV2);
const snap = { ...built, report: { ...built.report, goals: [] } };

test("the introduction input carries only verified material and says whether it follows a conversation", async () => {
  const { introInput } = await import("../src/domain/intro.js");
  const input = introInput(snap);
  assert.equal(input.business.name, reports[0].businessName);
  assert.deepEqual(input.services.map((s) => s.ref).sort(), snap.items.map((i) => "service:" + i.serviceId).sort());
  assert.ok(input.findings.every((f) => reports[0].findings.some((x) => x.id === f.id)));
  assert.equal(input.followUp, false);
  const withNotes = { ...snap, report: { ...snap.report, goals: [{ text: "Wants more bookings", sourceId: reports[0].evidence[0].id }] } };
  assert.equal(introInput(withNotes).followUp, true);
});

test("sentences without valid references are dropped; what remains is joined in order", async () => {
  const { introInput, keepSupported } = await import("../src/domain/intro.js");
  const input = introInput(snap);
  const finding = input.findings[0].id,
    service = input.services[0].ref;
  const r = keepSupported(
    {
      sentences: [
        { text: "We are Metascalers.", refs: ["agency"] },
        { text: "You rank first on Google.", refs: ["f-invented"] },
        { text: "We noticed customers ask about opening hours.", refs: [finding] },
        { text: "We propose a clear website.", refs: [service, "notes"] },
        { text: "We suggest a focused first step.", refs: [service] },
      ],
    },
    input,
  );
  assert.equal(r.text, "We are Metascalers. We noticed customers ask about opening hours. We suggest a focused first step.");
  assert.equal(r.dropped, 2);
});

test("draft introductions stop at whole supported sentences within the presentation limit", async () => {
  const { introInput, keepSupported } = await import("../src/domain/intro.js");
  const { proposalPresentationSchema } =
    await import("../src/domain/offers.js");
  const input = introInput(snap);
  const sentences = [749, 750, 200].map((n) => ({
    text: "a".repeat(n - 1) + ".",
    refs: ["agency"],
  }));
  const result = keepSupported({ sentences }, input);
  assert.equal(result.text.length, 1500);
  assert.deepEqual(result.sentences, sentences.slice(0, 2));
  assert.equal(result.dropped, 1);
  assert.doesNotThrow(() =>
    proposalPresentationSchema.parse({ intro: result.text }),
  );
  const long = keepSupported(
    {
      sentences: [800, 800, 20].map((n) => ({
        text: "b".repeat(n - 1) + ".",
        refs: ["agency"],
      })),
    },
    input,
  );
  assert.equal(long.text.length, 800);
  assert.equal(long.sentences.length, 1);
});

test("bounded introduction validation has a new cache identity without rewriting the old prompt", async () => {
  const { activePrompts } = await import("../src/prompts/active.js");
  const { definition: previous } = await import("../src/prompts/proposal-intro/v1.js");
  const { promptProvenance } = await import("../src/server/prompt-provenance.js");
  assert.notEqual(promptProvenance(activePrompts.intro).validationVersion, promptProvenance(previous).validationVersion);
  assert.equal(previous.validationVersion, "intro-validation-1");
  assert.equal(activePrompts.intro.system, previous.system);
});
