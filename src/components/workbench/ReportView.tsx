import type { ReportV2 } from "../../domain/reports";
import { friendlyDate } from "./api";
import { splitEvidence } from "../../domain/research";
export function ReportView({ report }: { report: ReportV2 }) {
  // Synthetic examples keep every owner excerpt together; live reports lead
  // with the sources their findings cite.
  const { cited, other } =
    report.mode === "synthetic"
      ? { cited: report.evidence, other: [] }
      : splitEvidence(report);
  const identity = report.identity;
  const sourceLink = (id: string) => {
    const e = report.evidence.find((x) => x.id === id);
    return e?.url ? (
      <a href={e.url} target="_blank" rel="noopener noreferrer">
        {e.label}
      </a>
    ) : (
      e?.label
    );
  };
  const source = (e: ReportV2["evidence"][number]) => (
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
  );
  return (
    <section className="report">
      <p className="eyebrow">01 / UNDERSTAND</p>
      <h2>{report.businessName}</h2>
      <p className="summary">{report.summary}</p>
      {report.identityStatus === "confirmed" && identity?.candidates[0] && (
        <p className="identity-match">
          {identity.chosenBy === "operator" ? "Chosen by you: " : "Matched "}“
          {identity.candidates[0].name.text}”
          {identity.candidates[0].location &&
            ` · “${identity.candidates[0].location.text}”`}{" "}
          in {sourceLink(identity.candidates[0].name.sourceId)}
          {identity.website && (
            <>
              {" · Website: "}
              {identity.website.kind === "selected"
                ? sourceLink(identity.website.sourceId)
                : identity.website.kind === "typed"
                  ? identity.website.url
                  : "none selected"}
            </>
          )}
        </p>
      )}
      {report.identityStatus === "ambiguous" && (
        <div className="identity-notice" role="status">
          <p>
            <strong>Business not confirmed.</strong>{" "}
            {identity && identity.candidates.length > 1
              ? "Several businesses match this name and location, so no services are suggested yet."
              : "Public sources didn’t clearly match this name and location, so no services are suggested yet."}{" "}
            Add the business website or exact street address above and choose
            Analyse business again.
          </p>
          {identity && identity.candidates.length > 1 && (
            <ul>
              {identity.candidates.map((c) => (
                <li key={c.name.sourceId}>
                  “{c.name.text}”{c.location && ` · “${c.location.text}”`} in{" "}
                  {sourceLink(c.name.sourceId)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
          <summary>Open questions ({report.uncertainties.length})</summary>
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
            : "Sources used in this report"}{" "}
          ({cited.length})
        </summary>
        {cited.map(source)}
        {!!other.length && (
          <details className="other-sources">
            <summary>Other results searched ({other.length})</summary>
            {other.map(source)}
          </details>
        )}
      </details>
      <p className="caption">
        Public-source statements can include opinions or outdated information.
        Confirm suitability in Proposales.
      </p>
    </section>
  );
}
