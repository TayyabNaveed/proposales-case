import { test } from "node:test";
import assert from "node:assert/strict";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import recorded from "../src/domain/recorded-recommendations.json" with { type: "json" };
import { recommendationIdentity } from "../src/server/providers/recommendations.js";
import { prepareDraftSnapshot } from "../src/server/drafts.js";
import type { RecommendationRecord } from "../src/server/recommendations.js";
const report = reports[0],
  run = recorded.recommendations[0];
function recommendation(): RecommendationRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    inputHash: recommendationIdentity(
      report,
      catalogueV2,
      "reviewer",
      "deepseek-flash",
    ).inputHash,
    accessScope: "reviewer",
    state: "ready",
    report,
    catalogue: catalogueV2,
    identity: recommendationIdentity(
      report,
      catalogueV2,
      "reviewer",
      "deepseek-flash",
    ),
    result: run,
    diagnostics: null,
    errorCode: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    cacheHit: false,
  } as RecommendationRecord;
}
const selections = [
  { serviceId: "website-base", quantity: 1, disposition: "core" },
  { serviceId: "service-page", quantity: 2, disposition: "core" },
];
test("snapshot uses current catalogue prices and persisted rationale, independent of selection order", () => {
  const a = prepareDraftSnapshot(
    recommendation(),
    selections,
    report,
    catalogueV2,
    "reviewer",
    "deepseek-flash",
  );
  assert.equal(a.coreOneTimeMinor, 150000);
  assert.equal(a.coreMonthlyMinor, 0);
  assert.equal(
    a.items.find((i) => i.serviceId === "website-base")?.rationale,
    run.selection.items.find((i) => i.serviceId === "website-base")?.rationale,
  );
  assert.deepEqual(
    prepareDraftSnapshot(
      recommendation(),
      [...selections].reverse(),
      report,
      catalogueV2,
      "reviewer",
      "deepseek-flash",
    ),
    a,
  );
});
test("client prices, rationale, invented services and excessive quantities cannot enter a snapshot", () => {
  for (const raw of [
    [{ ...selections[0], unitPriceMinor: 1 }],
    [{ ...selections[0], rationale: "invented" }],
    [{ ...selections[0], serviceId: "ads-setup" }],
    [selections[0], { ...selections[1], quantity: 3 }],
    [],
    [selections[1]],
  ]) {
    assert.throws(() =>
      prepareDraftSnapshot(
        recommendation(),
        raw,
        report,
        catalogueV2,
        "reviewer",
        "deepseek-flash",
      ),
    );
  }
});
test("expired, wrong-scope, changed report/catalogue and failed recommendations cannot create drafts", () => {
  const a = recommendation();
  a.expiresAt = "2020-01-01T00:00:00Z";
  assert.throws(
    () =>
      prepareDraftSnapshot(
        a,
        selections,
        report,
        catalogueV2,
        "reviewer",
        "deepseek-flash",
      ),
    /stale_recommendation/,
  );
  assert.throws(
    () =>
      prepareDraftSnapshot(
        recommendation(),
        selections,
        report,
        catalogueV2,
        "other",
        "deepseek-flash",
      ),
    /recommendation_missing/,
  );
  const c = structuredClone(catalogueV2);
  c.services[0].unitPriceMinor = 1;
  assert.throws(
    () =>
      prepareDraftSnapshot(
        recommendation(),
        selections,
        report,
        c,
        "reviewer",
        "deepseek-flash",
      ),
    /stale_recommendation/,
  );
  const r = structuredClone(report);
  r.evidence[0].excerpt += " changed";
  assert.throws(
    () =>
      prepareDraftSnapshot(
        recommendation(),
        selections,
        r,
        catalogueV2,
        "reviewer",
        "deepseek-flash",
      ),
    /stale_recommendation/,
  );
  const failed = recommendation();
  failed.state = "failed";
  failed.result = null;
  assert.throws(() =>
    prepareDraftSnapshot(
      failed,
      selections,
      report,
      catalogueV2,
      "reviewer",
      "deepseek-flash",
    ),
  );
});
