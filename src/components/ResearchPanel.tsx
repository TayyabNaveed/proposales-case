"use client";
import { useEffect, useRef, useState } from "react";
import { researchInputSchema, type OperatorChoice } from "../domain/research";
import {
  publicResearchSchema,
  type SearchStage,
  type IdentifyStage,
  type ReportStage,
} from "../domain/research-state";
import { identifyStep, continueWithChoice } from "../domain/analysis-flow";
import type { ReportV2 } from "../domain/reports";
import { apiRequest, friendlyDate, explanations } from "./workbench/api";
import { BusinessChoice } from "./workbench/BusinessChoice";
export function ResearchPanel({
  authenticated,
  blocked,
  onReport,
  onRestore,
  onReset,
  onRecommend,
  onExpired,
  onExplore,
  onBusy,
  restoreAllowed,
}: {
  authenticated: boolean;
  blocked: boolean;
  onReport(r: ReportV2): void;
  onRestore(r: ReportV2): void;
  onReset(): void;
  onRecommend(r: ReportV2): Promise<void>;
  onExpired(): void;
  onExplore(): void;
  onBusy(b: boolean): void;
  restoreAllowed: boolean;
}) {
  const [businessName, setName] = useState(""),
    [location, setLocation] = useState(""),
    [search, setSearch] = useState<SearchStage | null>(null),
    [identify, setIdentify] = useState<IdentifyStage | null>(null),
    [choosing, setChoosing] = useState(false),
    [report, setReport] = useState<ReportStage | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [restoring, setRestoring] = useState(false);
  const revision = useRef(0),
    active = useRef(false),
    expired = useRef(onExpired);
  expired.current = onExpired;
  const request = async (path: string, body?: unknown) =>
    publicResearchSchema.parse(
      (
        await apiRequest<{ record: unknown }>(path, body, () =>
          expired.current(),
        )
      ).record,
    );
  const save = (key: string, id: string) => {
    try {
      localStorage.setItem(key, id);
    } catch {}
  };
  useEffect(() => {
    if (!authenticated || !restoreAllowed) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    const rev = revision.current;
    setRestoring(true);
    async function restore() {
      try {
        const id = localStorage.getItem("case-research-search");
        if (!id) return;
        const s = await request("/api/research?id=" + encodeURIComponent(id));
        if (cancelled || rev !== revision.current || s.stage !== "search")
          return;
        setSearch(s);
        setName(s.input.businessName);
        setLocation(s.input.location);
        const iid = localStorage.getItem("case-research-identify");
        if (!iid) return;
        const i = await request("/api/identify?id=" + encodeURIComponent(iid));
        if (
          cancelled ||
          rev !== revision.current ||
          i.stage !== "identify" ||
          i.input.searchId !== s.id
        )
          return;
        setIdentify(i);
        const rid = localStorage.getItem("case-research-report");
        if (rid) {
          const r = await request("/api/reports?id=" + encodeURIComponent(rid));
          if (
            cancelled ||
            rev !== revision.current ||
            r.stage !== "report" ||
            r.input.identifyId !== i.id
          )
            return;
          setReport(r);
          if (r.result) onRestore(r.result.report);
        }
        setMessage("Saved analysis restored. Continue when you’re ready.");
      } catch {
        if (!cancelled && rev === revision.current)
          setMessage(
            "Saved analysis couldn’t be loaded. Analyse the same business to recover it.",
          );
      }
    }
    void restore().finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authenticated, restoreAllowed]);
  function edit(set: (v: string) => void, value: string) {
    revision.current++;
    set(value);
    setSearch(null);
    setIdentify(null);
    setReport(null);
    setMessage("");
    onReset();
    try {
      localStorage.removeItem("case-research-search");
      localStorage.removeItem("case-research-identify");
      localStorage.removeItem("case-research-report");
    } catch {}
  }
  // Step 1: sources and candidate businesses, then the operator's choice.
  async function analyse(refresh = false) {
    if (active.current || blocked || restoring) return;
    if (!refresh && identify?.result && search && !report?.result) {
      setChoosing(true);
      return;
    }
    const rev = revision.current;
    active.current = true;
    setMessage("");
    try {
      const input = researchInputSchema.parse({ businessName, location });
      if (refresh) onReset();
      await identifyStep({
        input,
        search: refresh ? null : search,
        identify: refresh ? null : identify,
        request: (path, body) =>
          request(
            path,
            refresh && path === "/api/research"
              ? { input, refresh: true }
              : body,
          ),
        isCurrent: () => revision.current === rev,
        onSearch: (s) => {
          setSearch(s);
          setIdentify(null);
          setReport(null);
          save("case-research-search", s.id);
          try {
            localStorage.removeItem("case-research-identify");
            localStorage.removeItem("case-research-report");
          } catch {}
        },
        onIdentify: (i) => {
          setIdentify(i);
          save("case-research-identify", i.id);
          setChoosing(true);
        },
        onProgress: setBusy,
      });
    } catch (e) {
      if (revision.current === rev)
        setMessage(
          e instanceof Error && e.name === "ZodError"
            ? "Check the business name and location."
            : (e as Error).message,
        );
    } finally {
      active.current = false;
      if (revision.current === rev) setBusy("");
    }
  }
  // Step 2: report on the chosen business, then service suggestions.
  async function choose(choice: OperatorChoice) {
    if (active.current || !search || !identify) return;
    setChoosing(false);
    const rev = revision.current;
    active.current = true;
    setMessage("");
    try {
      await continueWithChoice({
        search,
        identify,
        choice,
        report,
        request,
        isCurrent: () => revision.current === rev,
        onSavedReport: (r) => {
          setReport(r);
          save("case-research-report", r.id);
        },
        onReport,
        onProgress: setBusy,
        recommend: onRecommend,
      });
      if (revision.current === rev)
        setMessage("Analysis complete. Review the suggested services below.");
    } catch (e) {
      if (revision.current === rev) setMessage((e as Error).message);
    } finally {
      active.current = false;
      if (revision.current === rev) setBusy("");
    }
  }
  async function check() {
    if (active.current) return;
    active.current = true;
    setBusy("Checking saved progress");
    const rev = revision.current;
    try {
      if (search) {
        const s = await request("/api/research?id=" + search.id);
        if (rev !== revision.current) return;
        if (s.stage === "search") setSearch(s);
      }
      if (identify) {
        const i = await request("/api/identify?id=" + identify.id);
        if (rev !== revision.current) return;
        if (i.stage === "identify") setIdentify(i);
      }
      if (report) {
        const r = await request("/api/reports?id=" + report.id);
        if (rev !== revision.current) return;
        if (r.stage === "report") {
          setReport(r);
          if (r.result) onRestore(r.result.report);
        }
      }
      setMessage("Saved progress checked. Continue when you’re ready.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      active.current = false;
      setBusy("");
    }
  }
  useEffect(() => {
    onBusy(!!busy || restoring);
  }, [busy, restoring]);
  const disabled = !authenticated || blocked || !!busy || restoring;
  return (
    <section className="research-panel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void analyse();
        }}
      >
        <div className="research-inputs">
          <label>
            Business name
            <input
              required
              minLength={2}
              maxLength={120}
              disabled={disabled}
              value={businessName}
              onChange={(e) => edit(setName, e.target.value)}
              placeholder="e.g. a local workshop"
            />
          </label>
          <label>
            Location
            <input
              required
              minLength={2}
              maxLength={120}
              disabled={disabled}
              value={location}
              onChange={(e) => edit(setLocation, e.target.value)}
              placeholder="City or area"
            />
          </label>
        </div>
        <div className="research-actions">
          <button className="primary" disabled={disabled}>
            {identify?.result && !report?.result
              ? "Choose the business"
              : search && message
                ? "Continue analysis"
                : "Analyse business"}
          </button>
          {(search || report) && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void check()}
            >
              Check saved progress
            </button>
          )}
          {report?.state === "ready" && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void analyse(true)}
            >
              Research again
            </button>
          )}
        </div>
      </form>
      <p role="status" aria-live="polite" className="analysis-progress">
        {restoring ? "Loading saved analysis" : busy || message}
      </p>
      {!authenticated && (
        <p className="caption">
          Enter the demo access code above to analyse a business.
        </p>
      )}
      {message && (
        <button className="text-action" onClick={onExplore}>
          Explore an example
        </button>
      )}
      {search?.result && !report?.result && (
        <details className="sources" open={search.state === "partial"}>
          <summary>
            Saved public sources ({search.result.evidence.length})
          </summary>
          <p>
            {search.state === "partial"
              ? "Some searches were incomplete. Try again before building a report."
              : "Public sources are saved for the next step."}
          </p>
          {search.result.evidence.map((e) => (
            <article key={e.id}>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.label}
              </a>
              <small> · Retrieved {friendlyDate(e.retrievedAt)}</small>
              <blockquote>{e.excerpt}</blockquote>
            </article>
          ))}
        </details>
      )}
      {choosing && identify?.result && search?.result && (
        <BusinessChoice
          businessName={businessName}
          identify={identify}
          evidence={search.result.evidence}
          onConfirm={(c) => void choose(c)}
          onCancel={() => {
            setChoosing(false);
            setMessage("Choose the business to continue.");
          }}
        />
      )}
      {(search || report) && (
        <details className="technical">
          <summary>Analysis details</summary>
          <p>
            Sources: {search?.state ?? "not started"} ·{" "}
            {search?.cacheHit ? "reused" : "saved"}. Business:{" "}
            {identify?.state ?? "not started"}. Report:{" "}
            {report?.state ?? "not started"}.
          </p>
          {identify?.result && (
            <p>
              {identify.result.model} · {identify.result.promptVersion} ·{" "}
              {identify.result.identity.candidates.length} verified candidate(s)
              {identify.result.identity.rejected.length
                ? ` · ${identify.result.identity.rejected.length} removed (${identify.result.identity.rejected.join(", ")})`
                : ""}
            </p>
          )}
          {search?.result && (
            <p>
              {search.result.attempts} attempts ·{" "}
              {search.result.credits ?? "unknown"} search credits
            </p>
          )}
          {report?.diagnostics && (
            <p>
              {report.diagnostics.model} · {report.diagnostics.promptVersion} ·{" "}
              {report.diagnostics.usage.inputTokens ?? "unknown"} input tokens ·{" "}
              {report.diagnostics.failure}
            </p>
          )}
          {report?.errorCode && (
            <p>{explanations[report.errorCode] ?? "Report not available."}</p>
          )}
        </details>
      )}
    </section>
  );
}
