import { randomUUID } from "node:crypto";
import type pg from "pg";
import { buildOffer, type OfferSnapshot } from "../domain/offers.js";
export type ApprovedOffer = {
  id: string;
  requestId: string;
  reviewerId: string;
  snapshot: OfferSnapshot;
  snapshotHash: string;
  approvedAt: string;
};
// Historical approval compatibility. Active services import canonical.ts directly.
export { canonicalJSON, snapshotHash } from "./canonical.js";
import { snapshotHash } from "./canonical.js";
export function createApprovalStore(pool: pg.Pool, schema = "case_workflow") {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const table = `"${schema}".approved_offers`;
  const projection = `id, request_id AS "requestId", reviewer_id AS "reviewerId", snapshot, snapshot_hash AS "snapshotHash", approved_at AS "approvedAt"`;
  return {
    async approve(requestId: string, input: unknown, reviewerId: string) {
      const snapshot = buildOffer(input);
      if (!snapshot.items.length) throw new Error("empty_offer");
      const hash = snapshotHash(snapshot);
      await pool.query(
        `INSERT INTO ${table}(id,request_id,reviewer_id,snapshot,snapshot_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id) DO NOTHING`,
        [randomUUID(), requestId, reviewerId, JSON.stringify(snapshot), hash],
      );
      const r = await pool.query(
        `SELECT ${projection} FROM ${table} WHERE request_id=$1`,
        [requestId],
      );
      const row = r.rows[0] as ApprovedOffer;
      if (!row || row.snapshotHash !== hash || row.reviewerId !== reviewerId)
        throw new Error("approval_conflict");
      return row;
    },
    async get(id: string, reviewerId: string) {
      const r = await pool.query(
        `SELECT ${projection} FROM ${table} WHERE id=$1 AND reviewer_id=$2`,
        [id, reviewerId],
      );
      if (r.rows.length !== 1) throw new Error("approval_missing");
      return r.rows[0] as ApprovedOffer;
    },
  };
}
