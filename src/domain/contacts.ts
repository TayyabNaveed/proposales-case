import type { ReportV2 } from "./reports.js";
// Recipient email suggestions, found by code in the chosen business's sources;
// nothing is generated. Addresses on the business's own website domain come
// first, role addresses (info@, kontakt@…) before personal ones. A source's own
// address, such as a directory's support email, is never suggested.
const email = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const roles = /^(info|kontakt|contact|hello|hej|support|office|mail|booking|bokning|post|sales)@/i;
const host = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "").toLowerCase() : "";
  } catch {
    return "";
  }
};
export function contactSuggestions(report: ReportV2, max = 3): string[] {
  const site =
    report.identity?.website?.kind === "typed"
      ? host(report.identity.website.url)
      : host(report.evidence.find((e) => report.capabilities.website.evidenceIds.includes(e.id))?.url);
  const found = new Map<string, number>();
  for (const e of report.evidence) {
    const sourceHost = host(e.url);
    for (const m of e.excerpt.match(email) ?? []) {
      const address = m.replace(/[.]+$/, "").toLowerCase(),
        domain = address.split("@")[1];
      // A non-business source's own address is that site's contact, not the client's.
      if (sourceHost && domain === sourceHost && domain !== site) continue;
      const rank = (domain === site ? 0 : 2) + (roles.test(address) ? 0 : 1);
      found.set(address, Math.min(rank, found.get(address) ?? Infinity));
    }
  }
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([a]) => a);
}
