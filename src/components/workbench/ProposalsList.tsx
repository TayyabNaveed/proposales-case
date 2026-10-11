"use client";
import { useEffect, useState } from "react";
import { catalogueV2, money } from "../../domain/catalogue";
import { apiRequest, friendlyDate } from "./api";
import type { ProposalRow } from "../../server/proposals";

const statusLabel: Record<ProposalRow["status"], string> = {
  draft: "Draft · not sent",
  active: "Sent",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
  replaced: "Replaced by a newer version",
  not_created: "Not created in Proposales",
  unavailable: "Status unavailable",
};
const title = (id: string) => catalogueV2.services.find((s) => s.id === id)?.title ?? id;

// Proposals created from this app, with live status read from Proposales when
// the tab opens or on refresh. Sending and acceptance happen in Proposales.
export function ProposalsList({
  active,
  authenticated,
  onExpired,
}: {
  active: boolean;
  authenticated: boolean;
  onExpired(): void;
}) {
  const [rows, setRows] = useState<ProposalRow[] | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows((await apiRequest<{ proposals: ProposalRow[] }>("/api/proposals", undefined, onExpired)).proposals);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (active && authenticated) void load();
  }, [active, authenticated]);
  if (!authenticated)
    return <p className="caption">Enter the demo access code above to see your proposals.</p>;
  return (
    <section className="proposals">
      <div className="proposals-heading">
        <h2>Your proposals</h2>
        <button disabled={loading} onClick={() => void load()}>
          {loading ? "Checking status…" : "Refresh status"}
        </button>
      </div>
      <p className="caption">
        Status is read live from Proposales. Review, send and track acceptance there.
      </p>
      {error && <p role="alert">{error}</p>}
      {rows && !rows.length && <p>No proposals yet. Create one from a researched business or an example.</p>}
      {rows?.map((p) => (
        <article key={p.snapshotId} className="proposal-row">
          <header>
            <strong>{p.businessName}</strong>
            <span className={"status status-" + p.status}>{statusLabel[p.status]}</span>
          </header>
          <p className="caption">
            Created {friendlyDate(p.createdAt)}
            {p.statusChangedAt ? ` · status changed ${friendlyDate(p.statusChangedAt)}` : ""}
            {p.mode === "synthetic" ? " · example business" : ""}
            {p.recipient ? ` · for ${p.recipient.contactName ?? p.recipient.companyName}${p.recipient.email ? ` (${p.recipient.email})` : ""}` : ""}
          </p>
          <p>
            {money(p.totals.coreOneTimeMinor)} once
            {p.totals.coreMonthlyMinor ? ` + ${money(p.totals.coreMonthlyMinor)}/month` : ""}
            {p.totals.optionalOneTimeMinor || p.totals.optionalMonthlyMinor
              ? ` · optional ${money(p.totals.optionalOneTimeMinor)} once${p.totals.optionalMonthlyMinor ? ` + ${money(p.totals.optionalMonthlyMinor)}/month` : ""}`
              : ""}
          </p>
          <p className="caption">
            Kept {p.changes.kept} AI {p.changes.kept === 1 ? "suggestion" : "suggestions"}
            {p.changes.removed.length ? ` · removed ${p.changes.removed.map(title).join(", ")}` : ""}
            {p.changes.added.length ? ` · added by you ${p.changes.added.map(title).join(", ")}` : ""}
          </p>
          {!!p.questions.length && (
            <details>
              <summary>To confirm with the client ({p.questions.length})</summary>
              <ul>
                {p.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </details>
          )}
          {p.editorUrl && (
            <a className="button-link" href={p.editorUrl} target="_blank" rel="noopener noreferrer">
              Open in Proposales
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
