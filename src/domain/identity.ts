import { z } from "zod";
// Business identity is judged by the model from quoted evidence. Code checks
// only what it can check in any language: the quotes exist in the cited source,
// and they resemble what the user supplied. Character bigrams need no word
// boundaries, so names in scripts without spaces, inflected forms and legal
// suffixes are compared the same way.

// Named, measured parameters (see docs/PROMPTS.md), not per-case tuning.
export const identityThresholds = {
  // Share of the supplied name found in the quoted name. Tolerates "AB"/"Ltd",
  // inflection and quotes longer than the name (page titles); rejects a
  // fragment such as one shared word.
  nameContainment: 0.8,
  // Quoted vs supplied location, containment either way: a city inside a full
  // address or a full address around the typed city.
  locationContainment: 0.8,
  // Website suggestions only filter out directories and social sites, since the
  // operator makes the final pick: domain and name resemble each other either way.
  websiteResemblance: 0.5,
} as const;

const quote = z
  .object({ sourceId: z.string().min(1).max(40), text: z.string().min(1).max(200) })
  .strict();
export const identityOutputSchema = z
  .object({
    status: z.enum(["confirmed", "ambiguous"]),
    reason: z.string().min(1).max(400),
    candidates: z
      .array(
        z
          .object({
            sourceIds: z.array(z.string().min(1).max(40)).min(1).max(8),
            name: quote,
            location: quote.nullable(),
            // Sources the model believes are the business's own website.
            websiteSourceIds: z.array(z.string().min(1).max(40)).max(8).optional(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type IdentityOutput = z.infer<typeof identityOutputSchema>;
export type VerifiedCandidate = IdentityOutput["candidates"][number];

type Source = { id: string; label: string; excerpt: string; url?: string };

// Quotes are compared after Unicode normalisation, case folding and whitespace
// collapse only, so a verified quote is the source's own wording.
const quoteForm = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
// Continuous-text form: diacritics and punctuation dropped, single spaces kept
// so separate words are never joined ("Lu Nd" is not "lund").
const textForm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// Resemblance ignores spacing, punctuation and diacritics.
const compact = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
function bigrams(s: string) {
  const chars = [...compact(s)],
    out = new Map<string, number>();
  const grams =
    chars.length < 2 ? chars : chars.slice(1).map((ch, i) => chars[i] + ch);
  for (const g of grams) if (g) out.set(g, (out.get(g) ?? 0) + 1);
  return out;
}
function shared(a: Map<string, number>, b: Map<string, number>) {
  let n = 0;
  for (const [g, k] of a) n += Math.min(k, b.get(g) ?? 0);
  return n;
}
const size = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);
// One direction only: a quote that is a fragment of the name must not pass.
export function nameResemblance(quoted: string, supplied: string) {
  const q = bigrams(quoted),
    n = bigrams(supplied);
  return size(n) ? shared(n, q) / size(n) : 0;
}
export function locationResemblance(a: string, b: string) {
  const x = bigrams(a),
    y = bigrams(b),
    s = shared(x, y);
  return Math.max(size(x) ? s / size(x) : 0, size(y) ? s / size(y) : 0);
}

// Domain without "www." and the final label: handyheroes.se → "handyheroes".
const domainName = (url?: string) => {
  const h = host(url);
  return h ? h.split(".").slice(0, -1).join("") : "";
};
function ownSites(
  c: VerifiedCandidate,
  businessName: string,
  sources: Map<string, Source>,
  listed: string[],
) {
  const seen = new Set<string>();
  return [...new Set(c.websiteSourceIds ?? [])].filter((id) => {
    const d = domainName(sources.get(id)?.url);
    const own =
      listed.includes(id) &&
      !!d &&
      !seen.has(d) &&
      Math.max(nameResemblance(d, businessName), nameResemblance(businessName, d)) >=
        identityThresholds.websiteResemblance;
    // One suggestion per website: further pages of the same domain are dropped.
    if (own) seen.add(d);
    return own;
  });
}
const host = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
function quoted(q: { sourceId: string; text: string }, sources: Map<string, Source>) {
  const s = sources.get(q.sourceId);
  return !!s && quoteForm(s.label + "\n" + s.excerpt).includes(quoteForm(q.text));
}

export const rejectionCodes = [
  "unknown_source",
  "name_not_quoted",
  "name_mismatch",
  "location_other_source",
  "location_not_quoted",
  "location_mismatch",
  "unanchored",
] as const;
type Rejection = (typeof rejectionCodes)[number];

// A candidate stands only if its name quote is real and contains the supplied
// name, and it is anchored by one of: the name's source is on the supplied
// website; the typed location appears in that source (checked by code, not
// restated by the model); or the model's location quote from that source is
// real and resembles the typed location.
export function verifyCandidate(
  c: VerifiedCandidate,
  input: { businessName: string; location: string; website?: string },
  sources: Map<string, Source>,
): VerifiedCandidate | Rejection {
  const listed = c.sourceIds.filter((id) => sources.has(id));
  if (!listed.includes(c.name.sourceId)) return "unknown_source";
  if (!quoted(c.name, sources)) return "name_not_quoted";
  if (nameResemblance(c.name.text, input.businessName) < identityThresholds.nameContainment)
    return "name_mismatch";
  const nameSource = sources.get(c.name.sourceId)!;
  const onWebsite = !!input.website && host(nameSource.url) === host(input.website);
  const typedPlace = textForm(input.location);
  const inSource =
    !!typedPlace &&
    textForm(nameSource.label + " " + nameSource.excerpt).includes(typedPlace);
  const locationProblem: Rejection | null = !c.location
    ? null
    : c.location.sourceId !== c.name.sourceId
      ? "location_other_source"
      : !quoted(c.location, sources)
        ? "location_not_quoted"
        : locationResemblance(c.location.text, input.location) <
            identityThresholds.locationContainment
          ? "location_mismatch"
          : null;
  const quoteAnchors = !!c.location && !locationProblem;
  if (!onWebsite && !inSource && !quoteAnchors)
    return locationProblem ?? "unanchored";
  // Only a location quote that passed every check is kept for display.
  return {
    ...c,
    sourceIds: listed,
    location: quoteAnchors ? c.location : null,
    websiteSourceIds: ownSites(c, input.businessName, sources, listed),
  };
}

export function decideIdentity(
  out: IdentityOutput,
  input: { businessName: string; location: string; website?: string },
  evidence: Source[],
) {
  const sources = new Map(evidence.map((e) => [e.id, e]));
  const checked = out.candidates.map((c) => verifyCandidate(c, input, sources));
  const candidates = checked.filter((c): c is VerifiedCandidate => typeof c !== "string");
  const rejected = checked.filter((c): c is Rejection => typeof c === "string");
  // The model's ambiguity verdict stands unless every competing candidate it
  // listed is verifiably in another location.
  const elsewhereOnly =
    rejected.length > 0 && rejected.every((r) => r === "location_mismatch");
  const status =
    candidates.length === 1 && (out.status === "confirmed" || elsewhereOnly)
      ? "confirmed"
      : "ambiguous";
  return {
    status,
    identity: {
      reason: out.reason,
      matchedSourceIds: status === "confirmed" ? candidates[0].sourceIds : [],
      candidates,
      rejected,
    },
  } as const;
}
