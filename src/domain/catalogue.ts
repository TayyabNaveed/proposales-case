export const catalogueVersion = "demo-2";
export type Service = {
  id: string;
  title: string;
  unitPriceMinor: number;
  billing: "one-time" | "monthly";
  maxQuantity: number;
  requires: "website" | "profile" | "campaign" | null;
  deliverables: string[];
  exclusions: string[];
  conflictsWith: string[];
};
const service = (
  id: string,
  title: string,
  price: number,
  billing: Service["billing"],
  maxQuantity: number,
  requires: Service["requires"],
  scope: string,
  excludes: string,
): Service => ({
  id,
  title,
  unitPriceMinor: price,
  billing,
  maxQuantity,
  requires,
  deliverables: [scope],
  exclusions: [excludes],
  conflictsWith:
    id === "website-base"
      ? ["enquiry-improvement", "technical-seo"]
      : ["enquiry-improvement", "technical-seo"].includes(id)
        ? ["website-base"]
        : [],
});
export const catalogue: Service[] = [
  service(
    "website-base",
    "Website foundation",
    120000,
    "one-time",
    1,
    null,
    "Five-page responsive website, contact form, basic metadata and sitemap",
    "Hosting, copywriting, Search Console setup and maintenance",
  ),
  service(
    "service-page",
    "Additional service page",
    15000,
    "one-time",
    10,
    "website",
    "One additional service page beyond the five-page base",
    "Base website pages and copywriting",
  ),
  service(
    "booking-integration",
    "Booking integration",
    40000,
    "one-time",
    1,
    "website",
    "Connect one supported booking tool",
    "Tool subscription and custom booking software",
  ),
  service(
    "enquiry-improvement",
    "Enquiry-flow improvement",
    40000,
    "one-time",
    1,
    "website",
    "Improve existing enquiry navigation and form confirmation",
    "Website rebuild",
  ),
  service(
    "technical-seo",
    "Technical SEO remediation",
    35000,
    "one-time",
    1,
    "website",
    "Remediate evidenced technical search issues",
    "Guaranteed rankings and new content",
  ),
  service(
    "ai-visibility",
    "AI visibility foundations",
    25000,
    "one-time",
    1,
    "website",
    "Answer-readiness and structured information audit with action list",
    "Guaranteed AI mentions or measured visibility improvement",
  ),
  service(
    "faq-content",
    "FAQ content page",
    30000,
    "one-time",
    5,
    "website",
    "One researched FAQ/content page",
    "Service pages already included elsewhere",
  ),
  service(
    "google-profile",
    "Google Business Profile improvement",
    25000,
    "one-time",
    1,
    "profile",
    "Update confirmed profile information with owner access",
    "Guaranteed local rankings and profile verification",
  ),
  service(
    "search-console",
    "Search Console setup",
    10000,
    "one-time",
    1,
    "website",
    "Verify property and submit sitemap with owner access",
    "Guaranteed indexing or rankings",
  ),
  service(
    "ads-setup",
    "Search ads setup",
    30000,
    "one-time",
    1,
    "website",
    "Set up one search campaign with agreed targeting and conversion tracking; owner access required",
    "Media spend and ongoing management",
  ),
  service(
    "ads-management",
    "Ads management",
    25000,
    "monthly",
    1,
    "campaign",
    "Manage and review one search campaign monthly",
    "Media spend and campaign setup",
  ),
  service(
    "social-management",
    "Social media management",
    30000,
    "monthly",
    1,
    null,
    "Eight posts per month across up to two channels with owner access",
    "Ad spend and video production",
  ),
  service(
    "website-maintenance",
    "Website maintenance",
    8000,
    "monthly",
    1,
    "website",
    "Updates, backups and basic support",
    "Hosting and major changes",
  ),
  service(
    "seo-maintenance",
    "SEO maintenance",
    18000,
    "monthly",
    1,
    "website",
    "Monthly performance review and optimisation",
    "New content and guaranteed rankings",
  ),
];
export type CatalogueV2 = {
  version: string;
  currency: "EUR";
  demo: true;
  services: Service[];
};
export const catalogueV2: CatalogueV2 = {
  version: catalogueVersion,
  currency: "EUR",
  demo: true,
  services: catalogue,
};
export function money(minor: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
