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
