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
import { activePrompts } from "../src/prompts/active.js";
// Recorded under an earlier selector version; stamped with the active one.
const currentRun = () =>
  ({
    ...recorded.recommendations[0],
    promptVersion: activePrompts.selection.version,
  }) as any;
loadLocalEnv();
test("snapshot admission and provider identity/link survive concurrency, conflicts, quotas and reconnect", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    a = createDatabase(),
    b = createDatabase();
  let c: ReturnType<typeof createDatabase> | undefined;
  try {
    for (const name of ["001_operations", "010_operation_errors", "003_recommendations_and_drafts"])
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
    const run = currentRun();
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
    // New requests need live suggestions; the budget is what is under test here.
    await c.query(
      `UPDATE "${schema}".recommendation_runs SET expires_at=now()+interval '1 hour' WHERE id=$1`,
      [admitted.record.id],
    );
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

test("category assets are pinned before save; restored requests do not read mutable assets after expiry or reconnect", async () => {
  const { categorySnapshot } = await import("./category-fixtures.js");
  const schema = "case_test_" + randomBytes(8).toString("hex");
  const db = createDatabase();
  try {
    for (const name of ["001_operations", "010_operation_errors", "003_recommendations_and_drafts"])
      await db.query(
        fs
          .readFileSync("db/migrations/" + name + ".sql", "utf8")
          .replaceAll("case_workflow", schema),
      );
    const report = reports[0],
      scope = "category-test",
      model = "deepseek-flash";
    const recs = createRecommendationStore(db, schema);
    const admitted = await recs.admit(
      {
        identity: recommendationIdentity(report, catalogueV2, scope, model),
        report,
        catalogue: catalogueV2,
        accessScope: scope,
      },
      false,
    );
    await recs.finish(admitted.record.id, scope, {
      result: currentRun(),
    });
    const picks = categorySnapshot().items.map(
      ({ serviceId, quantity, disposition }) => ({
        serviceId,
        quantity,
        disposition,
      }),
    );
    const request = randomUUID();
    let resolutions = 0;
    const service = createDraftService(db, {
      schema,
      model,
      compositionAssets: async () => {
        resolutions++;
        return categorySnapshot().compositionAssets!;
      },
    });
    const saved = await service.getOrCreateDraftSnapshot(
      request,
      admitted.record.id,
      picks,
      scope,
    );
    assert.equal(saved.snapshot.compositionVersion, "proposal-5");
    assert.deepEqual(
      saved.snapshot.compositionAssets,
      categorySnapshot().compositionAssets,
    );
    // The proposal-4 opt-out pins the same assets under its own version.
    const optOut = await createDraftService(db, {
      schema,
      model,
      categoryComposition: "proposal-4",
      compositionAssets: async () => categorySnapshot().compositionAssets!,
    }).getOrCreateDraftSnapshot(randomUUID(), admitted.record.id, picks, scope);
    assert.equal(optOut.snapshot.compositionVersion, "proposal-4");
    assert.equal(resolutions, 1);
    const failing = createDraftService(db, {
      schema,
      model,
      compositionAssets: async () => {
        throw Error("asset_not_verified");
      },
    });
    const failedRequest = randomUUID();
    await assert.rejects(
      failing.getOrCreateDraftSnapshot(
        failedRequest,
        admitted.record.id,
        picks,
        scope,
      ),
      /asset_not_verified/,
    );
    assert.equal(
      await createDraftStore(db, schema).findRequest(failedRequest, scope),
      null,
    );
    await db.query(
      `UPDATE "${schema}".recommendation_runs SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [admitted.record.id],
    );
    const restored = await failing.getOrCreateDraftSnapshot(
      request,
      admitted.record.id,
      [...picks].reverse(),
      scope,
    );
    assert.deepEqual(restored, saved);
    await assert.rejects(
      failing.getOrCreateDraftSnapshot(
        request,
        admitted.record.id,
        picks.slice(1),
        scope,
      ),
      /draft_request_conflict/,
    );
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
});
test("an absent request is resolved as expired only once no save can still land", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    db = createDatabase(),
    other = createDatabase();
  try {
    for (const name of ["001_operations", "010_operation_errors", "003_recommendations_and_drafts"])
      await db.query(
        fs
          .readFileSync("db/migrations/" + name + ".sql", "utf8")
          .replaceAll("case_workflow", schema),
      );
    const recs = createRecommendationStore(db, schema),
      report = reports[0],
      scope = "test",
      run = currentRun();
    const admitted = await recs.admit(
      {
        identity: recommendationIdentity(report, catalogueV2, scope, "deepseek-flash"),
        report,
        catalogue: catalogueV2,
        accessScope: scope,
      },
      false,
    );
    await recs.finish(admitted.record.id, scope, { result: run });
    const rec = admitted.record.id,
      store = createDraftStore(db, schema, 10),
      snapshot = buildDraftSnapshot(report, run.selection, catalogueV2),
      saved = randomUUID(),
      unsaved = randomUUID(),
      racing = randomUUID();
    const first = await store.save(saved, rec, scope, snapshot);
    assert.deepEqual(await store.resolveRequest(unsaved, rec, scope), {
      snapshot: null,
      expired: false,
    });
    const expire = (sql: string) =>
      db.query(`UPDATE "${schema}".recommendation_runs SET expires_at=${sql} WHERE id=$1`, [rec]);
    await expire("now()-interval '1 second'");
    await assert.rejects(store.save(unsaved, rec, scope, snapshot), /stale_recommendation/);
    assert.equal((await store.save(saved, rec, scope, snapshot)).id, first.id);
    assert.deepEqual(await store.resolveRequest(unsaved, rec, scope), {
      snapshot: null,
      expired: true,
    });
    const found = await store.resolveRequest(saved, rec, scope);
    assert.equal(found.snapshot?.id, first.id);
    assert.equal(found.expired, false);
    // Another scope's recommendation can never save this scope's request.
    assert.equal((await store.resolveRequest(unsaved, rec, "someone-else")).expired, true);

    // A save that passed the expiry check before expiry still wins the race.
    await expire("clock_timestamp()+interval '1 second'");
    const writer = await other.connect();
    try {
      await writer.query("BEGIN");
      await writer.query(
        `SELECT 1 FROM "${schema}".recommendation_runs WHERE id=$1 FOR SHARE`,
        [rec],
      );
      await writer.query(
        `INSERT INTO "${schema}".draft_snapshots(id,request_id,recommendation_id,access_scope,snapshot,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), racing, rec, scope, JSON.stringify(snapshot), "a".repeat(64)],
      );
      let settled = false;
      const reader = store.resolveRequest(racing, rec, scope).finally(() => {
        settled = true;
      });
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(settled, false, "the reader waits for the in-flight save");
      await writer.query("COMMIT");
      const result = await reader;
      assert.equal(result.expired, false);
      assert.equal(result.snapshot?.requestId, racing);
    } finally {
      writer.release();
    }
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
    await other.end();
  }
});
