import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
import { consumeLoginAttempt } from "../src/server/access-store.js";
loadLocalEnv();
test("login limit persists across clients and resets only after database expiry", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex");
  const a = createDatabase(),
    b = createDatabase();
  try {
    await a.query(
      fs
        .readFileSync("db/migrations/001_operations.sql", "utf8")
        .replaceAll("case_workflow", schema),
    );
    await a.query(
      fs
        .readFileSync("db/migrations/002_offers.sql", "utf8")
        .replaceAll("case_workflow", schema),
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        consumeLoginAttempt(i % 2 ? a : b, "test-bucket", schema),
      ),
    );
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal(await consumeLoginAttempt(b, "test-bucket", schema), false);
    await a.query(
      `UPDATE "${schema}".access_attempts SET expires_at=now()-interval '1 second' WHERE bucket=$1`,
      ["test-bucket"],
    );
    assert.equal(await consumeLoginAttempt(b, "test-bucket", schema), true);
  } finally {
    await b.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await a.end();
    await b.end();
  }
});
