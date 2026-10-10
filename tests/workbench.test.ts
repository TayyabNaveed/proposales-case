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
test("adjustments preserve AI reasons, and removing foundation or inventing quantity fails preview validation", () => {
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
  assert.throws(() =>
    adjustedSelection(rec.selection, [
      { serviceId: "service-page", quantity: 3, disposition: "core" },
    ]),
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
