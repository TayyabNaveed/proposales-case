import { test } from "node:test";
import assert from "node:assert/strict";
import { listProposals } from "../src/server/proposals.js";
import { reports } from "../src/domain/reports.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { recordedFor } from "../src/domain/workbench.js";

test("uncertain provider operations are never presented as not created", async () => {
  const snapshot = buildDraftSnapshot(
    reports[0],
    recordedFor(reports[0].id).selection,
    catalogueV2,
  );
  const pool = {
    async query() {
      return {
        rows: [null, "rejected", "claimed", "unknown"].map((state, i) => ({
          id: String(i),
          created_at: new Date(),
          snapshot,
          snapshot_hash: "hash",
          op_state: state,
        })),
      };
    },
  };
  const rows = await listProposals(pool as any, "scope", "42", async () => {
    throw Error("must not read a missing provider id");
  });
  assert.deepEqual(
    rows.map((r) => r.status),
    ["not_created", "not_created", "outcome_unknown", "outcome_unknown"],
  );
});
