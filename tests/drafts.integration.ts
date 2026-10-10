import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase, createOperationStore } from "../src/server/db.js";
import { createDraftService, createDraftStore } from "../src/server/drafts.js";
import { createRecommendationStore } from "../src/server/recommendations.js";
import { recommendationIdentity } from "../src/server/providers/recommendations.js";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import recorded from "../src/domain/recorded-recommendations.json" with { type: "json" };
import { createDraftFromSnapshot } from "../src/server/workflow.js";
loadLocalEnv();
test("snapshot admission and provider identity/link survive concurrency, conflicts, quotas and reconnect", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    a = createDatabase(),
    b = createDatabase();
  let c: ReturnType<typeof createDatabase> | undefined;
  try {
    for (const name of ["001_operations", "003_recommendations_and_drafts"])
      await a.query(
        fs
          .readFileSync("db/migrations/" + name + ".sql", "utf8")
          .replaceAll("case_workflow", schema),
      );
    const recs = createRecommendationStore(a, schema);
    const report = reports[0],
      scope = "test",
      model = "deepseek-flash";
    const admitted = await recs.admit(
      {
        identity: recommendationIdentity(report, catalogueV2, scope, model),
        report,
        catalogue: catalogueV2,
        accessScope: scope,
      },
      false,
    );
    const run = recorded.recommendations[0] as any;
    await recs.finish(admitted.record.id, scope, { result: run });
    const snapshot = buildDraftSnapshot(report, run.selection, catalogueV2),
      first = createDraftStore(a, schema, 10),
      second = createDraftStore(b, schema, 10),
      requestId = randomUUID();
    const results = await Promise.all([
      first.save(requestId, admitted.record.id, scope, snapshot),
      second.save(requestId, admitted.record.id, scope, snapshot),
    ]);
    assert.equal(results[0].id, results[1].id);
    await assert.rejects(
      () =>
        second.save(requestId, admitted.record.id, scope, {
          ...snapshot,
          questions: ["Changed"],
        }),
      /draft_request_conflict/,
    );
    await assert.rejects(
      () => second.get(results[0].id, "other"),
      /draft_missing/,
    );
    await a.query(
      `UPDATE "${schema}".recommendation_runs SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [admitted.record.id],
    );
    const recover = createDraftService(b, { schema, model });
    const picks = snapshot.items.map(
      ({ serviceId, quantity, disposition }) => ({
        serviceId,
        quantity,
        disposition,
      }),
    );
    assert.equal(
      (
        await recover.getOrCreateDraftSnapshot(
          requestId,
          admitted.record.id,
          [...picks].reverse(),
          scope,
        )
      ).id,
      results[0].id,
    );
    await assert.rejects(
      recover.getOrCreateDraftSnapshot(
        requestId,
        admitted.record.id,
        picks.slice(1),
        scope,
      ),
      /draft_request_conflict/,
    );
    let writes = 0;
    const provider = {
      async create() {
        writes++;
        return {
          uuid: "12345678-1234-4234-8234-123456789012",
          url: "https://secure.proposales.com/existing-editor",
        };
      },
      async inspect() {
        return { verified: true, issues: [] as string[] };
      },
      async find() {
        return [] as { uuid: string; snapshotHash: string }[];
      },
    };
    const options = {
      snapshotId: results[0].id,
      accessScope: scope,
      companyId: "7",
      drafts: first,
      operations: createOperationStore(a, schema),
      provider,
    };
    await Promise.all([
      createDraftFromSnapshot(options),
      createDraftFromSnapshot({
        ...options,
        drafts: second,
        operations: createOperationStore(b, schema),
      }),
    ]);
    assert.equal(writes, 1);
    await a.end();
    c = createDatabase();
    const result = await createDraftFromSnapshot({
      ...options,
      drafts: createDraftStore(c, schema, 10),
      operations: createOperationStore(c, schema),
      mode: "status",
    });
    assert.equal(result.state, "confirmed");
    assert.equal(
      result.editorUrl,
      "https://secure.proposales.com/existing-editor",
    );
    assert.equal(writes, 1);
    for (let i = 1; i < 10; i++)
      await second.save(randomUUID(), admitted.record.id, scope, snapshot);
    await assert.rejects(
      () => second.save(randomUUID(), admitted.record.id, scope, snapshot),
      /draft_budget_exceeded/,
    );
    assert.equal(
      (await second.save(requestId, admitted.record.id, scope, snapshot)).id,
      results[0].id,
    );
  } finally {
    await b.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await b.end();
    await (c ?? a).end();
  }
});
