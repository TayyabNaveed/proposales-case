import { z } from "zod";
import { identityOutputSchema, rejectionCodes } from "./identity.js";
const id = z.string().min(1);
const capability = z
  .object({
    status: z.enum(["present", "absent", "unknown"]),
    evidenceIds: z.array(id),
  })
  .strict();
export const reportSchema = z
  .object({
    id,
    version: z.literal(2),
    mode: z.enum(["synthetic", "live"]),
    businessName: id,
    summary: id,
    identityStatus: z.enum(["confirmed", "ambiguous"]),
    // Live reports only: verified identity evidence. Absent on examples and on
    // reports created before research-validation-5.
    identity: z
      .object({
        reason: id,
        matchedSourceIds: z.array(id),
        candidates: identityOutputSchema.shape.candidates,
        // Why candidates the model proposed were removed; codes only.
        rejected: z.array(z.enum(rejectionCodes)),
      })
      .strict()
      .optional(),
    goals: z.array(z.object({ text: id, sourceId: id }).strict()),
    capabilities: z
      .object({
        website: capability,
        profile: capability,
        campaign: capability,
      })
      .strict(),
    findings: z.array(
      z
        .object({
          id,
          section: id,
          claim: id,
          kind: z.enum(["observed", "inferred", "unknown"]),
          evidenceIds: z.array(id).min(1),
        })
        .strict(),
    ),
    actions: z.array(
      z.object({ id, text: id, findingIds: z.array(id).min(1) }).strict(),
    ),
    evidence: z.array(
      z
        .object({
          id,
          label: id,
          excerpt: id,
          synthetic: z.boolean(),
          url: z.url().optional(),
          retrievedAt: z.iso.datetime().optional(),
        })
        .strict(),
    ),
    uncertainties: z.array(id),
  })
  .strict()
  .superRefine((r, ctx) => {
    const evidence = new Set(r.evidence.map((e) => e.id)),
      findings = new Set(r.findings.map((f) => f.id));
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      evidence.size !== r.evidence.length ||
      findings.size !== r.findings.length ||
      new Set(r.actions.map((a) => a.id)).size !== r.actions.length
    )
      bad("duplicate_id");
    if (
      r.goals.some((g) => !evidence.has(g.sourceId)) ||
      r.findings.some((f) => f.evidenceIds.some((e) => !evidence.has(e))) ||
      r.actions.some((a) => a.findingIds.some((f) => !findings.has(f))) ||
      (r.identity &&
        [
          ...r.identity.matchedSourceIds,
          ...r.identity.candidates.flatMap((c) => [
            ...c.sourceIds,
            c.name.sourceId,
            ...(c.location ? [c.location.sourceId] : []),
          ]),
        ].some((e) => !evidence.has(e)))
    )
      bad("broken_reference");
    if (
      r.identity &&
      (r.identityStatus === "confirmed") !== r.identity.matchedSourceIds.length > 0
    )
      bad("identity_mismatch");
    for (const c of Object.values(r.capabilities))
      if (
        (c.status !== "unknown" && !c.evidenceIds.length) ||
        c.evidenceIds.some((e) => !evidence.has(e))
      )
        bad("unsupported_capability");
    if (r.mode === "synthetic" && r.evidence.some((e) => !e.synthetic))
      bad("invalid_synthetic_source");
    if (
      r.mode === "live" &&
      r.evidence.some((e) => e.synthetic || !e.retrievedAt)
    )
      bad("invalid_live_source");
  });
