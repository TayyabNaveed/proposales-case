import { z } from "zod";
import { reportSchema, type ReportV2 } from "./reports.js";
import type { CatalogueV2 } from "./catalogue.js";
export const selectionSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            serviceId: z.string().min(1),
            quantity: z.number().int().positive(),
            disposition: z.enum(["core", "optional"]),
            findingIds: z.array(z.string().min(1)).min(1),
            rationale: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(14),
    questions: z.array(z.string().min(1).max(1000)).max(20),
    abstentionReason: z.string().min(1).max(2000).nullable(),
  })
  .strict();
export type SelectionResult = z.infer<typeof selectionSchema>;
export function validateSelection(
  rawReport: ReportV2,
  raw: unknown,
  catalogue: CatalogueV2,
): SelectionResult {
  const report = reportSchema.parse(rawReport),
    s = selectionSchema.parse(raw);
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
