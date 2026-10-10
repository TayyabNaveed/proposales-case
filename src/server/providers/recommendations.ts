import { z } from "zod";
import { repairInstruction } from "../../prompts/service-recommendation/v1.js";
import { activePrompts } from "../../prompts/active.js";
import { promptProvenance } from "../prompt-provenance.js";
import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  generateText,
  Output,
  NoObjectGeneratedError,
  type LanguageModelUsage,
} from "ai";
import { reportSchema, type ReportV2 } from "../../domain/reports.js";
import type { CatalogueV2 } from "../../domain/catalogue.js";
import {
  selectionSchema,
  validateSelection,
  type SelectionResult,
} from "../../domain/selection.js";
import { snapshotHash } from "../canonical.js";

export const promptVersion = activePrompts.selection.version;
export const schemaVersion = "selection-2";
export const systemPrompt = activePrompts.selection.system;

export type Usage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  complete: boolean;
};
export type RecommendationRun = {
  selection: SelectionResult;
  reportHash: string;
  catalogueHash: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  usage: Usage;
  attempts: number;
  durationMs: number;
  validationOutcome: "validated";
  provenance?: ReturnType<typeof promptProvenance> & {
    repairHash: string;
    requestHash?: string;
    actualModel?: string;
    recordedAt?: string;
  };
};
export type RunDiagnostics = Omit<
  RecommendationRun,
  "selection" | "validationOutcome"