export type ReportV2 = z.infer<typeof reportSchema>;
export type ExampleReport = ReportV2;
const source = (id: string, excerpt: string) => ({
  id,
  label: "Synthetic owner questionnaire",
  excerpt,
  synthetic: true,
});
const finding = (
  id: string,
  section: string,
  claim: string,
  kind: "observed" | "inferred" | "unknown",
  evidenceIds: string[],
) => ({ id, section, claim, kind, evidenceIds });
const unknown = () => ({ status: "unknown" as const, evidenceIds: [] });
export const reports: ReportV2[] = [
  reportSchema.parse({
    id: "no-website",
    version: 2,
    mode: "synthetic",
    businessName: "Northstar Bicycle Workshop",
    summary:
      "A local workshop wants clearer service information and fewer repeated phone questions.",
    identityStatus: "confirmed",
    goals: [
      {
        text: "Help customers understand services before calling",
        sourceId: "n1",
      },
    ],
    capabilities: {
      website: { status: "absent", evidenceIds: ["n1"] },
      profile: unknown(),
      campaign: unknown(),
    },
    evidence: [
      source(
        "n1",
        "We have no website. Customers phone for services and opening hours.",
      ),
      source(
        "n2",
        "We offer repairs, custom builds and fleet servicing. Beyond five base pages we need separate custom-build and fleet pages, plus answers to common questions.",
      ),
      source(
        "n3",
        "We have no staff to maintain a website and would like ongoing support.",
      ),
      source(
        "n4",
        "Our advertising budget and campaign status have not been confirmed.",
      ),
    ],
    findings: [
      finding(
        "nf1",
        "website",
        "The owner confirms there is no website.",
        "observed",
        ["n1"],
      ),
      finding(
        "nf2",
        "discovery",
        "A clear online home could reduce repeated questions.",
        "inferred",
        ["n1"],
      ),
      finding(
        "nf3",
        "content",
        "Distinct service information and frequently asked questions need dedicated content.",
        "observed",
        ["n2"],
      ),
      finding(
        "nf4",
        "operations",
        "The owner requests ongoing website support.",
        "observed",
        ["n3"],
      ),
      finding(
        "nf5",
        "advertising",
        "Advertising budget and campaign status are unknown.",
        "unknown",
        ["n4"],
      ),
    ],
    actions: [
      {
        id: "na1",
        text: "Create an online home and clarify the service information",
        findingIds: ["nf1", "nf3"],
      },
    ],
    uncertainties: ["Confirm budget, hosting and profile ownership."],
  }),
  reportSchema.parse({
    id: "enquiry-flow",
    version: 2,
    mode: "synthetic",
    businessName: "Juniper Ceramics Studio",
    summary:
      "An existing website makes it hard for mobile visitors to enquire about workshops.",
    identityStatus: "confirmed",
    goals: [{ text: "Increase completed workshop enquiries", sourceId: "j1" }],
    capabilities: {
      website: { status: "present", evidenceIds: ["j1"] },
      profile: { status: "present", evidenceIds: ["j3"] },
      campaign: unknown(),
    },
    evidence: [
      source(
        "j1",
        "Our website exists. The mobile booking link is hidden and the form shows no confirmation.",
      ),
      source(
        "j2",
        "Customers repeatedly ask about beginner workshops, materials and accessibility.",
      ),
      source(
        "j3",
        "We own a Google Business Profile, but its hours are outdated.",
      ),
    ],
    findings: [
      finding(
        "jf1",
        "conversion",
        "Mobile enquiry navigation and confirmation need improvement.",
        "observed",
        ["j1"],
      ),
      finding(
        "jf2",
        "content",
        "Repeated customer questions are not answered clearly.",
        "observed",
        ["j2"],
      ),
      finding(
        "jf3",
        "local",
        "The confirmed business profile has outdated hours.",
        "observed",
        ["j3"],
      ),
    ],
    actions: [
      {
        id: "ja1",
        text: "Improve the existing enquiry journey",
        findingIds: ["jf1"],
      },
    ],
    uncertainties: ["Confirm account access and budget."],
  }),
];
export const evaluationReports: ReportV2[] = [
  reportSchema.parse({
    id: "booking-launch",
    version: 2,
    mode: "synthetic",
    businessName: "Willow Yoga Studio",
    summary:
      "A new studio needs online class bookings rather than service enquiries.",
    identityStatus: "confirmed",
    goals: [{ text: "Launch online class reservations", sourceId: "b1" }],
    capabilities: {
      website: { status: "absent", evidenceIds: ["b1"] },
      profile: unknown(),
      campaign: unknown(),
    },
    evidence: [
      source(
        "b1",
        "We have no website and want customers to reserve classes through our existing supported booking tool.",
      ),
    ],
    findings: [
      finding(
        "bf1",
        "website",
        "The owner confirms there is no website.",
        "observed",
        ["b1"],
      ),
      finding(
        "bf2",
        "conversion",
        "Online class reservations are an explicit launch goal.",
        "observed",
        ["b1"],
      ),
    ],
    actions: [
      { id: "ba1", text: "Support online reservations", findingIds: ["bf2"] },
    ],
    uncertainties: ["Confirm booking tool access and subscription."],
  }),
  reportSchema.parse({
    id: "uncertain",
    version: 2,
    mode: "synthetic",
    businessName: "Harbour Trading",
    summary: "Business identity and website ownership are unconfirmed.",
    identityStatus: "ambiguous",
    goals: [],
    capabilities: {
      website: unknown(),
      profile: unknown(),
      campaign: unknown(),
    },
    evidence: [
      source(
        "h1",
        "Two businesses share this name. The owner has not confirmed their location or website.",
      ),
    ],
    findings: [
      finding(
        "hf1",
        "identity",
        "Business identity remains ambiguous.",
        "unknown",
        ["h1"],
      ),
    ],
    actions: [],
    uncertainties: ["Confirm business identity before recommending services."],
  }),
];
