import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewRecommendation,
  recordedFor,
  adjustedSelection,
} from "../src/domain/workbench.js";
import { reports } from "../src/domain/reports.js";
test("recorded AI selection drives the four honest totals; removing optional services leaves core unchanged", () => {
  const rec = recordedFor("enquiry-flow");
  const items = rec.selection.items.map(
    ({ serviceId, quantity, disposition }) => ({
      serviceId,
      quantity,
      disposition,
    }),
  );
  const preview = previewRecommendation(reports[1], rec.selection, items);
  assert.equal(preview?.coreOneTimeMinor, 40000);
  assert.equal(preview?.optionalOneTimeMinor, 55000);
  assert.equal(preview?.coreMonthlyMinor, 0);
  assert.equal(
    previewRecommendation(
      reports[1],
      rec.selection,
      items.filter((i) => i.disposition === "core"),
    )?.optionalOneTimeMinor,
    0,
  );
});
test("adjustments preserve AI reasons; removing a foundation or exceeding catalogue bounds fails preview validation", () => {
  const rec = recordedFor("no-website");
  const items = rec.selection.items.map(
    ({ serviceId, quantity, disposition }) => ({
      serviceId,
      quantity,
      disposition,
    }),
  );
  assert.equal(
    previewRecommendation(reports[0], rec.selection, items)?.coreOneTimeMinor,
    180000,
  );
  assert.throws(() =>
    previewRecommendation(
      reports[0],
      rec.selection,
      items.filter((i) => i.serviceId !== "website-base"),
    ),
  );
  // The operator may change quantities within catalogue bounds, not beyond them.
  assert.equal(
    adjustedSelection(rec.selection, [
      { serviceId: "service-page", quantity: 3, disposition: "core" },
    ]).items[0].quantity,
    3,
  );
  assert.throws(() =>
    previewRecommendation(
      reports[0],
      rec.selection,
      items.map((i) => (i.serviceId === "website-base" ? { ...i, quantity: 2 } : i)),
    ),
    /invalid_quantity/,
  );
  assert.equal(
    adjustedSelection(rec.selection, [
      { serviceId: "website-base", quantity: 1, disposition: "optional" },
    ]).items[0].rationale,
    rec.selection.items.find((i) => i.serviceId === "website-base")?.rationale,
  );
});

test("only a first definitive pre-admission rejection releases draft controls; uncertain or repeated requests retain identity", async () => {
  const { canReleaseRejectedGeneration } =
    await import("../src/domain/workbench.js");
  assert.equal(
    canReleaseRejectedGeneration("stale_recommendation", false),
    true,
  );
  assert.equal(canReleaseRejectedGeneration("access_required", false), true);
  assert.equal(
    canReleaseRejectedGeneration("draft_budget_exceeded", false),
    true,
  );
  assert.equal(
    canReleaseRejectedGeneration("stale_recommendation", true),
    false,
  );
  assert.equal(canReleaseRejectedGeneration("request_failed", false), false);
  assert.equal(
    canReleaseRejectedGeneration("asset_not_verified", false),
    false,
  );
  assert.equal(canReleaseRejectedGeneration(undefined, false), false);
});

test("restored pending identity survives recommendation read failure and reselecting the current example", async () => {
  const { restorePendingGeneration, shouldSwitchExample } =
    await import("../src/domain/workbench.js");
  const saved = {
    requestId: "3f5ba0b0-959a-4fc7-b09f-02d74c7c94d4",
    recommendationId: "9b77fba8-1226-4446-8ea7-385b7c614c59",
    selections: [
      { serviceId: "website-base", quantity: 1, disposition: "core" },
    ],
  };
  assert.deepEqual(restorePendingGeneration(JSON.stringify(saved)), saved);
  assert.equal(shouldSwitchExample("no-website", "no-website"), false);
  assert.equal(shouldSwitchExample("no-website", "enquiry-flow"), true);
  assert.throws(() => restorePendingGeneration('{"requestId":"bad"}'));
});

test("services outside the AI suggestions can be added, are attributed to the operator and still obey prerequisites", () => {
  const rec = recordedFor("no-website");
  const ai = rec.selection.items.map(({ serviceId, quantity, disposition }) => ({
    serviceId,
    quantity,
    disposition,
  }));
  const added = adjustedSelection(rec.selection, [
    ...ai,
    { serviceId: "ai-visibility", quantity: 1, disposition: "optional" },
  ]).items.find((i) => i.serviceId === "ai-visibility");
  assert.deepEqual(added, {
    serviceId: "ai-visibility",
    quantity: 1,
    disposition: "optional",
    findingIds: [],
    rationale: "",
    addedBy: "operator",
  });
  const preview = previewRecommendation(reports[0], rec.selection, [
    ...ai,
    { serviceId: "ai-visibility", quantity: 1, disposition: "optional" },
  ]);
  assert.equal(preview?.optionalOneTimeMinor, 25000);
  // Catalogue overlaps still apply: technical SEO is included in a new website.
  assert.throws(
    () =>
      previewRecommendation(reports[0], rec.selection, [
        ...ai,
        { serviceId: "technical-seo", quantity: 1, disposition: "optional" },
      ]),
    /overlap_website_scope/,
  );
  // Without the website foundation, a website-dependent addition is refused.
  assert.throws(() =>
    previewRecommendation(reports[0], rec.selection, [
      { serviceId: "ai-visibility", quantity: 1, disposition: "core" },
    ]),
    /missing_prerequisite/,
  );
});

test("the model can never emit an operator item to skip the evidence check", async () => {
  const { validateSelection } = await import("../src/domain/selection.js");
  const { catalogueV2 } = await import("../src/domain/catalogue.js");
  assert.throws(() =>
    validateSelection(
      reports[0],
      {
        items: [
          {
            serviceId: "website-base",
            quantity: 1,
            disposition: "core",
            findingIds: [],
            rationale: "",
            addedBy: "operator",
          },
        ],
        questions: [],
        abstentionReason: null,
      },
      catalogueV2,
    ),
  );
});

test("other services explain why they cannot be added yet, from the same rules the server applies", async () => {
  const { serviceAvailability } = await import("../src/domain/workbench.js");
  const { catalogueV2 } = await import("../src/domain/catalogue.js");
  const noSite = reports[0],
    withSite = reports[1];
  const svc = (id: string) => catalogueV2.services.find((s) => s.id === id)!;
  assert.equal(serviceAvailability(svc("ai-visibility"), noSite, []).available, false);
  assert.equal(serviceAvailability(svc("ai-visibility"), noSite, ["website-base"]).available, true);
  assert.equal(serviceAvailability(svc("technical-seo"), noSite, ["website-base"]).available, false);
  assert.equal(serviceAvailability(svc("website-base"), withSite, []).available, false);
  assert.equal(serviceAvailability(svc("social-management"), noSite, []).available, true);
  assert.equal(serviceAvailability(svc("ads-management"), withSite, ["ads-setup"]).available, true);
  assert.match(serviceAvailability(svc("ai-visibility"), noSite, []).reason!, /website/i);
});
