import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOffer } from "../src/domain/offers.js";
import { snapshotHash } from "../src/server/offers.js";
import { createReviewedDraft } from "../src/server/workflow.js";
import type { OperationStore, Operation } from "../src/server/operations.js";
const snapshot = buildOffer({
  exampleId: "no-website",
  catalogueVersion: "demo-2",
  selections: [{ serviceId: "website-base", quantity: 1 }],
});
const approved = {
  id: "approval1",
  requestId: "request1",
  reviewerId: "reviewer",
  snapshot,
  snapshotHash: snapshotHash(snapshot),
  approvedAt: "2026-10-09",
};
function setup() {
  const rows = new Map<string, Operation & { hash: string }>();
  let writes = 0;
  const store: OperationStore = {
    async claim(k, h) {
      const r = rows.get(k);
      if (r) return r.hash === h ? "existing" : "conflict";
      rows.set(k, { hash: h, state: "claimed", providerId: null });
      return "claimed";
    },
    async get(k) {
      return rows.get(k)!;
    },
    async record(k, o) {
      rows.set(k, { ...rows.get(k)!, ...o });
    },
  };
  return {
    options: {
      approvalId: approved.id,
      reviewerId: "reviewer",
      expectedHash: approved.snapshotHash,
      companyId: "company7",
      approvals: {
        async get() {
          return approved;
        },
      },
      operations: store,
      provider: {
        async create(s: typeof snapshot) {
          writes++;
          assert.deepEqual(s, snapshot);
          return { uuid: "12345678-1234-4234-8234-123456789012" };
        },
        async verify(): Promise<{ editorUrl: string } | null> {
          return { editorUrl: "https://secure.proposales.com/verified-editor" };
        },
      },
    },
    writes: () => writes,
  };
}
test("stale approval hash prevents a provider write", async () => {
  const s = setup();
  await assert.rejects(
    () => createReviewedDraft({ ...s.options, expectedHash: "edited" }),
    /stale_approval/,
  );
  assert.equal(s.writes(), 0);
});
test("repeat creation reuses operation and verifies stored terms", async () => {
  const s = setup();
  assert.equal((await createReviewedDraft(s.options)).state, "confirmed");
  assert.equal((await createReviewedDraft(s.options)).state, "confirmed");
  assert.equal(s.writes(), 1);
});
test("unknown outcome never redispatches and mismatch never claims fidelity", async () => {
  const s = setup();
  s.options.provider.create = async () => {
    throw Error("timeout");
  };
  assert.equal((await createReviewedDraft(s.options)).state, "unknown");
  assert.equal((await createReviewedDraft(s.options)).state, "unknown");
  const other = setup();
  other.options.provider.verify = async () => null;
  assert.equal(
    (await createReviewedDraft(other.options)).state,
    "verification_failed",
  );
  await createReviewedDraft(other.options);
  assert.equal(other.writes(), 1);
});
