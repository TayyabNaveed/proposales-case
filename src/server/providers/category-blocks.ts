import type { DraftSnapshot } from "../../domain/offers.js";
import {
  compositionAssetsSchema,
  groupProposalItems,
} from "../../domain/proposal-groups.js";
import { snapshotHash } from "../canonical.js";

export function checkedCompositionAssets(
  snapshot: DraftSnapshot,
  companyId: string,
) {
  const assets = compositionAssetsSchema.parse(snapshot.compositionAssets);
  if (assets.companyId !== companyId)
    throw new Error("composition_company_mismatch");
  if (
    JSON.stringify(assets.services.map((s) => s.serviceId).sort()) !==
    JSON.stringify(snapshot.items.map((i) => i.serviceId).sort())
  )
    throw new Error("composition_service_mismatch");
  return assets;
}
function rowUuid(snapshot: DraftSnapshot, key: string, serviceId: string) {
  const h = snapshotHash({ snapshot, key, serviceId });
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function scopeText(item: DraftSnapshot["items"][number]) {
  return `${item.deliverables.join("\n")}${item.rationale ? `\n\nWhy: ${item.rationale}` : ""}\n\nExcludes: ${item.exclusions.join("; ")}`;
}
export function categoryBlocks(snapshot: DraftSnapshot, companyId: string) {
  const assets = checkedCompositionAssets(snapshot, companyId);
  return groupProposalItems(snapshot).map((group) => {
    const category = assets.categories.find(
      (c) => c.categoryId === group.categoryId,
    )!;
    const optional = group.disposition === "optional";
    const first = group.items[0];
    const content = optional
      ? assets.services.find((s) => s.serviceId === first.serviceId)!
      : category;
    const amount = optional
      ? first.unitPriceMinor
      : group.items.reduce((n, i) => n + i.unitPriceMinor * i.quantity, 0);
    const monthly = group.billing === "monthly";
    return {
      content_id: content.variationId,
      type: "product-block" as const,
      title:
        (optional ? first.title : group.title) +
        (monthly ? " — per month" : ""),
      description: `${optional ? scopeText(first) : "Included services are detailed below."}\n\nBilling: ${monthly ? "Recurring monthly services" : "One-time"}; prices exclude VAT.`,
      image_uuids: [category.imageUuid],
      currency: snapshot.currency,
      quantity: optional ? first.quantity : 1,
      quantity_editable: false,
      optional,
      optional_picked: false,
      recurring: monthly,
      unit: monthly ? "month" : "unit",
      unit_value_without_discount_without_tax: amount,
      unit_value_with_discount_without_tax: amount,
      unit_value_without_discount_with_tax: amount,
      unit_value_with_discount_with_tax: amount,
      multi_product_enabled: !optional,
      ...(!optional
        ? {
            multi_product_data: group.items.map((item) => ({
              uuid: rowUuid(snapshot, group.key, item.serviceId),
              label: item.title,
              notes: scopeText(item),
              quantity: item.quantity,
              unit: monthly ? "month" : "unit",
              unitValueWithDiscountWithoutTax: item.unitPriceMinor,
              unitValueWithDiscountWithTax: item.unitPriceMinor,
              unitValueWithoutDiscountWithoutTax: item.unitPriceMinor,
              unitValueWithoutDiscountWithTax: item.unitPriceMinor,
            })),
          }
        : {}),
    };
  });
}
export function verifyCategoryBlocks(
  actual: Record<string, unknown>[],
  expected: ReturnType<typeof categoryBlocks>,
): string[] {
  const issues: string[] = [];
  if (actual.length !== expected.length) issues.push("block_count");
  expected.forEach((block, index) => {
    const got = actual[index];
    if (!got) return;
    for (const [field, value] of Object.entries(block)) {
      if (field === "multi_product_data" || field === "optional_picked")
        continue;
      if (JSON.stringify(got[field]) !== JSON.stringify(value))
        issues.push("block_" + field);
    }
    if (block.optional && got.optional_picked !== false)
      issues.push("optional_selection");
    if (
      ["relative", "quantity_variable", "inventory_connected"].some(
        (k) => got[k] === true,
      ) ||
      ["fixed_discount", "percent_discount"].some(
        (k) => got[k] != null && got[k] !== 0,
      )
    )
      issues.push("unexpected_pricing_rule");
    if (block.multi_product_data) {
      const rows = got.multi_product_data;
      if (
        !Array.isArray(rows) ||
        rows.length !== block.multi_product_data.length
      ) {
        issues.push("row_count");
        return;
      }
      block.multi_product_data.forEach((row, i) => {
        const r = rows[i];
        if (!r || typeof r !== "object") {
          issues.push("row_shape");
          return;
        }
        for (const [field, value] of Object.entries(row))
          if (r[field] !== value) issues.push("row_" + field);
        if (
          (Array.isArray(r.subrows) && r.subrows.length) ||
          ["discount", "fixed_discount"].some((k) => r[k] != null && r[k] !== 0)
        )
          issues.push("unexpected_row_pricing");
      });
    }
  });
  return [...new Set(issues)];
}
