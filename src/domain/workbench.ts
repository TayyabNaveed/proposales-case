import { z } from "zod";
import recorded from "./recorded-recommendations.json";
import {
  selectionSchema,
  type SelectionResult,
  type ScopeResult,
} from "./selection.js";
import { buildDraftSnapshot, proposalPresentationSchema } from "./offers.js";
import { catalogueV2, type CatalogueV2 } from "./catalogue.js";
import type { ReportV2 } from "./reports.js";
export const adjustmentSchema = z
  .array(
    z
      .object({
        serviceId: z.string().min(1),
        quantity: z.number().int().positive(),
        disposition: z.enum(["core", "optional"]),
      })
      .strict(),
  )
  .min(1)
  .max(14);
export type Adjustment = z.infer<typeof adjustmentSchema>[number];
export const shouldSwitchExample = (current: string, next: string) =>
  current !== next;
export function restorePendingGeneration(saved: string | null) {
  return saved === null
    ? null
    : z
        .object({
          requestId: z.uuid(),
          recommendationId: z.uuid(),
          selections: adjustmentSchema,
          // Saved with the request so a retry sends exactly the same text.
          presentation: proposalPresentationSchema.optional(),
        })
        .strict()
        .parse(JSON.parse(saved));
}
export function canReleaseRejectedGeneration(
  code: string | undefined,
  previouslyPending: boolean,
) {
  return (
    !previouslyPending &&
    !!code &&
    [
      "access_required",
      "origin_rejected",
      "invalid_input",
      "stale_recommendation",
      "research_stale",
      "recommendation_missing",
      "unsupported_adjustment",
      "draft_budget_exceeded",
      "too_many_attempts",
      "empty_offer",
      "unsupported_service",
      "missing_prerequisite",
      "overlap_website_scope",
    ].includes(code)
  );
}
export function recordedFor(reportId: string) {
  const r = recorded.recommendations.find((r) => r.reportId === reportId);
  if (!r) throw new Error("recorded_recommendation_missing");
  return { ...r, selection: selectionSchema.parse(r.selection) };
}
// The operator decides the scope. Kept suggestions keep their AI reason and
// findings; anything else is attributed to the operator. The server makes that
// distinction from the stored recommendation, never from the browser.
// Catalogue bounds and prerequisites are checked when the snapshot is built.
export function adjustedSelection(
  selection: SelectionResult,
  raw: unknown,
): ScopeResult {
  const items = adjustmentSchema.parse(raw).map((i) => {
    const suggested = selection.items.find((s) => s.serviceId === i.serviceId);
    return suggested
      ? { ...suggested, ...i }
      : { ...i, findingIds: [], rationale: "" as const, addedBy: "operator" as const };
  });
  return { items, questions: selection.questions, abstentionReason: null };
}
export function previewRecommendation(
  report: ReportV2,
  selection: SelectionResult,
  items: Adjustment[],
) {
  return items.length
    ? buildDraftSnapshot(
        report,
        adjustedSelection(selection, items),
        catalogueV2,
      )
    : null;
}
// A request in a hidden tab or older live report must still block a second uncertain write.
export function findSavedGeneration(
  storage: Pick<Storage, "length" | "key" | "getItem">,
) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    .filter((k): k is string => !!k && k.startsWith("case-generation:"))
    .sort();
  for (const key of keys) {
    const request = restorePendingGeneration(storage.getItem(key));
    if (request)
      return { reportId: key.slice("case-generation:".length), request };
  }
  return null;
}
export function canRestartRecommendation(
  r: { state: string; createdAt?: string },
  now = Date.now(),
) {
  return (
    r.state === "failed" ||
    (r.state === "running" &&
      !!r.createdAt &&
      Number.isFinite(Date.parse(r.createdAt)) &&
      now - Date.parse(r.createdAt) >= 120000)
  );
}
export const canAdoptReport = (
  pendingReportId: string | null | undefined,
  nextReportId: string,
) => !pendingReportId || pendingReportId === nextReportId;
export async function admitBrowserGeneration(
  storage: Pick<Storage, "length" | "key" | "getItem" | "setItem">,
  locks:
    | {
        request(
          name: string,
          callback: () => void | Promise<void>,
        ): Promise<unknown>;
      }
    | undefined,
  reportId: string,
  request: NonNullable<ReturnType<typeof restorePendingGeneration>>,
) {
  if (!locks)
    throw Error(
      "This browser cannot safely save proposal recovery. Use a browser with Web Locks support.",
    );
  await locks.request("case-proposal-admission", () => {
    const saved = findSavedGeneration(storage);
    if (
      saved &&
      (saved.reportId !== reportId ||
        saved.request.requestId !== request.requestId ||
        JSON.stringify(saved.request) !== JSON.stringify(request))
    )
      throw Error(
        "A proposal request is already saved. Reload to recover it before another creation.",
      );
    const key = "case-generation:" + reportId,
      value = JSON.stringify(request);
    storage.setItem(key, value);
    if (storage.getItem(key) !== value)
      throw Error("Browser storage could not save proposal recovery.");
  });
}

// Whether a catalogue service can be added to the current scope, and if not,
// why. Mirrors the server's rules (selection.ts) so the screen can explain
// instead of failing; the server still validates every request.
export function serviceAvailability(
  service: CatalogueV2["services"][number],
  report: ReportV2,
  selected: string[],
): { available: boolean; reason?: string } {
  const title = (id: string) => catalogueV2.services.find((s) => s.id === id)?.title ?? id;
  if (service.id === "website-base" && report.capabilities.website.status === "present")
    return { available: false, reason: "This business already has a website." };
  const overlap = service.conflictsWith.find((id) => selected.includes(id));
  if (overlap) return { available: false, reason: `Included in ${title(overlap)}.` };
  const foundation =
    service.requires === "website"
      ? "website-base"
      : service.requires === "campaign"
        ? "ads-setup"
        : null;
  if (
    service.requires &&
    report.capabilities[service.requires].status !== "present" &&
    !(foundation && selected.includes(foundation))
  )
    return {
      available: false,
      reason: foundation
        ? `Needs ${service.requires === "website" ? "a website" : "a running campaign"}: add ${title(foundation)} first.`
        : "Needs a confirmed Google Business Profile.",
    };
  return { available: true };
}
// The browser keeps a proposal request only to recover a lost response. Once the
// server reports the proposal's Proposales ID (stored durably server-side), or a
// definite rejection, the request has served its purpose and is released.
// Uncertain outcomes keep it.
export function isSettledOutcome(
  o: { state: string; providerId?: string } | null | undefined,
) {
  // A rejection is also settled: nothing was created, so a new request is safe.
  return (
    o?.state === "rejected" ||
    (!!o?.providerId &&
      (o.state === "confirmed" || o.state === "verification_failed"))
  );
}
