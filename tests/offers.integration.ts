import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
import { createApprovalStore } from "../src/server/offers.js";
loadLocalEnv();
test("immutable approvals survive concurrent requests, edits and reconnect", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex");
  const a = createDatabase(),
    b = createDatabase();
  let c: ReturnType<typeof createDatabase> | undefined;
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
    const input = {
      exampleId: "no-website",
      catalogueVersion: "demo-2",
      selections: [{ serviceId: "website-base", quantity: 1 }],
    };
    const id = randomUUID();
    const first = createApprovalStore(a, schema),
      second = createApprovalStore(b, schema);
    const [x, y] = await Promise.all([
      first.approve(id, input, "reviewer"),
      second.approve(id, input, "reviewer"),
    ]);
    assert.equal(x.id, y.id);
    assert.equal(x.snapshotHash, y.snapshotHash);
    const changed = {
      ...input,
      selections: [
        { serviceId: "website-base", quantity: 1 },
        { serviceId: "service-page", quantity: 2 },
      ],
    };
    await assert.rejects(
      () => second.approve(id, changed, "reviewer"),
      /approval_conflict/,
    );
    await assert.rejects(() => second.get(x.id, "other"), /approval_missing/);
    const edited = await second.approve(randomUUID(), changed, "reviewer");
    assert.notEqual(edited.id, x.id);
    assert.notEqual(edited.snapshotHash, x.snapshotHash);
    await a.end();
    c = createDatabase();
    const stored = await createApprovalStore(c, schema).get(x.id, "reviewer");
    assert.equal(stored.snapshot.items[0].quantity, 1);
  } finally {
    await b.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await b.end();
    if (c) await c.end();
    else await a.end();
  }
});
