import { test } from "node:test";
import assert from "node:assert/strict";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { recordedFor } from "../src/domain/workbench.js";
import {
  buildPricedPayload,
  verifyPricedProposal,
} from "../src/server/providers/proposales-mapping.js";

const base = (report = reports[0]) =>
  buildDraftSnapshot(report, recordedFor(report.id).selection, catalogueV2);
const maps = (snap: ReturnType<typeof base>) =>
  snap.items.map((i, n) => ({
    serviceId: i.serviceId,
    productId: n + 10,
    variationId: n + 20,
    imageUuid: "00000000-0000-4000-8000-000000000001",
  }));
const presentation = {
  intro: "We looked at how Lindqvist Bageri appears online and suggest a clear website.",
  recipient: { companyName: "Lindqvist Bageri", contactName: "Anna Berg", email: "info@lindqvist.example" },
};
// A live report: real-looking sources, as the report schema requires.
const live = () => {
  const report = {
    ...reports[0],
    mode: "live" as const,
    evidence: reports[0].evidence.map((e) => ({
      ...e,
      synthetic: false,
      url: "https://lindqvist.example/",
      retrievedAt: "2026-10-10T12:00:00.000Z",
    })),
  };
  return buildDraftSnapshot(report, recordedFor(reports[0].id).selection, catalogueV2);
};
const asProvider = (payload: ReturnType<typeof buildPricedPayload>, extra = {}) => ({
  ...payload,
  uuid: "00000000-0000-4000-8000-000000000002",
  status: "draft",
  recipient_is_set: false,
  currency: "EUR",
  ...extra,
});

test("proposal-3 has a client-facing title and introduction, no demo wording and no review questions", () => {
  const snap = { ...base(), compositionVersion: "proposal-3" as const, presentation };
  const p = buildPricedPayload(snap, maps(snap), "1", "op");
  assert.doesNotMatch(p.title_md, /do not send/i);
  assert.match(p.title_md, new RegExp(snap.report.businessName));
  assert.match(p.description_md, /We looked at how Lindqvist Bageri appears online/);
  assert.match(p.description_md, /Prices exclude VAT\./);
  // A fictional example says so; review questions stay in the app.
  assert.match(p.description_md, /Example proposal for a fictional business/);
  for (const q of snap.questions) assert.ok(!p.description_md.includes(q));
  const real = { ...live(), compositionVersion: "proposal-3" as const, presentation };
  assert.doesNotMatch(buildPricedPayload(real, maps(real), "1", "op").description_md, /fictional|synthetic|illustrative/i);
});

test("a chosen recipient is set on the draft and verified; no recipient stays unset", () => {
  const snap = { ...base(), compositionVersion: "proposal-3" as const, presentation };
  const p = buildPricedPayload(snap, maps(snap), "1", "op");
  assert.deepEqual(p.recipient, {
    first_name: "Anna",
    last_name: "Berg",
    email: "info@lindqvist.example",
    company_name: "Lindqvist Bageri",
  });
  const stored = asProvider(p, {
    recipient_is_set: true,
    recipient_email: "INFO@lindqvist.example",
    recipient_company_name: "Lindqvist Bageri",
  });
  assert.deepEqual(verifyPricedProposal(stored, snap, maps(snap), "1", "op").issues, []);
  assert.deepEqual(
    verifyPricedProposal({ ...stored, recipient_email: "other@x.example" }, snap, maps(snap), "1", "op").issues,
    ["recipient"],
  );
  const none = { ...base(), compositionVersion: "proposal-3" as const, presentation: { intro: "" } };
  const q = buildPricedPayload(none, maps(none), "1", "op");
  assert.equal("recipient" in q, false);
  assert.deepEqual(
    verifyPricedProposal(asProvider(q, { recipient_is_set: true }), none, maps(none), "1", "op").issues,
    ["recipient"],
  );
});

test("earlier compositions are unchanged and still reject any recipient", () => {
  const older = { ...base(), compositionVersion: "proposal-2" as const };
  const p = buildPricedPayload(older, maps(older), "1", "op");
  assert.match(p.title_md, /do not send/);
  assert.equal("recipient" in p, false);
  assert.deepEqual(
    verifyPricedProposal(asProvider(p, { recipient_is_set: true }), older, maps(older), "1", "op").issues,
    ["recipient"],
  );
});

test("email suggestions come only from the chosen business's sources, own domain and role addresses first", async () => {
  const { contactSuggestions } = await import("../src/domain/contacts.js");
  const at = "2026-10-10T12:00:00.000Z";
  const report = {
    ...reports[1],
    mode: "live" as const,
    capabilities: {
      ...reports[1].capabilities,
      website: { status: "present" as const, evidenceIds: ["s1"] },
    },
    evidence: [
      { id: "s1", label: "Own site", excerpt: "Mail anna.berg@juniper.example or info@juniper.example.", url: "https://www.juniper.example/", retrievedAt: at, synthetic: false },
      { id: "s2", label: "Directory", excerpt: "Contact: juniper@gmail.com. Listing by support@directory.example", url: "https://directory.example/j", retrievedAt: at, synthetic: false },
    ],
  };
  assert.deepEqual(contactSuggestions(report as never), [
    "info@juniper.example",
    "anna.berg@juniper.example",
    "juniper@gmail.com",
  ]);
});
