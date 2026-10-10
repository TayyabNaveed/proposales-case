import { z } from "zod";
import { identityOutputSchema, decideIdentity } from "./identity.js";
import { reportSchema, type ReportV2 } from "./reports.js";
export function publicSourceUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port
    )
      return null;
    const h = u.hostname.toLowerCase();
    if (
      !h.includes(".") ||
      h.endsWith(".local") ||
      h.endsWith(".internal") ||
      h.includes(":") ||
      /^\d+(\.\d+){3}$/.test(h) ||
      h === "localhost"
    )
      return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}
export const researchInputSchema = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(120),
    website: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => !v || !!publicSourceUrl(v), "invalid_public_url"),
  })
  .strict();
export type ResearchInput = z.infer<typeof researchInputSchema>;
export type Evidence = ReportV2["evidence"][number];
const text = z.string().min(1).max(600);
export const researchOutputSchema = z
  .object({
    identity: identityOutputSchema,
    summary: text,
    findings: z
      .array(
        z
          .object({
            id: z.string().min(1).max(40),
            section: z.string().min(1).max(60),
            claim: text,
            kind: z.enum(["observed", "inferred", "unknown"]),
            evidenceIds: z.array(z.string()).min(1).max(8),
          })
          .strict(),
      )
      .max(12),
    actions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(40),
            text,
            findingIds: z.array(z.string()).min(1).max(12),
          })
          .strict(),
      )
      .max(8),
    uncertainties: z.array(text).max(12),
  })
  .strict();
export function splitEvidence<E extends { id: string }>(report: {
  evidence: E[];
  findings: { evidenceIds: string[] }[];
}) {
  const used = new Set(report.findings.flatMap((f) => f.evidenceIds));
  return {
    cited: report.evidence.filter((e) => used.has(e.id)),
    other: report.evidence.filter((e) => !used.has(e.id)),
  };
}
export function buildLiveReport(
  input: ResearchInput,
  evidence: Evidence[],
  raw: unknown,
  id: string,
): ReportV2 {
  input = researchInputSchema.parse(input);
  const out = researchOutputSchema.parse(raw);
  const known = new Map(evidence.map((e) => [e.id, e]));
  const forbidden = (claim: string) =>
    /\b(?:no|without|absent|missing|lacks?|does not have)\b[^.!?]{0,80}\b(?:website|google business profile|search console)\b/i.test(
      claim,
    ) ||
    /(?:no|without|does not have|lacks?|missing) (?:a |an )?(?:website|google business profile|search console)|ranked? (?:number|#|\d)|page\s?speed|(?:traffic|conversion|ranking|visibility|revenue)[^.!?]{0,80}\d+\s*%|AI visibility (?:score|rank)/i.test(
      claim,
    );
  // The summary cannot be removed, so an unsupported summary rejects the report.
  if (forbidden(out.summary)) throw new Error("research_unsupported_summary");
  // One unsupported finding or action is removed and disclosed rather than
  // discarding every supported statement; nothing unsupported is shown.
  const findings = out.findings.filter(
    (f) =>
      !(f.kind !== "observed" && /\d+\s*%/.test(f.claim)) &&
      !f.evidenceIds.some((id) => !known.has(id)) &&
      !(
        f.kind === "observed" &&
        (f.claim.length < 12 ||
          !f.evidenceIds.some((id) =>
            known
              .get(id)!
              .excerpt.replace(/\s+/g, " ")
              .includes(f.claim.replace(/\s+/g, " ")),
          ))
      ) &&
      !forbidden(f.claim),
  );
  const kept = new Set(findings.map((f) => f.id));
  const actions = out.actions
    .filter((a) => !forbidden(a.text))
    .map((a) => ({ ...a, findingIds: a.findingIds.filter((id) => kept.has(id)) }))
    .filter((a) => a.findingIds.length);
  // Actions that only lost their findings are a consequence, not counted again.
  const removed =
    out.findings.length -
    findings.length +
    out.actions.filter((a) => forbidden(a.text)).length;
  const { status: identityStatus, identity } = decideIdentity(
    out.identity,
    input,
    evidence,
  );
  // The website is present only when the matched business has a source on the
  // website the user supplied.
  const siteHost = input.website
    ? new URL(input.website).hostname.replace(/^www\./, "")
    : null;
  const matched = evidence.filter(
    (e) =>
      siteHost &&
      e.url &&
      identity.matchedSourceIds.includes(e.id) &&
      new URL(e.url).hostname.replace(/^www\./, "") === siteHost,
  );
  const unknown = () => ({ status: "unknown" as const, evidenceIds: [] });
  return reportSchema.parse({
    id,
    version: 2,
    mode: "live",
    businessName: input.businessName,
    summary: out.summary,
    identityStatus,
    identity,
    goals: [],
    capabilities: {
      website: matched.length
        ? { status: "present", evidenceIds: matched.map((e) => e.id) }
        : unknown(),
      profile: unknown(),
      campaign: unknown(),
    },
    findings,
    actions,
    evidence,
    uncertainties: [
      ...out.uncertainties,
      ...(removed
        ? [
            `${removed} ${removed === 1 ? "statement was" : "statements were"} removed because the sources did not support ${removed === 1 ? "it" : "them"}.`,
          ]
        : []),
      ...(identityStatus === "ambiguous"
        ? [
            identity.candidates.length > 1
              ? "Several businesses match this name and location; confirm which one before recommending services."
              : "No source clearly ties this business name to the location or website supplied; confirm them before recommending services.",
          ]
        : []),
      "Public search does not establish account ownership, advertising budget, analytics or Search Console status.",
    ],
  });
}

export function canRestartReport(
  stage: { state: string; createdAt: string },
  now = Date.now(),
) {
  return (
    stage.state === "failed" ||
    (stage.state === "running" &&
      Number.isFinite(Date.parse(stage.createdAt)) &&
      now - Date.parse(stage.createdAt) >= 180000)
  );
}
