import { z } from "zod";
import { reportSchema, type ReportV2 } from "./reports.js";
import type { CatalogueV2 } from "./catalogue.js";
const base = {
  serviceId: z.string().min(1),
  quantity: z.number().int().positive(),
  disposition: z.enum(["core", "optional"]),
};
// An AI suggestion must cite report findings and give a reason.
const aiItem = z
  .object({
    ...base,
    findingIds: z.array(z.string().min(1)).min(1),
    rationale: z.string().min(1).max(2000),
  })
  .strict();
// A service the operator added from the catalogue: no findings, no AI reason.
const operatorItem = z
  .object({
    ...base,
    findingIds: z.array(z.string()).max(0),
    rationale: z.literal(""),
    addedBy: z.literal("operator"),
  })
  .strict();
const result = <T extends z.ZodType>(item: T) =>
  z
    .object({
      items: z.array(item).max(14),
      questions: z.array(z.string().min(1).max(1000)).max(20),
      abstentionReason: z.string().min(1).max(2000).nullable(),
    })
    .strict();
// Model output and stored recommendations: AI items only.
export const selectionSchema = result(aiItem);
// Proposal scope: AI suggestions the operator kept, plus services they added.
export const scopeSchema = result(z.union([aiItem, operatorItem]));
export type SelectionResult = z.infer<typeof selectionSchema>;
export type ScopeResult = z.infer<typeof scopeSchema>;
export function validateSelection(
  rawReport: ReportV2,
  raw: unknown,
  catalogue: CatalogueV2,
): SelectionResult {
  return checkScope(rawReport, selectionSchema.parse(raw), catalogue) as SelectionResult;
}
// The same catalogue, quantity, overlap and prerequisite rules apply to every
// item, whoever chose it; only AI items must cite findings.
export function validateScope(
  rawReport: ReportV2,
  raw: unknown,
  catalogue: CatalogueV2,
): ScopeResult {
  return checkScope(rawReport, scopeSchema.parse(raw), catalogue);
}
function checkScope(rawReport: ReportV2, s: ScopeResult, catalogue: CatalogueV2) {
  const report = reportSchema.parse(rawReport);
  const seen = new Set<string>();
  if (!s.items.length) {
    if (!s.abstentionReason) throw new Error("abstention_required");
    return s;
  }
  if (report.identityStatus !== "confirmed" || s.abstentionReason)
    throw new Error("invalid_selection_identity");
  for (const i of s.items) {
    const svc = catalogue.services.find((x) => x.id === i.serviceId);
    if (!svc || seen.has(i.serviceId)) throw new Error("unsupported_service");
    seen.add(i.serviceId);
    if (i.quantity > svc.maxQuantity) throw new Error("invalid_quantity");
    if (
      i.findingIds.some(
        (id) =>
          !report.findings.some((f) => f.id === id && f.kind !== "unknown"),
      )
    )
      throw new Error("unsupported_evidence");
  }
  if (
    catalogue.services.some(
      (svc) => seen.has(svc.id) && svc.conflictsWith.some((id) => seen.has(id)),
    )
  )
    throw new Error("overlap_website_scope");
  if (
    seen.has("website-base") &&
    report.capabilities.website.status === "present"
  )
    throw new Error("website_rebuild_requires_scoped_catalogue");
  for (const i of s.items) {
    const svc = catalogue.services.find((x) => x.id === i.serviceId)!;
    if (!svc.requires) continue;
    const cap = report.capabilities[svc.requires];
    const foundation =
      svc.requires === "website"
        ? "website-base"
        : svc.requires === "campaign"
          ? "ads-setup"
          : null;
    const dependency = s.items.find(
      (x) =>
        x.serviceId === foundation &&
        (i.disposition === "optional" || x.disposition === "core"),
    );
    if (cap.status !== "present" && !dependency)
      throw new Error("missing_prerequisite");
  }
  return {
    ...s,
    items: [...s.items].sort((a, b) => a.serviceId.localeCompare(b.serviceId)),
  };
}
