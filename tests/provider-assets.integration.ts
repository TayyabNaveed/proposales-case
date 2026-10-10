import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
import {
  createAssetStore,
  getServiceMapping,
} from "../src/server/provider-assets.js";
loadLocalEnv();
test("asset admission is durable across clients and reconnect, IDs and image readiness remain separate", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    a = createDatabase(),
    b = createDatabase();
  let c: ReturnType<typeof createDatabase> | undefined;
  try {
    await a.query(`CREATE SCHEMA "${schema}"`);
    await a.query(
      fs
        .readFileSync("db/migrations/004_provider_assets.sql", "utf8")
        .replaceAll("case_workflow", schema),
    );
    const first = createAssetStore(a, schema),
      second = createAssetStore(b, schema),
      key = "company:1:catalogue:demo-2:service:website-base",
      hash = "a".repeat(64);
    const states = await Promise.all([
      first.claim(key, hash),
      second.claim(key, hash),
    ]);
    assert.deepEqual(states.sort(), ["claimed", "existing"]);
    assert.equal(await second.claim(key, "b".repeat(64)), "conflict");
    await first.record(key, { productId: 10, variationId: 20 });
    await assert.rejects(
      () => getServiceMapping(second, "1", "website-base", "demo-2"),
      /asset_not_verified/,
    );
    await second.verifyImage(key, "00000000-0000-4000-8000-000000000001");
    await a.end();
    c = createDatabase();
    assert.equal(
      (
        await getServiceMapping(
          createAssetStore(c, schema),
          "1",
          "website-base",
          "demo-2",
        )
      ).variationId,
      20,
    );
    await assert.rejects(
      () => second.record(key, null),
      /asset_transition_conflict/,
    );
  } finally {
    await b.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await b.end();
    await (c ?? a).end();
  }
});
