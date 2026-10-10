import { z } from "zod";
import { reportSchema } from "./reports.js";
import { researchInputSchema } from "./research.js";
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
export const reportDiagnosticsSchema = reportResultSchema
  .omit({ report: true })
  .extend({ failure: z.enum(["validation_failed", "provider_failed"]) });
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
      stage: z.literal("report"),
      input: z.object({ searchId: z.string() }),
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
export type ReportStage = Extract<PublicResearchRecord, { stage: "report" }>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type ResearchReportResult = z.infer<typeof reportResultSchema>;
