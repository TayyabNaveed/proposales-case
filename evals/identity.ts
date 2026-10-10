import type { ReportV2 } from "../src/domain/reports.js";
import type { IdentityCase } from "./identity/cases.js";
// Scores one live identity decision. A failed report counts as a miss, never as
// ambiguous. Source checks apply only where the report exposes matched sources.
export function evaluateIdentity(c: IdentityCase, report: ReportV2 | null) {
  const status = report ? report.identityStatus : "failed";
  const matched = (report as { identity?: { matchedSourceIds: string[] } } | null)
    ?.identity?.matchedSourceIds;
  const sourcesMatch =
    status !== "confirmed" || c.expected !== "confirmed" || !matched
      ? null
      : (c.mustMatch ?? []).every((id) => matched.includes(id)) &&
        !(c.mustNotMatch ?? []).some((id) => matched.includes(id));
  return {
    id: c.id,
    expected: c.expected,
    status,
    statusMatches: status === c.expected,
    sourcesMatch,
  };
}
