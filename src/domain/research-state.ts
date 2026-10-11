import { z } from "zod";
import { reportSchema } from "./reports.js";
import { researchInputSchema, operatorChoiceSchema } from "./research.js";
import { identityOutputSchema, rejectionCodes } from "./identity.js";
const count = z.number().int().nonnegative();
export const usageSchema = z.object({
  inputTokens: count.nullable(),
  outputTokens: count.nullable(),
  cacheReadTokens: count.nullable(),
});
export const provenanceSchema = z.object({
  promptId: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  templateHash: z.string(),
  configHash: z.string(),
  inputBuilderVersion: z.string(),
  validationVersion: z.string(),
  provenanceVersion: z.string(),
  requestHash: z.string().optional(),
  actualModel: z.string().nullable().optional(),
  recordedAt: z.string().optional(),
});
export const searchResultSchema = z.object({
  state: z.enum(["ready", "partial"]),
  input: researchInputSchema,
  evidence: reportSchema.shape.evidence,
  queries: count,
  attempts: count,
  credits: z.number().nonnegative().nullable(),
  durationMs: z.number().nonnegative(),
  failedQueries: count,
  // Why queries failed (server/provider-errors.ts); absent on older records.
  failure: z.string().max(40).nullable().optional(),
});
export const reportResultSchema = z.object({
  report: reportSchema,
  model: z.string(),
  promptVersion: z.string(),
  attempts: count,
  durationMs: z.number().nonnegative(),
  usage: usageSchema,
  provenance: provenanceSchema.optional(),
});
// Identify stage: verified candidates for the operator to choose from.
export const identifyResultSchema = reportResultSchema.omit({ report: true }).extend({
  status: z.enum(["confirmed", "ambiguous"]),
  identity: z.object({
    reason: z.string(),
    matchedSourceIds: z.array(z.string()),
    candidates: identityOutputSchema.shape.candidates,
    rejected: z.array(z.enum(rejectionCodes)),
  }),
});
export const reportDiagnosticsSchema = reportResultSchema
  .omit({ report: true })
  .extend({
    failure: z.enum(["validation_failed", "provider_failed"]),
    check: z.string().max(60).optional(),
  });
const common = {
  id: z.string(),
  state: z.enum(["running", "ready", "partial", "failed"]),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  cacheHit: z.boolean(),
};
export const publicResearchSchema = z
  .discriminatedUnion("stage", [
    z.object({
      ...common,
      stage: z.literal("search"),
      input: researchInputSchema,
      result: searchResultSchema.nullable(),
    }),
    z.object({
      ...common,
      stage: z.literal("identify"),
      input: z.object({ searchId: z.string() }),
      result: identifyResultSchema.nullable(),
      diagnostics: reportDiagnosticsSchema.nullable(),
    }),
    z.object({
      ...common,
      stage: z.literal("report"),
      // identifyId and choice are absent on reports made before the guided flow.
      input: z.object({
        searchId: z.string(),
        identifyId: z.string().optional(),
        choice: operatorChoiceSchema.optional(),
      }),
      result: reportResultSchema.nullable(),
      diagnostics: reportDiagnosticsSchema.nullable(),
    }),
  ])
  .superRefine((r, ctx) => {
    if ((r.state === "ready" || r.state === "partial") && !r.result)
      ctx.addIssue({ code: "custom", message: "missing_stage_result" });
  });
export type PublicResearchRecord = z.infer<typeof publicResearchSchema>;
export type SearchStage = Extract<PublicResearchRecord, { stage: "search" }>;
export type IdentifyStage = Extract<PublicResearchRecord, { stage: "identify" }>;
export type ReportStage = Extract<PublicResearchRecord, { stage: "report" }>;
export type IdentifyResult = z.infer<typeof identifyResultSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type ResearchReportResult = z.infer<typeof reportResultSchema>;
