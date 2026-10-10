import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogueV2 } from "../src/domain/catalogue.js";
import {
  reports,
  evaluationReports,
  reportSchema,
} from "../src/domain/reports.js";
import { validateSelection } from "../src/domain/selection.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { snapshotHash } from "../src/server/offers.js";
const report = () => reports.find((r) => r.id === "no-website")!;
const item = (
  serviceId: string,
  quantity = 1,
  disposition: "core" | "optional" = "core",
  findingIds = ["nf1"],
) => ({
  serviceId,
  quantity,
  disposition,
  findingIds,
  rationale: "Addresses the supported business need.",
});
const selection = (items: unknown[]) => ({
  items,
  questions: [],
  abstentionReason: null,
});
function quote(items: unknown[]) {
  return buildDraftSnapshot(
    report(),
    validateSelection(report(), selection(items), catalogueV2),
    catalogueV2,
  );
}
test("base website, additional pages and maintenance have fixed split amounts", () => {
  const s = quote([
    item("website-base"),
    item("service-page", 2, "core", ["nf3"]),
    item("website-maintenance", 1, "core", ["nf4"]),
  ]);
  assert.equal(s.coreOneTimeMinor, 150000);
  assert.equal(s.coreMonthlyMinor, 8000);
  assert.equal(s.items.length, 3);
});
test("optional charges stay outside core totals", () => {
  const s = quote([
    item("website-base"),
    item("website-maintenance", 1, "optional", ["nf4"]),
  ]);
  assert.equal(s.coreOneTimeMinor, 120000);
  assert.equal(s.coreMonthlyMinor, 0);
  assert.equal(s.optionalMonthlyMinor, 8000);
});
test("strict selection rejects invented commercial fields, IDs and quantities", () => {
  for (const bad of [
    { ...item("website-base"), price: 1 },
    item("fake"),
    item("website-base", 0),
    item("website-base", 2),
    item("service-page", 1.5),
    item("service-page", 11),
    item("faq-content", 6),
  ])
    assert.throws(() => quote([bad]));
});
test("duplicates, missing findings and unknown findings cannot support a sale", () => {
  assert.throws(() => quote([item("website-base"), item("website-base")]));
  assert.throws(() => quote([item("website-base", 1, "core", ["missing"])]));
  assert.throws(() => quote([item("website-base", 1, "core", ["nf5"])]));
});
test("bundled website work cannot be charged again as enquiry improvement", () => {
  assert.throws(
    () =>
      quote([
        item("website-base"),
        item("enquiry-improvement", 1, "core", ["nf3"]),
      ]),
    /overlap/,
  );
});
test("website and campaign prerequisites must be known or selected", () => {
  assert.throws(
    () => quote([item("service-page", 2, "core", ["nf3"])]),
    /prerequisite/,
  );
  assert.throws(() => quote([item("ads-management")]), /prerequisite/);
  assert.throws(() => quote([item("google-profile")]), /prerequisite/);
});
test("an optional foundation cannot make a core dependent service valid", () => {
  assert.throws(
    () =>
      quote([
        item("website-base", 1, "optional"),
        item("service-page", 1, "core", ["nf3"]),
      ]),
    /prerequisite/,
  );
});
test("four justified modules can be selected without an arbitrary three-item cap", () => {
  assert.equal(
    quote([
      item("website-base"),
      item("service-page", 2, "core", ["nf3"]),
      item("faq-content", 1, "core", ["nf3"]),
      item("website-maintenance", 1, "optional", ["nf4"]),
    ]).items.length,
    4,
  );
});
test("empty selection abstains but cannot create a blank draft", () => {
  const empty = validateSelection(
    report(),
    {
      items: [],
      questions: ["Confirm budget."],
      abstentionReason: "More information is needed.",
    },
    catalogueV2,
  );
  assert.equal(empty.items.length, 0);
  assert.throws(
    () => buildDraftSnapshot(report(), empty, catalogueV2),
    /empty_offer/,
  );
});
test("ambiguous identity permits abstention only", () => {
  const r = evaluationReports.find((r) => r.id === "uncertain")!;
  assert.throws(() =>
    validateSelection(
      r,
      selection([item("website-base", 1, "core", ["hf1"])]),
      catalogueV2,
    ),
  );
  assert.equal(
    validateSelection(
      r,
      {
        items: [],
        questions: ["Which business?"],
        abstentionReason: "Identity is ambiguous.",
      },
      catalogueV2,
    ).items.length,
    0,
  );
});
test("report schema rejects broken references and unsupported fact certainty", () => {
  assert.throws(() =>
    reportSchema.parse({
      ...report(),
      goals: [{ text: "More calls", sourceId: "missing" }],
    }),
  );
  assert.throws(() =>
    reportSchema.parse({
      ...report(),
      findings: [{ ...report().findings[0], evidenceIds: ["missing"] }],
    }),
  );
});
test("two no-website reports support different needs without embedding service recommendations", () => {
  const a = report(),
    b = evaluationReports.find((r) => r.id === "booking-launch")!;
  assert.equal(a.capabilities.website.status, "absent");
  assert.equal(b.capabilities.website.status, "absent");
  assert.notDeepEqual(a.goals, b.goals);
  assert.equal("recommendations" in a, false);
  assert.equal("recommendations" in b, false);
});
test("generation identity ignores selection order and changes with quantities", () => {
  const a = quote([
    item("website-base"),
    item("service-page", 2, "core", ["nf3"]),
  ]);
  const b = quote([
    item("service-page", 2, "core", ["nf3"]),
    item("website-base"),
  ]);
  assert.equal(snapshotHash(a), snapshotHash(b));
  assert.notEqual(
    snapshotHash(a),
    snapshotHash(
      quote([item("website-base"), item("service-page", 3, "core", ["nf3"])]),
    ),
  );
});
test("snapshot retains report and catalogue terms after source objects change", () => {
  const r = structuredClone(report());
  const c = structuredClone(catalogueV2);
  const s = buildDraftSnapshot(
    r,
    validateSelection(r, selection([item("website-base")]), c),
    c,
  );
  const before = snapshotHash(s);
  r.evidence[0].excerpt = "Changed owner answers";
  c.services[0].unitPriceMinor = 1;
  assert.equal(snapshotHash(s), before);
  assert.equal(s.catalogue.services[0].unitPriceMinor, 120000);
});
test("object key ordering does not change persisted identity", () => {
  assert.equal(
    snapshotHash({ z: 1, a: { y: 2, b: 3 } }),
    snapshotHash({ a: { b: 3, y: 2 }, z: 1 }),
  );
});
test("live evidence requires retrieval provenance", () => {
  const r = structuredClone(report());
  r.mode = "live";
  r.evidence.forEach((e) => {
    e.synthetic = false;
  });
  assert.throws(() => reportSchema.parse(r));
  r.evidence.forEach((e) => {
    e.retrievedAt = "2026-10-09T12:00:00Z";
  });
  assert.equal(reportSchema.parse(r).mode, "live");
});
