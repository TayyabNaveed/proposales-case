"use client";
import { useEffect, useRef, useState } from "react";
import type { ProposalPresentation } from "../../domain/offers";
import type { ReportV2 } from "../../domain/reports";
import type { SelectionResult } from "../../domain/selection";
import {
  recordedFor,
  previewRecommendation,
  restorePendingGeneration,
  findSavedGeneration,
  canAdoptReport,
  admitBrowserGeneration,
  canRestartRecommendation,
  canReleaseRejectedGeneration,
  type Adjustment,
  isSettledOutcome,
  isProposalStorageKey,
  UnreadableGeneration,
} from "../../domain/workbench";
import { apiRequest, readSaved, explanations } from "./api";
import type { DemoSession } from "./useDemoSession";
export type Recommendation = {
  id?: string;
  reportId: string;
  state: string;
  selection: SelectionResult | null;
  model?: string;
  promptVersion?: string;
  createdAt?: string;
  recordedAt?: string;
  expiresAt?: string | null;
  cacheHit?: boolean;
  usage?: { inputTokens: number | null; outputTokens: number | null };
  errorCode?: string | null;
  failureCode?: string | null;
};
export type Outcome = {
  state: string;
  snapshotId: string;
  message: string;
  providerId?: string;
  editorUrl?: string;
  issues?: string[];
};
type Pending = {
  requestId: string;
  recommendationId: string;
  selections: Adjustment[];
};
const initial = (r: ReportV2 | null): Recommendation =>
  r?.mode === "synthetic"
    ? { ...recordedFor(r.id), state: "recorded" }
    : { reportId: r?.id ?? "", state: "none", selection: null };
const adjustments = (s: SelectionResult | null) =>
  s?.items.map(({ serviceId, quantity, disposition }) => ({
    serviceId,
    quantity,
    disposition,
  })) ?? [];
