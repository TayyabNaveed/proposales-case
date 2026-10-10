import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createDatabase, createOperationStore } from "../src/server/db.js";
import { loadLocalEnv } from "../scripts/env.js";
loadLocalEnv();
test("atomic admission survives two pools, reconnect and contradictory outcomes", async () => {
  const schema = `case_test_${randomBytes(8).toString("hex")}`;
  const a = createDatabase();
  const b = createDatabase();
  let c: ReturnType<typeof createDatabase> | undefined;
  try {
    await a.query(
      fs
        .readFileSync("db/migrations/001_operations.sql", "utf8")
        .replaceAll("case_workflow", schema),
    );
    const first = createOperationStore(a, schema);
    const second = createOperationStore(b, schema);
    const claims = await Promise.all([
      first.claim("company7:offer1:v1", "hash1"),
      second.claim("company7:offer1:v1", "hash1"),
    ]);
    assert.deepEqual(claims.sort(), ["claimed", "existing"]);
    assert.equal(await second.claim("company7:offer1:v1", "hash2"), "conflict");
    await first.record("company7:offer1:v1", { state: "unknown" });
    await a.end();
    c = createDatabase();
    const third = createOperationStore(c, schema);
    assert.equal((await third.get("company7:offer1:v1")).state, "unknown");
    assert.equal(await third.claim("company7:offer1:v1", "hash1"), "existing");
    await third.record("company7:offer1:v1", {
      state: "confirmed",
      providerId: "12345678-1234-4234-8234-123456789012",
    });
    await assert.rejects(
      () => third.record("company7:offer1:v1", { state: "unknown" }),
      /transition_conflict/,
    );
  } finally {
    // Only this test's randomly named isolated schema is removed.
    await b.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await b.end();
    if (c) await c.end();
    else await a.end();
  }
});
