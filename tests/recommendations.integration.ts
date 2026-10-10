import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
import {
  createRecommendationStore,
  createRecommendationService,
} from "../src/server/recommendations.js";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { recommendationIdentity } from "../src/server/providers/recommendations.js";
loadLocalEnv();
const valid = {
  items: [
    {
      serviceId: "website-base",
      quantity: 1,
      disposition: "core",
      findingIds: ["nf1"],
      rationale: "Owner confirms no website.",
    },
  ],
  questions: [],
  abstentionReason: null,
};
const response = () =>
  new Response(
    JSON.stringify({
      id: "test",
      object: "chat.completion",
      created: 1,
      model: "deepseek-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(valid) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    }),
    { headers: { "content-type": "application/json" } },
  );

test("database admission deduplicates paid calls across clients, caches only success, isolates scope and survives reconnect", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    a = createDatabase(),
    b = createDatabase();
  let c: ReturnType<typeof createDatabase> | undefined;
  try {
    await a.query(`CREATE SCHEMA "${schema}"`);
    await a.query(
      fs
        .readFileSync(
          "db/migrations/003_recommendations_and_drafts.sql",
          "utf8",
        )
        .replaceAll("case_workflow", schema),
    );
    const store = createRecommendationStore(a, schema, 20),
      storeB = createRecommendationStore(b, schema, 20);
    let calls = 0,
      release!: () => void,
      entered!: () => void;
    let gate = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const fetcher: typeof fetch = async () => {
      calls++;
      entered();
      await gate;
      return response();
    };
    const service = createRecommendationService(store, {
      model: "deepseek-flash",
      apiKey: "synthetic",
      fetch: fetcher,
    });
    const other = createRecommendationService(storeB, {
      model: "deepseek-flash",
      apiKey: "synthetic",
      fetch: fetcher,
    });
    const first = service.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      false,
    );
    await started;
    const concurrent = await other.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      false,
    );
    assert.equal(concurrent.state, "running");
    assert.equal(calls, 1);
    release();
    const ready = await first;
    assert.equal(ready.state, "ready");
    assert.equal(ready.id, concurrent.id);
    const cached = await other.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      false,
    );
    assert.equal(cached.id, ready.id);
    assert.equal(cached.cacheHit, true);
    assert.equal(calls, 1);
    gate = new Promise<void>((r) => {
      release = r;
    });
    started = new Promise<void>((r) => {
      entered = r;
    });
    const refresh = service.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      true,
    );
    await started;
    const refreshConcurrent = await other.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      true,
    );
    assert.equal(refreshConcurrent.state, "running");
    assert.equal(calls, 2);
    release();
    const fresh = await refresh;
    assert.notEqual(fresh.id, ready.id);
    assert.equal(fresh.id, refreshConcurrent.id);
    await assert.rejects(
      () => storeB.get(ready.id, "scope-b"),
      /recommendation_missing/,
    );
    const isolated = await other.getOrCreateRecommendation(
      "no-website",
      "scope-b",
      false,
    );
    assert.notEqual(isolated.id, fresh.id);
    assert.equal(calls, 3);
    await a.end();
    c = createDatabase();
    const persisted = await createRecommendationStore(c, schema, 20).get(
      fresh.id,
      "scope-a",
    );
    assert.equal(
      persisted.result?.selection.items[0].serviceId,
      "website-base",
    );
    const fail = createRecommendationService(storeB, {
      model: "failure-model",
      apiKey: "synthetic",
      fetch: async () => {
        calls++;
        return new Response("secret", { status: 500 });
      },
    });
    const failed = await fail.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      false,
    );
    assert.equal(failed.state, "failed");
    assert.equal(failed.result, null);
    assert.equal(failed.errorCode, "recommendation_call_failed");
    const n = calls;
    const failedAgain = await fail.getOrCreateRecommendation(
      "no-website",
      "scope-a",
      false,
    );
    assert.equal(failedAgain.id, failed.id);
    assert.equal(failedAgain.cacheHit, false);
    assert.equal(calls, n);
    await fail.getOrCreateRecommendation("no-website", "scope-a", true);
    assert.equal(calls, n + 1);
    await b.query(
      `UPDATE "${schema}".recommendation_runs SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [isolated.id],
    );
    const expired = await other.getOrCreateRecommendation(
      "no-website",
      "scope-b",
      false,
    );
    assert.notEqual(expired.id, isolated.id);
  } finally {
    await b.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await b.end();
    await (c ?? a).end();
  }
});

test("stalled runs require explicit restart, and admission enforces a durable per-scope budget", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    pool = createDatabase();
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(
      fs
        .readFileSync(
          "db/migrations/003_recommendations_and_drafts.sql",
          "utf8",
        )
        .replaceAll("case_workflow", schema),
    );
    const store = createRecommendationStore(pool, schema, 20),
      identity = recommendationIdentity(
        reports[0],
        catalogueV2,
        "budget",
        "deepseek-flash",
      );
    const input = {
      identity,
      report: reports[0],
      catalogue: catalogueV2,
      accessScope: "budget",
    };
    const first = await store.admit(input, false);
    assert.equal(first.claimed, true);
    await pool.query(
      `UPDATE "${schema}".recommendation_runs SET created_at=now()-interval '3 minutes' WHERE id=$1`,
      [first.record.id],
    );
    assert.equal((await store.admit(input, false)).claimed, false);
    const restart = await store.admit(input, true);
    assert.equal(restart.claimed, true);
    assert.notEqual(restart.record.id, first.record.id);
    assert.equal(
      (await store.get(first.record.id, "budget")).errorCode,
      "recommendation_interrupted",
    );
    for (let i = 2; i < 20; i++)
      await store.admit(
        {
          ...input,
          identity: { ...identity, inputHash: String(i).padStart(64, "0") },
        },
        false,
      );
    await assert.rejects(
      () =>
        store.admit(
          { ...input, identity: { ...identity, inputHash: "f".repeat(64) } },
          false,
        ),
      /recommendation_budget_exceeded/,
    );
    assert.equal(
      (await store.admit(input, false)).record.id,
      restart.record.id,
    );
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
