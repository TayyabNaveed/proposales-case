import { z } from "zod";
import recorded from "./recorded-recommendations.json";
import { selectionSchema, type SelectionResult } from "./selection.js";
import { buildDraftSnapshot } from "./offers.js";
import { catalogueV2 } from "./catalogue.js";
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
export function adjustedSelection(
  selection: SelectionResult,
  raw: unknown,
): SelectionResult {
  const items = adjustmentSchema.parse(raw).map((i) => {
    const candidate = selection.items.find((s) => s.serviceId === i.serviceId);
    if (!candidate || i.quantity > candidate.quantity)
      throw new Error("unsupported_adjustment");
    return { ...candidate, ...i };
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
