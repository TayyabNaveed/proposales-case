import type { ReportV2 } from "../../domain/reports";
import { friendlyDate } from "./api";
export function ReportView({ report }: { report: ReportV2 }) {
  return (
    <section className="report">
      <p className="eyebrow">01 / UNDERSTAND</p>
      <h2>{report.businessName}</h2>
      <p className="summary">{report.summary}</p>
      {report.mode === "live" && (
        <p className="freshness">
          Researched {friendlyDate(report.evidence[0]?.retrievedAt)}
        </p>
      )}
      {!!report.goals.length && (
        <>
          <h3>What the owner wants</h3>
          <ul>
            {report.goals.map((g) => (
              <li key={g.sourceId}>{g.text}</li>
            ))}
          </ul>
        </>
      )}
      <div className="findings">
        {report.findings.slice(0, 3).map((f) => (
          <article key={f.id}>
            <span className={"kind " + f.kind}>
              {f.kind === "observed"
                ? report.mode === "synthetic"
                  ? "Example information"
                  : "From public sources"
                : f.kind === "inferred"
                  ? "Opportunity"
                  : "Needs confirmation"}
            </span>
            <p>{f.claim}</p>
          </article>
        ))}
      </div>
      {report.findings.length > 3 && (
        <details className="more-findings">
          <summary>More findings ({report.findings.length - 3})</summary>
          {report.findings.slice(3).map((f) => (
            <p key={f.id}>{f.claim}</p>
          ))}
        </details>
      )}
      {!!report.uncertainties.length && (
        <details
          className="principle"
          open={report.identityStatus === "ambiguous"}
        >
          <summary>Needs confirmation ({report.uncertainties.length})</summary>
          <ul>
            {report.uncertainties.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </details>
      )}
      {report.mode === "live" && !report.goals.length && (
        <p className="caption">
          Owner goals haven’t been supplied. Confirm needs and budget during
          review.
        </p>
      )}
      <details className="sources">
        <summary>
          {report.mode === "synthetic"
            ? "Example evidence"
            : "Sources and supporting excerpts"}{" "}
          ({report.evidence.length})
        </summary>
        {report.evidence.map((e) => (
          <article key={e.id}>
            <h3>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer">
                  {e.label}
                </a>
              ) : (
                e.label
              )}
            </h3>
            <small>
              {e.synthetic
                ? "Fictional owner information"
                : `Retrieved ${friendlyDate(e.retrievedAt)}`}
            </small>
            <blockquote>{e.excerpt}</blockquote>
          </article>
        ))}
      </details>
      <p className="caption">
        Public-source statements can include opinions or outdated information.
        Confirm suitability in Proposales.
      </p>
    </section>
  );
}
