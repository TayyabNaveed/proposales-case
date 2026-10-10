"use client";
import { useEffect, useRef, useState } from "react";
import { researchInputSchema } from "../domain/research";
import {
  publicResearchSchema,
  type SearchStage,
  type ReportStage,
  type PublicResearchRecord,
} from "../domain/research-state";
import { analyseBusiness } from "../domain/analysis-flow";
import type { ReportV2 } from "../domain/reports";
import { apiRequest, friendlyDate, explanations } from "./workbench/api";
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
    [website, setWebsite] = useState(""),
    [search, setSearch] = useState<SearchStage | null>(null),
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
        setWebsite(s.input.website ?? "");
        const rid = localStorage.getItem("case-research-report");
        if (rid) {
          const r = await request("/api/reports?id=" + encodeURIComponent(rid));
          if (
            cancelled ||
            rev !== revision.current ||
            r.stage !== "report" ||
            r.input.searchId !== s.id
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
    setReport(null);
    setMessage("");
    onReset();
    try {
      localStorage.removeItem("case-research-search");
      localStorage.removeItem("case-research-report");
    } catch {}
  }
  async function analyse(refresh = false) {
    if (active.current || blocked || restoring) return;
    const rev = revision.current;
    active.current = true;
    setMessage("");
    try {
      const input = researchInputSchema.parse({
        businessName,
        location,
        website: website || undefined,
      });
      if (refresh) onReset();
      await analyseBusiness({
        input,
        search: refresh ? null : search,
        report: refresh ? null : report,
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
          setReport(null);
          save("case-research-search", s.id);
          try {
            localStorage.removeItem("case-research-report");
          } catch {}
        },
        onSavedReport: (r) => {
          setReport(r);
          save("case-research-report", r.id);
        },
        onReport,
        onProgress: setBusy,
        recommend: onRecommend,
      } as Parameters<typeof analyseBusiness>[0]);
      if (revision.current === rev)
        setMessage("Analysis complete. Review the suggested scope below.");
    } catch (e) {
      if (revision.current === rev)
        setMessage(
          e instanceof Error && e.name === "ZodError"
            ? "Check the business name, location and website."
            : (e as Error).message,
        );
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
          <label>
            Website <small>(optional)</small>
            <input
              type="url"
              maxLength={300}
              disabled={disabled}
              value={website}
              onChange={(e) => edit(setWebsite, e.target.value)}
              placeholder="https://"
            />
          </label>
        </div>
        <div className="research-actions">
          <button className="primary" disabled={disabled}>
            {search
              ? message
                ? "Continue analysis"
                : "Analyse business"
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
      {(search || report) && (
        <details className="technical">
          <summary>Analysis details</summary>
          <p>
            Sources: {search?.state ?? "not started"} ·{" "}
            {search?.cacheHit ? "reused" : "saved"}. Report:{" "}
            {report?.state ?? "not started"}.
          </p>
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
