import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { adjustedSelection } from "../src/domain/workbench.js";
import { createRecommendationStore } from "../src/server/recommendations.js";
import { createDraftStore } from "../src/server/drafts.js";
import { recommendationIdentity } from "../src/server/providers/recommendations.js";
import { listProposals } from "../src/server/proposals.js";
import recorded from "../src/domain/recorded-recommendations.json" with { type: "json" };
loadLocalEnv();
test("the proposals list joins drafts to their Proposales proposal, live status and neutral scope changes", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    pool = createDatabase();
  try {
    for (const m of ["001_operations", "010_operation_errors", "003_recommendations_and_drafts"])
      await pool.query(fs.readFileSync(`db/migrations/${m}.sql`, "utf8").replaceAll("case_workflow", schema));
    const report = reports[0],
      scope = "reviewer",
      recs = createRecommendationStore(pool, schema, null),
      drafts = createDraftStore(pool, schema, null);
    const rec = await recs.admit(
      { identity: recommendationIdentity(report, catalogueV2, scope, "deepseek-flash"), report, catalogue: catalogueV2, accessScope: scope },
      false,
    );
    const run = recorded.recommendations[0] as any;
    await recs.finish(rec.record.id, scope, { result: run });
    // Keep the AI's website and pages, drop one suggestion, add one service.
    const kept = run.selection.items.filter((i: any) => i.serviceId !== "faq-content");
    const scoped = adjustedSelection(run.selection, [
      ...kept.map(({ serviceId, quantity, disposition }: any) => ({ serviceId, quantity, disposition })),
      { serviceId: "social-management", quantity: 1, disposition: "optional" },
    ]);
    const snapshot = {
      ...buildDraftSnapshot(report, scoped, catalogueV2),
      compositionVersion: "proposal-3" as const,
      presentation: { intro: "Hello.", recipient: { companyName: "Workshop AB", email: "info@workshop.example" } },
    };
    const created = await drafts.save(randomUUID(), rec.record.id, scope, snapshot);
    const providerId = randomUUID();
    await pool.query(
      `INSERT INTO "${schema}".provider_operations(operation_key,payload_hash,state,provider_id,editor_url) VALUES($1,$2,'confirmed',$3,$4)`,
      [`draft:42:${created.id}:${created.snapshotHash}`, created.snapshotHash, providerId, "https://secure.proposales.com/proposals/x/edit"],
    );
    const notCreated = await drafts.save(randomUUID(), rec.record.id, scope, { ...snapshot, presentation: { intro: "Other." } });
    await drafts.save(randomUUID(), rec.record.id, "someone-else", snapshot);
    const rows = await listProposals(pool, scope, "42", async (id) => {
      assert.equal(id, providerId);
      return { status: "accepted", statusChangedAt: 1760000000 };
    }, schema);
    assert.equal(rows.length, 2);
    const [latest, first] = rows;
    assert.equal(latest.snapshotId, notCreated.id);
    assert.equal(latest.status, "not_created");
    assert.equal(first.status, "accepted");
    assert.equal(first.statusChangedAt, new Date(1760000000 * 1000).toISOString());
    assert.equal(first.editorUrl, "https://secure.proposales.com/proposals/x/edit");
    assert.equal(first.businessName, report.businessName);
    assert.deepEqual(first.recipient, { companyName: "Workshop AB", email: "info@workshop.example" });
    assert.deepEqual(first.changes, { kept: kept.length, removed: ["faq-content"], added: ["social-management"] });
    assert.deepEqual(first.questions, run.selection.questions);
    // A failed status read never hides the proposal.
    const failing = await listProposals(pool, scope, "42", async () => { throw Error("down"); }, schema);
    assert.equal(failing.find((r) => r.snapshotId === created.id)?.status, "unavailable");
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
