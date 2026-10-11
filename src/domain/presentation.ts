import type { CatalogueV2 } from "./catalogue.js";
// New snapshots use the latest composition; earlier ones keep theirs exactly.
export const compositionVersion = "proposal-3" as const;
export const supportedCompositions = [
  "proposal-2",
  "proposal-3",
  "proposal-4",
] as const;
export type CompositionVersion = (typeof supportedCompositions)[number];
// Presentation only. Canonical selection order remains unchanged for identity.
const serviceOrder = [
  "website-base",
  "booking-integration",
  "enquiry-improvement",
  "service-page",
  "faq-content",
  "google-profile",
  "technical-seo",
  "ai-visibility",
  "search-console",
  "ads-setup",
  "ads-management",
  "social-management",
  "website-maintenance",
  "seo-maintenance",
];
export function presentServices<
  T extends { serviceId: string; disposition: "core" | "optional" },
>(items: readonly T[], catalogue: CatalogueV2): T[] {
  const rank = (i: T) => {
    const svc = catalogue.services.find((s) => s.id === i.serviceId);
    const index = serviceOrder.indexOf(i.serviceId);
    return (
      (i.disposition === "optional" ? 1000 : 0) +
      (svc?.billing === "monthly" ? 100 : 0) +
      (index < 0 ? serviceOrder.length : index)
    );
  };
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || a.serviceId.localeCompare(b.serviceId),
  );
}
