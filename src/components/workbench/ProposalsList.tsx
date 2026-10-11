"use client";
import { catalogueV2, money } from "../../domain/catalogue";
import { friendlyDate } from "./api";
import type { ProposalStatus } from "../../server/proposals";
import { statusLabel, statusOrder, type Proposals } from "./useProposals";

const title = (id: string) => catalogueV2.services.find((s) => s.id === id)?.title ?? id;

// Proposals created from this app, with live status read from Proposales.
// Sending and acceptance happen in Proposales.
export function ProposalsList({
  proposals,
  filter,
  onClearFilter,
}: {
  proposals: Proposals;
  filter: ProposalStatus | null;
  onClearFilter(): void;
}) {
  const { rows, loading, error, load } = proposals;
  const shown = rows?.filter((p) => !filter || p.status === filter);
  const filterName = statusOrder.find(([s]) => s === filter)?.[1];
  return (
    <section className="proposals">
      <div className="view-actions">
        <p className="caption">
          Status is read live from Proposales. Review, send and track acceptance there.
        </p>
        <button disabled={loading} onClick={() => void load()}>
          {loading ? "Checking status…" : "Refresh status"}
        </button>
      </div>
      {filter && (
        <p className="filter-note">
          Showing {filterName?.toLowerCase()} proposals only.{" "}
          <button className="text-action" onClick={onClearFilter}>
            Show all
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {rows && !rows.length && (
        <div className="empty">
          No proposals yet. Create one from a researched business or an example.
        </div>
      )}
      {shown?.map((p) => (
        <article key={p.snapshotId} className="proposal-row">
          <header>
            <h2>{p.businessName}</h2>
            <span className={"status-pill status-" + p.status}>{statusLabel[p.status]}</span>
          </header>
          <p className="caption">
            Created {friendlyDate(p.createdAt)}
            {p.statusChangedAt ? ` · status changed ${friendlyDate(p.statusChangedAt)}` : ""}
            {p.mode === "synthetic" ? " · example business" : ""}
            {p.recipient ? ` · for ${p.recipient.contactName ?? p.recipient.companyName}${p.recipient.email ? ` (${p.recipient.email})` : ""}` : ""}
          </p>
          <p className="proposal-total">
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
            <div className="principle">
              <h3>To confirm with the client</h3>
              <ul>
                {p.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {p.editorUrl && (
            <a className="button-link" href={p.editorUrl} target="_blank" rel="noopener noreferrer">
              Open in Proposales
            </a>
          )}
        </article>
      ))}
      {filter && rows && !shown?.length && (
        <p className="caption">No proposals with this status.</p>
      )}
    </section>
  );
}