>;
export class RecommendationFailure extends Error {
  constructor(
    code: string,
    readonly diagnostics: RunDiagnostics,
  ) {
    super(code);
  }
}
export function recommendationIdentity(
  report: ReportV2,
  catalogue: CatalogueV2,
  accessScope: string,
  model: string,
) {
  if (!accessScope || accessScope.length > 200 || !model)
    throw new Error("recommendation_configuration_invalid");
  const reportHash = snapshotHash(report),
    catalogueHash = snapshotHash(catalogue);
  return {
    reportHash,
    catalogueHash,
    model,
    promptVersion,
    schemaVersion,
    provenance: {
      ...promptProvenance(
        activePrompts.selection,
        z.toJSONSchema(selectionSchema),
      ),
      repairHash: snapshotHash(repairInstruction("{validationCode}")),
    },
    inputHash: snapshotHash({
      reportHash,
      catalogueHash,
      accessScope,
      model,
      promptVersion,
      schemaVersion,
      provenance: {
        ...promptProvenance(
          activePrompts.selection,
          z.toJSONSchema(selectionSchema),
        ),
        repairHash: snapshotHash(repairInstruction("{validationCode}")),
      },
    }),
  };
}
function compactInput(report: ReportV2, catalogue: CatalogueV2) {
  if (
    JSON.stringify(report).length >
      activePrompts.selection.config.maxRecordCharacters ||
    report.evidence.length > activePrompts.selection.config.maxEvidence ||
    report.findings.length > activePrompts.selection.config.maxFindings ||
    report.goals.length > activePrompts.selection.config.maxGoals ||
    report.actions.length > activePrompts.selection.config.maxActions
  )
    throw new Error("recommendation_input_too_large");
  const clip = (s: string, n: number = activePrompts.selection.config.textCharacters) =>
    s.slice(0, n);
  const input = {
    catalogue: {
      version: catalogue.version,
      services: catalogue.services.map(
        ({ unitPriceMinor: _price, ...service }) => service,
      ),
    },
    report: {
      ...report,
      businessName: clip(report.businessName, 200),
      summary: clip(report.summary, 800),
      goals: report.goals.map((g) => ({ ...g, text: clip(g.text) })),
      findings: report.findings.map((f) => ({
        ...f,
        claim: clip(f.claim),
        section: clip(f.section, 100),
      })),
      actions: report.actions.map((a) => ({ ...a, text: clip(a.text) })),
      evidence: report.evidence.map((e) => ({
        id: e.id,
        label: clip(e.label, 100),
        excerpt: clip(
          e.excerpt,
          activePrompts.selection.config.evidenceCharacters,
        ),
        synthetic: e.synthetic,
      })),
      uncertainties: report.uncertainties.slice(0, 12).map((s) => clip(s, 200)),
    },
  };
  const json = JSON.stringify(input);
  // Character budget is an estimate, not a tokenizer guarantee. Actual usage is recorded.
  if (json.length > activePrompts.selection.config.maxInputCharacters)
    throw new Error("recommendation_input_too_large");
  return json;
}
function safeValidationCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return [
    "unsupported_service",
    "invalid_quantity",
    "unsupported_evidence",
    "overlap_website_scope",
    "missing_prerequisite",
    "invalid_selection_identity",
    "abstention_required",
    "website_rebuild_requires_scoped_catalogue",
  ].includes(message)
    ? message
    : "invalid_schema";
}
export async function recommendServices(
  report: ReportV2,
  catalogue: CatalogueV2,
  options: {
    apiKey?: string;
    model?: string;
    fetch?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<RecommendationRun> {
  report = reportSchema.parse(report);
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY,
    model = options.model ?? process.env.DEEPSEEK_MODEL;
  if (!apiKey || !model) throw new Error("model_configuration_missing");
  const identity = recommendationIdentity(report, catalogue, "provider", model),
    prompt = compactInput(report, catalogue),
    start = Date.now();
  let attempts = 0,
    repairCode: string | undefined,
    requestHash: string | undefined,
    actualModel: string | undefined;
  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    complete: true,
  };
  const addUsage = (u?: LanguageModelUsage) => {
    for (const key of [
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
    ] as const) {
      const n =
        key === "cacheReadTokens"
          ? u?.inputTokenDetails?.cacheReadTokens
          : u?.[key];
      usage[key] =
        n === undefined || usage[key] === null ? null : usage[key] + n;
    }
    if (u?.inputTokens === undefined || u?.outputTokens === undefined)
      usage.complete = false;
  };
  const diagnostics = (): RunDiagnostics => ({
    reportHash: identity.reportHash,
    catalogueHash: identity.catalogueHash,
    model,
    promptVersion,
    schemaVersion,
    usage: { ...usage },
    attempts,
    durationMs: Date.now() - start,
    provenance: {
      ...identity.provenance,
      requestHash,
      actualModel,
      recordedAt: new Date().toISOString(),
    },
  });
  const totalSignal = AbortSignal.any([
    AbortSignal.timeout(activePrompts.selection.config.deadlineMs),
    ...(options.signal ? [options.signal] : []),
  ]);
  const provider = createDeepSeek({
    apiKey,
    fetch:
      options.fetch ??
      ((url, init) => fetch(url, { ...init, redirect: "error" })),
  });
  for (
    let attempt = 0;
    attempt < activePrompts.selection.config.maxAttempts;
    attempt++
  ) {
    if (totalSignal.aborted)
      throw new RecommendationFailure(
        "recommendation_cancelled",
        diagnostics(),
      );
    attempts++;
    let raw: unknown;
    try {
      const system =
        systemPrompt + (repairCode ? repairInstruction(repairCode) : "");
      requestHash = snapshotHash({
        system,
        prompt,
        config: activePrompts.selection.config,
        schemaVersion,
      });
      const result = await generateText({
        model: provider(model),
        output: Output.object({ schema: selectionSchema }),
        maxRetries: 0,
        maxOutputTokens: activePrompts.selection.config.maxOutputTokens,
        abortSignal: AbortSignal.any([
          totalSignal,
          AbortSignal.timeout(activePrompts.selection.config.attemptDeadlineMs),
        ]),
        providerOptions: { deepseek: { thinking: { type: "disabled" } } },
        system,
        prompt,
      });
      actualModel = result.response.modelId;
      raw = result.output;
      addUsage(result.usage);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        addUsage(error.usage);
        repairCode = "invalid_schema";
        if (attempt === 0 && !totalSignal.aborted) continue;
        throw new RecommendationFailure(
          "recommendation_invalid",
          diagnostics(),
        );
      }
      addUsage();
      throw new RecommendationFailure(
        totalSignal.aborted
          ? "recommendation_cancelled"
          : "recommendation_call_failed",
        diagnostics(),
      );
    }
    try {
      return {
        ...diagnostics(),
        selection: validateSelection(report, raw, catalogue),
        validationOutcome: "validated",
      };
    } catch (error) {
      repairCode = safeValidationCode(error);
    }
  }
  throw new RecommendationFailure("recommendation_invalid", diagnostics());
}
