import { activePrompts } from "../../prompts/active.js";
import { promptProvenance } from "../prompt-provenance.js";
import { z } from "zod";
import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  generateText,
  Output,
  NoObjectGeneratedError,
  type LanguageModelUsage,
} from "ai";
import { snapshotHash } from "../canonical.js";
import {
  searchResultSchema,
  type SearchResult,
  type ResearchReportResult,
} from "../../domain/research-state.js";
export type { SearchResult } from "../../domain/research-state.js";
import {
  researchInputSchema,
  publicSourceUrl,
  researchOutputSchema,
  buildLiveReport,
  type ResearchInput,
  type Evidence,
} from "../../domain/research.js";
export const searchVersion = "tavily-basic-1",
  reportPromptVersion = activePrompts.research.version;
const transportSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().max(2000),
        url: z.string().max(2000),
        content: z.string().max(100000),
      }),
    )
    .max(5),
  usage: z.object({ credits: z.number().nonnegative() }).optional(),
});
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("research_search_failed");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 256000) {
        await reader.cancel();
        throw new Error("research_search_failed");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export async function searchBusiness(
  raw: ResearchInput,
  options: { apiKey?: string; fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const input = researchInputSchema.parse(raw),
    key = options.apiKey ?? process.env.TAVILY_API_KEY;
  if (!key) throw new Error("research_configuration_missing");
  const start = Date.now(),
    signal = AbortSignal.any([
      AbortSignal.timeout(120000),
      ...(options.signal ? [options.signal] : []),
    ]);
  const base = input.businessName + " " + input.location,
    queries = [
      base + " official business website services",
      base + " contact booking services",
      base +
        " business profile" +
        (input.website ? " " + new URL(input.website).hostname : ""),
    ];
  let retryAvailable = true,
    attempts = 0,
    failedQueries = 0,
    credits: number | null = 0;
  const batches: Evidence[][] = Array.from({ length: 3 }, () => []);
  let cursor = 0;
  async function worker() {
    while (cursor < queries.length) {
      const index = cursor++;
      let completed = false,
        nonRetryable = false;
      for (let pass = 0; pass < 2 && !completed; pass++) {
        if (signal.aborted) {
          failedQueries++;
          break;
        }
        attempts++;
        try {
          const response = await (options.fetch ?? fetch)(
            "https://api.tavily.com/search",
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
              headers: {
                Authorization: "Bearer " + key,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: queries[index],
                search_depth: "basic",
                max_results: 5,
                auto_parameters: false,
                include_answer: false,
                include_raw_content: false,
                include_images: false,
                include_usage: true,
              }),
            },
          );
          if (!response.ok) {
            credits = null;
            await response.body?.cancel();
            const retryable = response.status >= 500 || response.status === 429;
            if (pass === 0 && retryable && retryAvailable) {
              retryAvailable = false;
              continue;
            }
            nonRetryable = !retryable;
            throw new Error("research_search_failed");
          }
          const result = transportSchema.parse(await boundedJson(response));
          credits =
            credits !== null && result.usage
              ? credits + result.usage.credits
              : null;
          batches[index] = result.results.flatMap((r) => {
            const url = publicSourceUrl(r.url);
            return url && r.content.trim()
              ? [
                  {
                    id: "",
                    label: r.title.slice(0, 200),
                    excerpt: r.content.slice(0, 1500),
                    url,
                    retrievedAt: new Date().toISOString(),
                    synthetic: false,
                  },
                ]
              : [];
          });
          completed = true;
        } catch {
          credits = null;
          if (
            pass === 0 &&
            retryAvailable &&
            !signal.aborted &&
            !nonRetryable
          ) {
            retryAvailable = false;
            continue;
          }
          failedQueries++;
          break;
        }
      }
    }
  }
  await Promise.all([worker(), worker()]);
  const seen = new Set<string>();
  const evidence = batches
    .flat()
    .filter((e) => {
      if (seen.has(e.url!)) return false;
      seen.add(e.url!);
      return true;
    })
    .slice(0, 8)
    .map((e, i) => ({ ...e, id: "s" + (i + 1) }));
  return searchResultSchema.parse({
    state: failedQueries || !evidence.length ? "partial" : "ready",
    input,
    evidence,
    queries: queries.length,
    attempts,
    credits,
    durationMs: Date.now() - start,
    failedQueries,
  });
}
export const researchSystemPrompt = activePrompts.research.system;
export class ResearchReportFailure extends Error {
  constructor(
    readonly diagnostics: Omit<ResearchReportResult, "report"> & {
      failure: "validation_failed" | "provider_failed";
    },
  ) {
    super("research_report_failed");
  }
}
export async function generateResearchReport(
  input: ResearchInput,
  evidence: Evidence[],
  id: string,
  options: {
    apiKey?: string;
    model?: string;
    fetch?: typeof fetch;
    signal?: AbortSignal;
  } = {},
) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY,
    model = options.model ?? process.env.DEEPSEEK_MODEL;
  if (!apiKey || !model) throw new Error("model_configuration_missing");
  if (!evidence.length || evidence.length > 8)
    throw new Error("research_sources_missing");
  const start = Date.now();
  const prompt = JSON.stringify({ input, evidence });
  let usage = {
      inputTokens: null as number | null,
      outputTokens: null as number | null,
      cacheReadTokens: null as number | null,
    },
    actualModel: string | null = null,
    generated = false;
  const retainUsage = (u?: LanguageModelUsage) => {
    usage = {
      inputTokens: u?.inputTokens ?? null,
      outputTokens: u?.outputTokens ?? null,
      cacheReadTokens: u?.inputTokenDetails?.cacheReadTokens ?? null,
    };
  };
  const diagnostics = () => ({
    model,
    promptVersion: reportPromptVersion,
    attempts: 1,
    durationMs: Date.now() - start,
    usage,
    provenance: {
      ...promptProvenance(
        activePrompts.research,
        z.toJSONSchema(researchOutputSchema),
      ),
      requestHash: snapshotHash({
        system: researchSystemPrompt,
        prompt,
        config: activePrompts.research.config,
        schemaHash: snapshotHash(z.toJSONSchema(researchOutputSchema)),
      }),
      actualModel,
      recordedAt: new Date().toISOString(),
    },
  });
  const provider = createDeepSeek({
    apiKey,
    fetch:
      options.fetch ??
      ((url, init) => fetch(url, { ...init, redirect: "error" })),
  });
  try {
    const result = await generateText({
      model: provider(model),
      system: researchSystemPrompt,
      prompt,
      output: Output.object({ schema: researchOutputSchema }),
      maxRetries: 0,
      maxOutputTokens: activePrompts.research.config.maxOutputTokens,
      abortSignal: AbortSignal.any([
        AbortSignal.timeout(activePrompts.research.config.deadlineMs),
        ...(options.signal ? [options.signal] : []),
      ]),
      providerOptions: { deepseek: { thinking: { type: "disabled" } } },
    });
    generated = true;
    retainUsage(result.usage);
    actualModel = result.response.modelId;
    return {
      ...diagnostics(),
      report: buildLiveReport(input, evidence, result.output, id),
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      retainUsage(error.usage);
      generated = true;
    }
    throw new ResearchReportFailure({
      ...diagnostics(),
      failure: generated ? "validation_failed" : "provider_failed",
    });
  }
}
