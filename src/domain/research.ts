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
// Search results cannot show that a business lacks a website, Google Business
// Profile or Search Console, or measure rankings and traffic. Only claims that
// the business has none of these are rejected; "no prices on its website" is
// about content, not absence, and passes. English phrasing only.
const asset =
  "(?:web ?site|google business profile|business profile|search console)";
const unsupportedPatterns: [string, RegExp][] = [
  // "has no website", "without a Google Business Profile", "lacks its own website"
  [
    "absence_claim",
    new RegExp(
      String.raw`\b(?:no|without|lacks?|lacking|missing|absence of|(?:does|do)(?:n['’]t| not) have|(?:has|have)(?:n['’]t| not)(?: got)?)\s+(?:(?:a|an|any|its|their|the|own|official|dedicated|public|active|working|functional|proper|verified|claimed)\s+){0,3}` +
        asset +
        // "missing website content" is about content, not the website.
        String.raw`\b(?!\s+(?:content|pages?|copy|text|information|details|features?|sections?)\b)`,
      "i",
    ),
  ],
  // "the website is missing", "a Search Console account was not found"
  [
    "absence_state",
    new RegExp(
      asset +
        String.raw`(?:\s+\w+)?\s+(?:is|was|are|were|appears|seems)\s+(?:to be\s+)?(?:missing|absent|not (?:found|present|set up))`,
      "i",
    ),
  ],
  // "could not find a website"
  [
    "not_found_claim",
    new RegExp(
      String.raw`\b(?:could not|couldn['’]t|cannot|can['’]t|did not|didn['’]t)\s+(?:find|locate|identify)\s+(?:(?:a|an|any|its|their)\s+)?` +
        asset,
      "i",
    ),
  ],
  [
    "unmeasured_metric",
    /\brank(?:s|ed)? (?:number|#|\d)|page\s?speed|(?:traffic|conversion|ranking|visibility|revenue)[^.!?]{0,80}\d+\s*%|AI visibility (?:score|rank)/i,
  ],
];
// Returns the name of the rule a claim breaks, or null.
export function unsupportedClaim(text: string) {
  return (
    unsupportedPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null
  );
}
// Names the broken rule, so a failed run records why without storing model text.
export class UnsupportedSummary extends Error {
  constructor(readonly rule: string) {
    super("research_unsupported_summary");
  }
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
  const forbidden = (claim: string) => !!unsupportedClaim(claim);
  // The summary cannot be removed, so an unsupported summary rejects the report.
  const rule = unsupportedClaim(out.summary);
  if (rule) throw new UnsupportedSummary(rule);
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
