import { z } from "zod";
import {
  catalogueV2,
  catalogueVersion,
  type CatalogueV2,
} from "./catalogue.js";
import { reports, type ReportV2 } from "./reports.js";
import { validateSelection, type SelectionResult } from "./selection.js";
import { exampleSelections } from "./example-selections.js";
export function buildDraftSnapshot(
  report: ReportV2,
  selection: SelectionResult,
  catalogue: CatalogueV2,
) {
  const checked = validateSelection(report, selection, catalogue);
  if (!checked.items.length) throw new Error("empty_offer");
  const items = checked.items.map((i) => {
    const svc = catalogue.services.find((s) => s.id === i.serviceId)!;
    return {
      ...i,
      title: svc.title,
      unitPriceMinor: svc.unitPriceMinor,
      billing: svc.billing,
      deliverables: [...svc.deliverables],
      exclusions: [...svc.exclusions],
      findingIds: [...i.findingIds].sort(),
    };
  });
  const total = (d: "core" | "optional", b: "one-time" | "monthly") =>
    items
      .filter((i) => i.disposition === d && i.billing === b)
      .reduce((n, i) => n + i.unitPriceMinor * i.quantity, 0);
  return {
    version: 2 as const,
    reportId: report.id,
    reportVersion: report.version,
    report: structuredClone(report),
    catalogueVersion: catalogue.version,
    catalogue: structuredClone(catalogue),
    currency: catalogue.currency,
    items,
    questions: checked.questions,
    coreOneTimeMinor: total("core", "one-time"),
    coreMonthlyMinor: total("core", "monthly"),
    optionalOneTimeMinor: total("optional", "one-time"),
    optionalMonthlyMinor: total("optional", "monthly"),
    demo: catalogue.demo,
    taxLabel:
      "Illustrative prices excluding tax. Tax and commercial terms require confirmation.",
  };
}
export const offerInputSchema = z
  .object({
    exampleId: z.string(),
    catalogueVersion: z.literal("demo-2"),
    selections: z
      .array(
        z
          .object({
            serviceId: z.string(),
            quantity: z.number().int().positive(),
          })
          .strict(),
      )
      .max(14),
  })
  .strict();
export type OfferInput = z.infer<typeof offerInputSchema>;
// Historical approval endpoint bridge only; not an AI recommender or final review flow.
export function buildOffer(raw: unknown) {
  const input = offerInputSchema.parse(raw),
    report = reports.find((r) => r.id === input.exampleId);
  if (!report) throw new Error("invalid_report");
  const selections = input.selections.map((i) => {
    const fixture = exampleSelections[report.id]?.find(
      (x) => x.serviceId === i.serviceId,
    );
    if (!fixture) throw new Error("unsupported_service");
    return {
      ...i,
      disposition: "core" as const,
      findingIds: fixture.findingIds,
      rationale: fixture.explanation,
    };
  });
  if (!selections.length)
    return {
      version: 2 as const,
      reportId: report.id,
      catalogueVersion,
      currency: "EUR" as const,
      items: [],
      oneTimeMinor: 0,
      monthlyMinor: 0,
      taxLabel: "Illustrative prices excluding tax.",
      demo: true as const,
    };
  const snapshot = buildDraftSnapshot(
    report,
    { items: selections, questions: [], abstentionReason: null },
    catalogueV2,
  );
  return {
    ...snapshot,
    oneTimeMinor: snapshot.coreOneTimeMinor,
    monthlyMinor: snapshot.coreMonthlyMinor,
  };
}
export type OfferSnapshot = ReturnType<typeof buildOffer>;
export type DraftSnapshot = ReturnType<typeof buildDraftSnapshot> & {
  compositionVersion?: "proposal-2";
};
