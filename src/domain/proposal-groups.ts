import { z } from "zod";
import type { DraftSnapshot } from "./offers.js";
import { presentServices } from "./presentation.js";

// Presentation only. The catalogue remains the source of scope and prices.
export const proposalCategories = [
  {
    id: "website-experience",
    title: "Website & customer experience",
    serviceIds: [
      "website-base",
      "booking-integration",
      "enquiry-improvement",
      "service-page",
      "faq-content",
    ],
  },
  {
    id: "search-discoverability",
    title: "Search & discoverability",
    serviceIds: [
      "google-profile",
      "technical-seo",
      "ai-visibility",
      "search-console",
      "seo-maintenance",
    ],
  },
  {
    id: "paid-advertising",
    title: "Paid advertising",
    serviceIds: ["ads-setup", "ads-management"],
  },
  {
    id: "social-media",
    title: "Social media",
    serviceIds: ["social-management"],
  },
  {
    id: "ongoing-care",
    title: "Ongoing care",
    serviceIds: ["website-maintenance"],
  },
] as const;
export type CategoryId = (typeof proposalCategories)[number]["id"];
const providerIdentity = {
  productId: z.number().int().positive().safe(),
  variationId: z.number().int().positive().safe(),
  imageUuid: z.uuid(),
};
export const compositionAssetsSchema = z
  .object({
    version: z.literal("categories-1"),
    companyId: z
      .string()
      .regex(/^[1-9]\d*$/)
      .refine((v) => Number.isSafeInteger(Number(v))),
    categories: z
      .array(
        z
          .object({
            categoryId: z.enum(proposalCategories.map((c) => c.id)),
            ...providerIdentity,
          })
          .strict(),
      )
      .length(5),
    services: z
      .array(
        z
          .object({ serviceId: z.string().min(1), ...providerIdentity })
          .strict(),
      )
      .min(1)
      .max(14),
  })
  .strict()
  .superRefine((value, ctx) => {
    const unique = (ids: (number | string)[]) =>
      new Set(ids).size === ids.length;
    if (
      !unique(value.categories.map((c) => c.categoryId)) ||
      !unique(value.services.map((s) => s.serviceId)) ||
      !unique(
        [...value.categories, ...value.services].map((a) => a.variationId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate composition asset identity",
      });
  });
export type CompositionAssets = z.infer<typeof compositionAssetsSchema>;
export function categoryForService(serviceId: string) {
  const category = proposalCategories.find((c) =>
    (c.serviceIds as readonly string[]).includes(serviceId),
  );
  if (!category) throw new Error("unsupported_service_category");
  return category;
}
export type ProposalGroup = {
  key: string;
  categoryId: CategoryId;
  title: string;
  billing: "one-time" | "monthly";
  disposition: "core" | "optional";
  items: DraftSnapshot["items"];
};
export function groupProposalItems(
  snapshot: Pick<DraftSnapshot, "items" | "catalogue">,
): ProposalGroup[] {
  const groups = new Map<string, ProposalGroup>();
  for (const item of presentServices(snapshot.items, snapshot.catalogue)) {
    const category = categoryForService(item.serviceId);
    const key =
      item.disposition === "optional"
        ? `optional:${item.serviceId}`
        : `core:${item.billing}:${category.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        categoryId: category.id,
        title: category.title,
        billing: item.billing,
        disposition: item.disposition,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
