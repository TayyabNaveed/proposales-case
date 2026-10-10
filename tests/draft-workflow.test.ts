import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftFromSnapshot } from "../src/server/workflow.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import recorded from "../src/domain/recorded-recommendations.json" with { type: "json" };
import { snapshotHash } from "../src/server/offers.js";
import type { OperationStore, Operation } from "../src/server/operations.js";
const uuid = "12345678-1234-4234-8234-123456789012",
  url = "https://secure.proposales.com/proposals/" + uuid + "/edit";
const snapshot = buildDraftSnapshot(
  reports[0],
  recorded.recommendations[0].selection as any,
  catalogueV2,
);
function setup() {
  let writes = 0;
  const rows = new Map<string, Operation & { hash: string }>();
  const operations: OperationStore = {
    async claim(k, h) {
      const r = rows.get(k);
      if (r) return r.hash === h ? "existing" : "conflict";
      rows.set(k, { state: "claimed", providerId: null, hash: h });
      return "claimed";
    },
    async get(k) {
      const r = rows.get(k);
      if (!r) throw Error("operation_missing");
      return r;
    },
    async record(k, o) {
      rows.set(k, { ...rows.get(k)!, ...o });
    },
  };
  const stored = {
    id: "00000000-0000-4000-8000-000000000002",
    requestId: "00000000-0000-4000-8000-000000000003",
    recommendationId: "00000000-0000-4000-8000-000000000001",
    accessScope: "reviewer",
    snapshot,
    snapshotHash: snapshotHash(snapshot),
    createdAt: new Date().toISOString(),
  };
  return {
    options: {
      snapshotId: stored.id,
      accessScope: "reviewer",
      companyId: "7",
      drafts: {
        async get(_id: string, scope: string) {
          if (scope !== stored.accessScope) throw Error("draft_missing");
          return stored;
        },
      },
      operations,
      provider: {
        async create() {
          writes++;
          return { uuid, url };
        },
        async inspect() {
          return { verified: true, issues: [] as string[] };
        },
        async find() {
          return [] as { uuid: string; snapshotHash: string; url?: string }[];
        },
      },
    },
    writes: () => writes,
    stored,
  };
}
test("creation uses immutable snapshot, retains URL, and repeat/read status makes no second write", async () => {
  const s = setup();
  const a = await createDraftFromSnapshot(s.options);
  assert.equal(a.state, "confirmed");
  assert.equal(a.editorUrl, url);
  const b = await createDraftFromSnapshot({ ...s.options, mode: "status" });
  assert.equal(b.providerId, uuid);
  assert.equal(s.writes(), 1);
  await createDraftFromSnapshot(s.options);
  assert.equal(s.writes(), 1);
});
test("wrong scope or corrupted stored snapshot fails before provider dispatch", async () => {
  const s = setup();
  await assert.rejects(
    () => createDraftFromSnapshot({ ...s.options, accessScope: "other" }),
    /draft_missing/,
  );
  s.stored.snapshotHash = "changed";
  await assert.rejects(
    () => createDraftFromSnapshot(s.options),
    /snapshot_tampered/,
  );
  assert.equal(s.writes(), 0);
});
test("failed fidelity/read retains existing identity and inspection URL without regeneration", async () => {
  const s = setup();
  s.options.provider.inspect = async () => ({
    verified: false,
    issues: ["block_quantity"],
  });
  const a = await createDraftFromSnapshot(s.options);
  assert.equal(a.state, "verification_failed");
  assert.equal(a.providerId, uuid);
  assert.equal(a.editorUrl, url);
  s.options.provider.inspect = async () => {
    throw Error("read failed");
  };
  await createDraftFromSnapshot(s.options);
  assert.equal(s.writes(), 1);
});
test("unknown creation is never repeated; only a unique positive metadata match reconciles it", async () => {
  const s = setup();
  s.options.provider.create = async () => {
    throw Error("lost response");
  };
  assert.equal((await createDraftFromSnapshot(s.options)).state, "unknown");
  assert.equal((await createDraftFromSnapshot(s.options)).state, "unknown");
  s.options.provider.find = async () => [{ uuid, snapshotHash: "wrong" }];
  assert.equal(
    (await createDraftFromSnapshot({ ...s.options, mode: "status" })).state,
    "unknown",
  );
  s.options.provider.find = async () => [
    { uuid, snapshotHash: s.stored.snapshotHash, url },
  ];
  const result = await createDraftFromSnapshot({
    ...s.options,
    mode: "status",
  });
  assert.equal(result.state, "confirmed");
  assert.equal(result.providerId, uuid);
});
test("status before any creation does not claim or create an operation", async () => {
  const s = setup();
  assert.equal(
    (await createDraftFromSnapshot({ ...s.options, mode: "status" })).state,
    "not_started",
  );
  assert.equal(s.writes(), 0);
});
