import { z } from "zod";
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
    identityStatus: z.enum(["confirmed", "ambiguous"]),
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
const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// A detailed address must not make matching harder: any comma-separated part or
// place word (4+ letters) of the supplied location counts beside the exact name.
function locationTerms(location: string) {
  const parts = location.split(",").map(normal).filter(Boolean);
  const words = parts.flatMap((p) =>
    p.split(" ").filter((w) => w.length >= 4 && !/\d/.test(w)),
  );
  return [...new Set([normal(location), ...parts, ...words])];
}
export function identitySupported(
  input: Pick<ResearchInput, "businessName" | "location">,
  evidence: Evidence[],
) {
  // Each name word may carry a possessive s ("Stadsmissionens Second Hand").
  const name = new RegExp(
      "(?:^| )" +
        normal(input.businessName)
          .split(" ")
          .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?")
          .join(" ") +
        "(?= |$)",
    ),
    terms = locationTerms(input.location);
  return evidence.some((e) =>
    e.excerpt.split(/[.!?\n]/).some((sentence) => {
      const s = normal(sentence),
        match = name.exec(s),
        n = match ? match.index : -1,
        end = match ? n + match[0].length : 0;
      // Exclude the name itself, so "Uppsala Bil" alone cannot match "Uppsala".
      const around =
        s.slice(Math.max(0, n - 200), Math.max(0, n)) +
        " " +
        s.slice(end, end + 200);
      return (
        n >= 0 &&
        terms.some((t) => around.includes(t)) &&
        !/\b(other|unrelated|different|not|rather)\b/.test(s)
      );
    }),
  );
}
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
  for (const f of out.findings) {
    if (f.kind !== "observed" && /\d+\s*%/.test(f.claim))
      throw new Error("research_unsupported");
    if (f.evidenceIds.some((id) => !known.has(id)))
      throw new Error("research_unsupported");
    if (
      f.kind === "observed" &&
      (f.claim.length < 12 ||
        !f.evidenceIds.some((id) =>
          known
            .get(id)!
            .excerpt.replace(/\s+/g, " ")
            .includes(f.claim.replace(/\s+/g, " ")),
        ))
    )
      throw new Error("research_unsupported");
  }
  for (const claim of [
    out.summary,
    ...out.findings.map((f) => f.claim),
    ...out.actions.map((a) => a.text),
  ]) {
    if (
      /\b(?:no|without|absent|missing|lacks?|does not have)\b[^.!?]{0,80}\b(?:website|google business profile|search console)\b/i.test(
        claim,
      ) ||
      /(?:no|without|does not have|lacks?|missing) (?:a |an )?(?:website|google business profile|search console)|ranked? (?:number|#|\d)|page\s?speed|(?:traffic|conversion|ranking|visibility|revenue)[^.!?]{0,80}\d+\s*%|AI visibility (?:score|rank)/i.test(
        claim,
      )
    )
      throw new Error("research_unsupported");
  }
  const identityStatus =
    out.identityStatus === "confirmed" && identitySupported(input, evidence)
      ? "confirmed"
      : "ambiguous";
  const matched =
    input.website && identityStatus === "confirmed"
      ? evidence.filter(
          (e) =>
            e.url &&
            identitySupported(input, [e]) &&
            new URL(e.url).hostname === new URL(input.website!).hostname,
        )
      : [];
  const unknown = () => ({ status: "unknown" as const, evidenceIds: [] });
  return reportSchema.parse({
    id,
    version: 2,
    mode: "live",
    businessName: input.businessName,
    summary: out.summary,
    identityStatus,
    goals: [],
    capabilities: {
      website: matched.length
        ? { status: "present", evidenceIds: matched.map((e) => e.id) }
        : unknown(),
      profile: unknown(),
      campaign: unknown(),
    },
    findings: out.findings,
    actions: out.actions,
    evidence,
    uncertainties: [
      ...out.uncertainties,
      ...(identityStatus === "ambiguous"
        ? [
            "Business identity is unconfirmed; confirm name, location and website before recommending services.",
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
