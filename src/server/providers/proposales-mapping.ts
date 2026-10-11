import {
  presentServices,
  compositionVersion,
} from "../../domain/presentation.js";
import { z } from "zod";
import { buildDraftSnapshot, type DraftSnapshot } from "../../domain/offers.js";
import { snapshotHash } from "../canonical.js";
export type ServiceMapping = {
  serviceId: string;
  productId: number;
  variationId: number;
  imageUuid: string;
};
const mappingsSchema = z.array(
  z
    .object({
      serviceId: z.string(),
      productId: z.number().int().positive().safe(),
      variationId: z.number().int().positive().safe(),
      imageUuid: z.uuid(),
    })
    .strict(),
);
export function buildPricedPayload(
  snapshot: DraftSnapshot,
  rawMappings: ServiceMapping[],
  companyId: string,
  operationKey: string,
) {
  if (
    !/^[1-9]\d*$/.test(companyId) ||
    !Number.isSafeInteger(Number(companyId)) ||
    !operationKey ||
    operationKey.length > 200
  )
    throw new Error("invalid_provider_scope");
  if (
    snapshot.compositionVersion !== undefined &&
    snapshot.compositionVersion !== compositionVersion
  )
    throw new Error("unsupported_composition");
  const modern = snapshot.compositionVersion === compositionVersion;
  const mappings = mappingsSchema.parse(rawMappings);
  if (
    new Set(mappings.map((m) => m.serviceId)).size !== mappings.length ||
    new Set(mappings.map((m) => m.variationId)).size !== mappings.length
  )
    throw new Error("invalid_mapping");
  const rebuilt = buildDraftSnapshot(
    snapshot.report,
    {
      items: snapshot.items.map(
        ({ serviceId, quantity, disposition, findingIds, rationale, ...rest }) => ({
          serviceId,
          quantity,
          disposition,
          findingIds,
          rationale,
          // Operator-added services keep their attribution through the rebuild.
          ...("addedBy" in rest ? { addedBy: rest.addedBy } : {}),
        }),
      ) as Parameters<typeof buildDraftSnapshot>[1]["items"],
      questions: snapshot.questions,
      abstentionReason: null,
    },
    snapshot.catalogue,
  );
  const { compositionVersion: _composition, ...canonicalSnapshot } = snapshot;
  if (snapshotHash(rebuilt) !== snapshotHash(canonicalSnapshot))
    throw new Error("snapshot_tampered");
  return {
    company_id: Number(companyId),
    language: "en",
    title_md: `Case demo — ${snapshot.report.businessName} (do not send)`,
    description_md: `# Metascalers growth plan\n${modern && snapshot.report.mode === "live" ? "Technical-case proposal based on public-source research" : "Synthetic technical-case proposal"}. No recipient or email sending.\n\nCore one-time: EUR ${snapshot.coreOneTimeMinor / 100}. Core monthly: EUR ${snapshot.coreMonthlyMinor / 100}/month. Optional one-time: EUR ${snapshot.optionalOneTimeMinor / 100}. Optional monthly: EUR ${snapshot.optionalMonthlyMinor / 100}/month.\n\nIllustrative prices excluding tax. Review suitability, access, budget, scope and billing before sending.\n${snapshot.questions.join("\n")}`,
    tax_options: { mode: "simplified" as const, tax_included: false },
    data: {
      case_operation: operationKey,
      case_snapshot: snapshotHash(snapshot),
      case_catalogue: snapshot.catalogueVersion,
      ...(modern ? { case_composition: compositionVersion } : {}),
    },
    blocks: (modern
      ? presentServices(snapshot.items, snapshot.catalogue)
      : snapshot.items
    ).map((i) => {
      const m = mappings.find((m) => m.serviceId === i.serviceId);
      if (!m) throw new Error("missing_mapping");
      return {
        content_id: m.variationId,
        type: "product-block" as const,
        title: i.title + (i.billing === "monthly" ? " — per month" : ""),
        description: `${i.deliverables.join("\n")}${i.rationale ? `\n\nWhy: ${i.rationale}` : ""}\n\nExcludes: ${i.exclusions.join("; ")}\n\nBilling: ${i.billing === "monthly" ? "EUR " + i.unitPriceMinor / 100 + " per month; recurring monthly service" : "One-time"}; illustrative prices excluding tax.`,
        // Proposales fills an empty list with the library item's image (observed
        // 10 October), so a lead-only image cannot be expressed at creation.
        image_uuids: [m.imageUuid],
        currency: snapshot.currency,
        quantity: i.quantity,
        quantity_editable: false,
        optional: i.disposition === "optional",
        optional_picked: false,
        recurring: i.billing === "monthly",
        unit: i.billing === "monthly" ? "month" : "unit",
        unit_value_without_discount_without_tax: i.unitPriceMinor,
        unit_value_with_discount_without_tax: i.unitPriceMinor,
        unit_value_without_discount_with_tax: i.unitPriceMinor,
        unit_value_with_discount_with_tax: i.unitPriceMinor,
      };
    }),
  };
}
export function verifyPricedProposal(
  raw: unknown,
  snapshot: DraftSnapshot,
  mappings: ServiceMapping[],
  companyId: string,
  key: string,
) {
  const expected = buildPricedPayload(snapshot, mappings, companyId, key);
  const parsed = z
    .object({
      uuid: z.uuid(),
      company_id: z.number(),
      status: z.string().nullable(),
      recipient_is_set: z.boolean(),
      currency: z.string(),
      data: z.record(z.string(), z.unknown()),
      tax_options: z.object({ mode: z.string(), tax_included: z.boolean() }),
      blocks: z.array(z.record(z.string(), z.unknown())),
    })
    .safeParse(raw);
  if (!parsed.success) return { verified: false, issues: ["provider_shape"] };
  const p = parsed.data;
  const issues: string[] = [];
  if (p.company_id !== expected.company_id) issues.push("company");
  if (p.status !== null && p.status !== "draft") issues.push("status");
  if (p.recipient_is_set) issues.push("recipient");
  if (p.currency !== snapshot.currency) issues.push("currency");
  if (
    p.data.case_operation !== key ||
    p.data.case_snapshot !== expected.data.case_snapshot
  )
    issues.push("metadata");
  if (p.tax_options.mode !== "simplified" || p.tax_options.tax_included)
    issues.push("tax_display");
  if (p.blocks.length !== expected.blocks.length) issues.push("block_count");
  if (
    snapshot.compositionVersion &&
    (p.data.case_composition !== snapshot.compositionVersion ||
      JSON.stringify(p.blocks.map((b) => b.content_id)) !==
        JSON.stringify(expected.blocks.map((b) => b.content_id)))
  )
    issues.push("composition");
  for (const b of expected.blocks) {
    const found = p.blocks.filter((x) => x.content_id === b.content_id);
    if (found.length !== 1) {
      issues.push("block_identity");
      continue;
    }
    const actual = found[0];
    for (const field of [
      "type",
      "title",
      "description",
      "currency",
      "quantity",
      "quantity_editable",
      "optional",
      "recurring",
      "unit",
      "unit_value_without_discount_without_tax",
      "unit_value_with_discount_without_tax",
      "unit_value_without_discount_with_tax",
      "unit_value_with_discount_with_tax",
    ] as const) {
      if (actual[field] !== b[field]) issues.push("block_" + field);
    }
    if (JSON.stringify(actual.image_uuids) !== JSON.stringify(b.image_uuids))
      issues.push("images");
    if (b.optional && actual.optional_picked !== false)
      issues.push("optional_selection");
  }
  return { verified: issues.length === 0, issues: [...new Set(issues)] };
}
// Operator-only initial-default probe. Never apply to a commercially edited proposal.
export function buildOptionalDefaultsPatch(
  raw: unknown,
  snapshot: DraftSnapshot,
  mappings: ServiceMapping[],
  companyId: string,
  key: string,
) {
  const fidelity = verifyPricedProposal(
    raw,
    snapshot,
    mappings,
    companyId,
    key,
  );
  if (fidelity.issues.some((i) => i !== "optional_selection"))
    throw new Error("draft_changed");
  const actual = z
    .object({
      blocks: z.array(
        z.object({ uuid: z.uuid(), content_id: z.number().int().positive() }),
      ),
    })
    .parse(raw);
  if (new Set(actual.blocks.map((b) => b.uuid)).size !== actual.blocks.length)
    throw new Error("duplicate_block_uuid");
  const expected = buildPricedPayload(snapshot, mappings, companyId, key);
  return {
    company_id: Number(companyId),
    language: "en",
    blocks: expected.blocks.map((block) => {
      const source = actual.blocks.find(
        (b) => b.content_id === block.content_id,
      );
      if (!source) throw new Error("block_missing");
      const { title: _, description: __, image_uuids: ___, ...terms } = block;
      return { ...terms, uuid: source.uuid, optional_picked: false };
    }),
  };
}
