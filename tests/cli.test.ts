import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { draftEvidence } from "../src/server/discovery.js";
test("migration configuration failure never prints the credential-bearing URI", () => {
  const secret = "SYNTHETIC_PASSWORD_NOT_REAL";
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://user:${secret}@invalid host/db`,
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.equal((result.stdout + result.stderr).includes(secret), false);
  assert.match(result.stderr, /"ok":false/);
});
test("missing metadata search match fails discovery while preserving known draft fact", () => {
  assert.deepEqual(
    draftEvidence(
      {
        status: "draft",
        data: { case_operation: "op" },
        recipient_is_set: false,
      },
      [],
      "uuid",
      "op",
    ),
    { ok: false, searchFindsDraft: false },
  );
  assert.deepEqual(
    draftEvidence(
      {
        status: "draft",
        data: { case_operation: "op" },
        recipient_is_set: false,
      },
      [{ uuid: "uuid" }],
      "uuid",
      "op",
    ),
    { ok: true, searchFindsDraft: true },
  );
});
