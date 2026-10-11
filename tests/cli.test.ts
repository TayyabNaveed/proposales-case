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
test("category dry-run emits only five planned imports without requiring credentials", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/seed-proposal-categories.ts",
      "--dry-run",
      "--origin",
      "https://proposales-case.vercel.app",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      // No credentials: the dry run must need none.
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.mode, "--dry-run");
  assert.equal(manifest.assets.length, 5);
  assert.ok(
    manifest.assets.every((a: { imageUrl: string }) =>
      a.imageUrl.endsWith(".png"),
    ),
  );
});
