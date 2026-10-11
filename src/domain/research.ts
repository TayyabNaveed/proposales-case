import { z } from "zod";
import { identityOutputSchema, type VerifiedCandidate } from "./identity.js";
import {
  reportSchema,
  operatorWebsiteSchema,
  type ReportV2,
  type OperatorWebsite,
} from "./reports.js";
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
// The identify stage's model output: candidates only (business-identity-1).
export const identifyOutputSchema = identityOutputSchema;
// The operator's single decision after identify: which candidate, and the website.
export const operatorChoiceSchema = z
  .object({
    candidate: z.number().int().min(0).max(2),
    website: operatorWebsiteSchema,
    // What the client said, e.g. on a call. Optional; empty means none.
    notes: z
      .string()
      .max(1000)
      .optional()
      .transform((v) => v?.trim() || undefined),
  })
  .strict()
  .refine(
    (c) => c.website.kind !== "typed" || !!publicSourceUrl(c.website.url),
    "invalid_public_url",
  );
export type OperatorChoice = z.input<typeof operatorChoiceSchema>;
export type ChosenBusiness = { candidate: VerifiedCandidate; website: OperatorWebsite };
// The operator's client notes as one attributed source. Its time is the identify
// run's, so the same notes give the same report cache identity.
export const notesSourceId = "notes";
export function notesEvidence(notes: string, at: string): Evidence {
  return {
    id: notesSourceId,
    label: "Notes from the operator",
    excerpt: notes,
    synthetic: false,
    retrievedAt: at,
  };
}
export type Evidence = ReportV2["evidence"][number];
const text = z.string().min(1).max(600);
export const researchOutputSchema = z
  .object({
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
// The report covers only the operator-chosen business's sources. Identity and the
// website are the operator's facts, recorded by code; the model asserts neither.
export function buildLiveReport(
  input: ResearchInput,
  evidence: Evidence[],
  raw: unknown,
  id: string,
  chosen: ChosenBusiness,
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
  const website = chosen.website;
  if (website.kind === "selected" && !known.has(website.sourceId))
    throw new Error("research_choice_invalid");
  const unknown = () => ({ status: "unknown" as const, evidenceIds: [] });
  return reportSchema.parse({
    id,
    version: 2,
    mode: "live",
    businessName: input.businessName,
    summary: out.summary,
    identityStatus: "confirmed",
    identity: {
      reason: "Chosen by the operator from the verified candidates.",
      matchedSourceIds: chosen.candidate.sourceIds.filter((s) => known.has(s)),
      candidates: [chosen.candidate],
      rejected: [],
      chosenBy: "operator",
      website,
    },
    // Client notes are the owner's stated goals; public search never provides them.
    goals: known.has(notesSourceId)
      ? [{ text: known.get(notesSourceId)!.excerpt, sourceId: notesSourceId }]
      : [],
    capabilities: {
      website:
        website.kind === "selected"
          ? { status: "present", evidenceIds: [website.sourceId], confirmedBy: "operator" }
          : website.kind === "typed"
            ? { status: "present", evidenceIds: [], confirmedBy: "operator" }
            : { status: "absent", evidenceIds: [], confirmedBy: "operator" },
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
