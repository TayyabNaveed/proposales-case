import type pg from "pg";
import type { DraftSnapshot } from "../domain/offers.js";
// The proposals this app created, newest first, with each proposal's live status
// read from Proposales. Proposales has no send or status API for us to call, so
// status is read on demand; a failed read is shown, never hidden.
export type ProposalStatus =
  | "draft"
  | "active"
  | "accepted"
  | "rejected"
  | "expired"
  | "withdrawn"
  | "replaced"
  | "not_created"
  | "unavailable";
export type ProposalRow = {
  snapshotId: string;
  createdAt: string;
  businessName: string;
  mode: "synthetic" | "live";
  totals: { coreOneTimeMinor: number; coreMonthlyMinor: number; optionalOneTimeMinor: number; optionalMonthlyMinor: number };
  recipient: NonNullable<DraftSnapshot["presentation"]>["recipient"] | null;
  // Neutral record of the operator's scope decisions against the AI suggestions.
  changes: { kept: number; removed: string[]; added: string[] };
  questions: string[];
  providerId: string | null;
  editorUrl: string | null;
  // Proposales' current link for the proposal: the editor for a draft, its view
  // once accepted. Read live; null when unavailable.
  liveUrl: string | null;
  // The accepted document, when Proposales provides one; read live with status.
  pdfUrl: string | null;
  status: ProposalStatus;
  statusChangedAt: string | null;
};
type StatusReader = (
  providerId: string,
  operationKey: string,
) => Promise<{
  status: string | null;
  statusChangedAt: number | null;
  pdfUrl?: string | null;
  url?: string | null;
}>;
const known = new Set(["draft", "active", "accepted", "rejected", "expired", "withdrawn", "replaced"]);

export async function listProposals(
  pool: pg.Pool,
  scope: string,
  companyId: string,
  readStatus: StatusReader,
  schema = "case_workflow",
  limit = 20,
): Promise<ProposalRow[]> {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema)) throw new Error("invalid_schema");
  if (!/^[1-9]\d*$/.test(companyId)) throw new Error("provider_configuration_missing");
  // The operation key is deterministic per snapshot (see workflow.ts).
  const r = await pool.query(
    `SELECT d.id, d.created_at, d.snapshot, r.result->'selection'->'items' AS suggested,
            d.snapshot_hash, o.state AS op_state, o.provider_id, o.editor_url
       FROM "${schema}".draft_snapshots d
       LEFT JOIN "${schema}".recommendation_runs r ON r.id = d.recommendation_id
       LEFT JOIN "${schema}".provider_operations o
         ON o.operation_key = 'draft:' || $2 || ':' || d.id || ':' || d.snapshot_hash
      WHERE d.access_scope = $1
      ORDER BY d.created_at DESC
      LIMIT $3`,
    [scope, companyId, limit],
  );
  const keys = new Map<string, string>();
  const rows = r.rows.map((x): ProposalRow => {
    keys.set(x.id, `draft:${companyId}:${x.id}:${x.snapshot_hash}`);
    const s = x.snapshot as DraftSnapshot;
    const suggested = new Set<string>((x.suggested ?? []).map((i: { serviceId: string }) => i.serviceId));
    const chosen = s.items.map((i) => i.serviceId);
    return {
      snapshotId: x.id,
      createdAt: x.created_at.toISOString(),
      businessName: s.report.businessName,
      mode: s.report.mode,
      totals: {
        coreOneTimeMinor: s.coreOneTimeMinor,
        coreMonthlyMinor: s.coreMonthlyMinor,
        optionalOneTimeMinor: s.optionalOneTimeMinor,
        optionalMonthlyMinor: s.optionalMonthlyMinor,
      },
      recipient: s.presentation?.recipient ?? null,
      changes: {
        kept: chosen.filter((id) => suggested.has(id)).length,
        removed: [...suggested].filter((id) => !chosen.includes(id)),
        added: chosen.filter((id) => !suggested.has(id)),
      },
      questions: s.questions,
      providerId: x.op_state === "confirmed" ? x.provider_id : null,
      editorUrl: x.op_state === "confirmed" ? x.editor_url : null,
      liveUrl: null,
      pdfUrl: null,
      status: x.op_state === "confirmed" ? "unavailable" : "not_created",
      statusChangedAt: null,
    };
  });
  // Live status, a few reads at a time.
  const pending = rows.filter((row) => row.providerId);
  for (let i = 0; i < pending.length; i += 4)
    await Promise.all(
      pending.slice(i, i + 4).map(async (row) => {
        try {
          const live = await readStatus(row.providerId!, keys.get(row.snapshotId)!);
          row.status = live.status && known.has(live.status) ? (live.status as ProposalStatus) : "unavailable";
          row.statusChangedAt = live.statusChangedAt ? new Date(live.statusChangedAt * 1000).toISOString() : null;
          row.pdfUrl = live.pdfUrl ?? null;
          row.liveUrl = live.url ?? null;
        } catch {
          row.status = "unavailable";
        }
      }),
    );
  return rows;
}