export function useProposalWorkflow(
  firstReport: ReportV2 | null,
  session: DemoSession,
) {
  const [report, setReport] = useState(firstReport),
    [recommendation, setRecommendation] = useState(initial(firstReport)),
    [selected, setSelected] = useState<Adjustment[]>(
      adjustments(initial(firstReport).selection),
    ),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<Outcome | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [restoring, setRestoring] = useState(!!firstReport),
    [storageIssue, setStorageIssue] = useState(false);
  const [storageRevision, setStorageRevision] = useState(0);
  const storageRefreshQueued = useRef(false);
  // Whether `selected` holds the operator's choices rather than a suggestion's.
  const edited = useRef(false);
  useEffect(() => {
    const changed = () => {
      if (action.current) storageRefreshQueued.current = true;
      else setStorageRevision((n) => n + 1);
    };
    const storageChanged = (event: StorageEvent) => {
      if (isProposalStorageKey(event.key, current.current?.id)) changed();
    };
    window.addEventListener("storage", storageChanged);
    window.addEventListener("case-generation-changed", changed);
    return () => {
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("case-generation-changed", changed);
    };
  }, []);
  const latestRecommendation = useRef(recommendation);
  latestRecommendation.current = recommendation;
  const revision = useRef(0),
    action = useRef(false),
    current = useRef(report);
  current.current = report;
  function finishAction() {
    action.current = false;
    if (storageRefreshQueued.current) {
      storageRefreshQueued.current = false;
      setStorageRevision((n) => n + 1);
    }
  }
  const request = <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, body, session.expire);
  const key = (id: string) => "case-generation:" + id;
  const statusPath = (p: Pending) =>
    "/api/drafts?requestId=" +
    encodeURIComponent(p.requestId) +
    "&recommendationId=" +
    encodeURIComponent(p.recommendationId);
  useEffect(() => {
    if (!report) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    const rev = revision.current;
    setRestoring(true);
    async function restore() {
      let p: Pending | null = null;
      try {
        p = restorePendingGeneration(readSaved(key(report!.id)));
        setPending(p);
        if (storageIssue) setMessage("");
        setStorageIssue(false);
      } catch (error) {
        setStorageIssue(true);
        setMessage(
          error instanceof UnreadableGeneration
            ? error.message
            : "Saved proposal recovery could not be read. Restore browser storage before creating another proposal.",
        );
        return;
      }
      if (!session.authenticated || action.current) return;
      try {
        const rid =
          p?.recommendationId ?? readSaved("case-recommendation:" + report!.id);
        if (rid && (p || latestRecommendation.current.id !== rid)) {
          const v = await request<{ recommendation: Recommendation }>(
            "/api/recommendations?id=" + encodeURIComponent(rid),
          );
          if (cancelled || rev !== revision.current) return;
          if (v.recommendation.reportId !== report!.id)
            throw Error("Saved suggestions belong to a different business.");
          setRecommendation(v.recommendation);
          if (p) {
            edited.current = true;
            setSelected(p.selections);
          } else if (!edited.current)
            setSelected(adjustments(v.recommendation.selection));
        }
        if (p) {
          const v = await request<{ outcome: Outcome }>(statusPath(p));
          if (cancelled || rev !== revision.current) return;
          settle(v.outcome);
        }
      } catch (e) {
        if (!cancelled && rev === revision.current)
          setMessage((e as Error).message);
      }
    }
    void restore().finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [report?.id, session.authenticated, storageRevision]);
  function adopt(next: ReportV2) {
    if (current.current?.id === next.id) return;
    const saved = findSavedGeneration(localStorage);
    if (!canAdoptReport(saved?.reportId, next.id))
      throw Error("Recover the saved proposal before changing businesses.");
    if (pending || action.current || storageIssue)
      throw Error("Recover the existing proposal before changing businesses.");
    revision.current++;
    current.current = next;
    setReport(next);
    const r = initial(next);
    setRecommendation(r);
    setSelected(adjustments(r.selection));
    edited.current = false;
    setPending(null);
    setOutcome(null);
    setMessage("");
    setRestoring(true);
  }
  async function recommend(next = report, refresh = false) {
    if (!next || pending || action.current || storageIssue) return;
    // Automatic selection is an explicit continuation of Analyse business.
    if (current.current?.id !== next.id) adopt(next);
    try {
      if (restorePendingGeneration(readSaved(key(next.id))))
        throw Error(
          "Recover the saved proposal before requesting new suggestions.",
        );
    } catch (e) {
      setMessage((e as Error).message);
      throw e;
    }
    refresh =
      refresh ||
      (current.current?.id === next.id &&
        canRestartRecommendation(recommendation));
    const rev = revision.current;
    action.current = true;
    setBusy("Suggesting services");
    setMessage("");
    setOutcome(null);
    try {
      const v = await request<{ recommendation: Recommendation }>(
        "/api/recommendations",
        { reportId: next.id, refresh },
      );
      if (rev !== revision.current || findSavedGeneration(localStorage)) return;
      setRecommendation(v.recommendation);
      setSelected(adjustments(v.recommendation.selection));
      edited.current = false;
      if (v.recommendation.id) {
        try {
          localStorage.setItem(
            "case-recommendation:" + next.id,
            v.recommendation.id,
          );
        } catch {}
      }
      if (v.recommendation.state !== "ready")
        throw Error(
          explanations[v.recommendation.failureCode ?? ""] ??
            explanations[v.recommendation.errorCode ?? ""] ??
            "Suggestions are still in progress. Check saved progress before continuing.",
        );
      setMessage(
        "Suggestions ready. Adjust the scope, then create a proposal.",
      );
    } catch (e) {
      if (rev === revision.current) setMessage((e as Error).message);
      throw e;
    } finally {
      finishAction();
      if (rev === revision.current) setBusy("");
    }
  }
  async function checkRecommendation() {
    if (!recommendation.id || action.current) return;
    const rev = revision.current;
    action.current = true;
    setBusy("Checking saved suggestions");
    try {
      const v = await request<{ recommendation: Recommendation }>(
        "/api/recommendations?id=" + recommendation.id,
      );
      if (rev !== revision.current) return;
      setRecommendation(v.recommendation);
      setSelected(adjustments(v.recommendation.selection));
      edited.current = false;
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      finishAction();
      setBusy("");
    }
  }
  // A pending request keeps its saved text; a new one carries what the operator approved.
  async function generate(presentation?: ProposalPresentation) {
    if (
      !report ||
      action.current ||
      restoring ||
      storageIssue ||
      !session.authenticated ||
      (!pending && !recommendation.id)
    )
      return;
    const wasPending = !!pending,
      p = pending ?? {
        requestId: crypto.randomUUID(),
        recommendationId: recommendation.id!,
        selections: selected,
        ...(presentation ? { presentation } : {}),
      };
    action.current = true;
    setBusy("Saving proposal recovery");
    try {
      await admitBrowserGeneration(localStorage, navigator.locks, report.id, p);
      window.dispatchEvent(new Event("case-generation-changed"));
    } catch (error) {
      finishAction();
      setBusy("");
      setMessage((error as Error).message);
      return;
    }
    setPending(p);
    action.current = true;
    setBusy("Creating your proposal");
    setMessage("");
    const rev = revision.current;
    try {
      const v = await request<{ outcome: Outcome }>("/api/drafts", p);
      if (rev !== revision.current) return;
      settle(v.outcome);
    } catch (e) {
      if (rev === revision.current) {
        if (
          canReleaseRejectedGeneration(
            (e as { code?: string }).code,
            wasPending,
          )
        ) {
          setPending(null);
          localStorage.removeItem(key(report.id));
          window.dispatchEvent(new Event("case-generation-changed"));
          setOutcome(null);
          setMessage((e as Error).message);
        } else if (
          wasPending &&
          (e as { code?: string }).code === "stale_recommendation"
        ) {
          // Only the server can tell whether another tab saved it meanwhile.
          try {
            settle(
              (await request<{ outcome: Outcome }>(statusPath(p))).outcome,
            );
          } catch (statusError) {
            setMessage((statusError as Error).message);
          }
        } else {
          setOutcome({
            state: "unknown",
            snapshotId: "",
            message: "Check the saved proposal before another creation.",
          });
          setMessage(
            "We could not confirm whether the proposal was created. Check its progress; the same request is saved.",
          );
        }
      }
    } finally {
      finishAction();
      setBusy("");
    }
  }
  // Keep the outcome on screen; drop the browser recovery copy once settled.
  function settle(o: Outcome) {
    setOutcome(o);
    setMessage(o.message);
    if (!report || !isSettledOutcome(o)) return;
    try {
      localStorage.removeItem(key(report.id));
      window.dispatchEvent(new Event("case-generation-changed"));
    } catch {
      return;
    }
    setPending(null);
  }
  async function checkDraft() {
    if (!pending || action.current) return;
    action.current = true;
    setBusy("Checking your proposal");
    try {
      const v = await request<{ outcome: Outcome }>(statusPath(pending));
      settle(v.outcome);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      finishAction();
      setBusy("");
    }
  }
  function newVersion() {
    if (!report || !outcome?.providerId || action.current) return;
    try {
      localStorage.removeItem(key(report.id));
      window.dispatchEvent(new Event("case-generation-changed"));
    } catch {
      setMessage(
        "Browser storage must be available before starting another version.",
      );
      return;
    }
    revision.current++;
    setPending(null);
    setOutcome(null);
    setMessage(
      "Your existing proposal is preserved. Creating again will make a separate version.",
    );
  }
  function edit(serviceId: string, change: Partial<Adjustment> | null) {
    if (pending || busy || restoring || storageIssue) return;
    revision.current++;
    edited.current = true;
    setOutcome(null);
    // A kept suggestion starts from the AI's values; an added service from 1, core.
    const source = recommendation.selection?.items.find(
      (i) => i.serviceId === serviceId,
    ) ?? { quantity: 1, disposition: "core" as const };
    setSelected((items) =>
      change === null
        ? items.filter((i) => i.serviceId !== serviceId)
        : items.some((i) => i.serviceId === serviceId)
          ? items.map((i) =>
              i.serviceId === serviceId ? { ...i, ...change } : i,
            )
          : [
              ...items,
              {
                serviceId,
                quantity: source.quantity,
                disposition: source.disposition,
                ...change,
              },
            ],
    );
  }
  let preview: ReturnType<typeof previewRecommendation> = null,
    error = "";
  try {
    if (report && recommendation.selection)
      preview = previewRecommendation(
        report,
        recommendation.selection,
        selected,
      );
  } catch {
    error =
      "Keep a required foundation selected before the services that depend on it.";
  }
  const locked = !!pending || !!busy || restoring || storageIssue;
  const canGenerate =
    session.authenticated &&
    !!recommendation.id &&
    recommendation.state === "ready" &&
    !!preview &&
    !error &&
    !locked &&
    !!recommendation.expiresAt &&
    Date.parse(recommendation.expiresAt) > Date.now();
  function clear() {
    if (findSavedGeneration(localStorage)) return;
    if (pending || action.current || storageIssue) return;
    revision.current++;
    current.current = null;
    setReport(null);
    setRecommendation(initial(null));
    setSelected([]);
    edited.current = false;
    setOutcome(null);
    setMessage("");
    setRestoring(false);
  }
  return {
    report,
    recommendation,
    selected,
    pending,
    outcome,
    busy,
    message,
    restoring,
    locked,
    canGenerate,
    preview,
    error,
    clear,
    adopt,
    recommend,
    checkRecommendation,
    generate,
    checkDraft,
    newVersion,
    edit,
    expire: session.expire,
  };
}
export type ProposalWorkflow = ReturnType<typeof useProposalWorkflow>;
