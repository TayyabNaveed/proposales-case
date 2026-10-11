import type { IdentityCase } from "./identity/cases.js";
type Identified = {
  status: "confirmed" | "ambiguous";
  identity: {
    matchedSourceIds: string[];
    candidates: { websiteSourceIds?: string[] }[];
  };
};
// Scores one live identify decision. A failed call counts as a miss, never as
// ambiguous. Website suggestions are scored only where a case labels them.
export function evaluateIdentity(c: IdentityCase, result: Identified | null) {
  const status = result ? result.status : "failed";
  const matched = result?.identity.matchedSourceIds ?? [];
  const sourcesMatch =
    status !== "confirmed" || c.expected !== "confirmed"
      ? null
      : (c.mustMatch ?? []).every((id) => matched.includes(id)) &&
        !(c.mustNotMatch ?? []).some((id) => matched.includes(id));
  const suggested =
    status === "confirmed" ? (result!.identity.candidates[0]?.websiteSourceIds ?? []) : [];
  const websiteMatch =
    !c.websiteAny || status !== "confirmed"
      ? null
      : c.websiteAny.some((id) => suggested.includes(id));
  return {
    id: c.id,
    expected: c.expected,
    status,
    statusMatches: status === c.expected,
    sourcesMatch,
    websiteMatch,
    suggestedWebsites: suggested,
  };
}
