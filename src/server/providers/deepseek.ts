import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText, Output } from "ai";
import { z } from "zod";

const probeSchema = z.object({
  businessName: z.string(),
  websiteStatus: z.enum(["present", "absent", "unknown"]),
  evidenceIds: z.array(z.string()).max(3),
});
// A fixed labelled fixture checks only these facts, not arbitrary factuality.
export function assessProbe(value: unknown) {
  const parsed = probeSchema.safeParse(value);
  if (!parsed.success) return { schemaValid: false, evidenceSupported: false };
  const d = parsed.data;
  return {
    schemaValid: true,
    evidenceSupported:
      d.businessName === "Northstar Bicycle Workshop" &&
      d.websiteStatus === "unknown" &&
      d.evidenceIds.length === 1 &&
      d.evidenceIds[0] === "s1",
  };
}
export async function probeStructuredModel(
  options: {
    apiKey?: string;
    model?: string;
    fetch?: typeof fetch;
    signal?: AbortSignal;
  } = {},
) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const model = options.model ?? process.env.DEEPSEEK_MODEL;
  if (!apiKey || !model) throw new Error("model_configuration_missing");
  const provider = createDeepSeek({
    apiKey,
    fetch:
      options.fetch ??
      ((url, init) => fetch(url, { ...init, redirect: "error" })),
  });
  const start = Date.now();
  try {
    const result = await generateText({
      model: provider(model),
      output: Output.object({ schema: probeSchema }),
      maxRetries: 0,
      maxOutputTokens: 300,
      abortSignal: AbortSignal.any([
        AbortSignal.timeout(35000),
        ...(options.signal ? [options.signal] : []),
      ]),
      providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      prompt:
        "Return JSON using only this synthetic evidence. Source s1: Northstar Bicycle Workshop repairs bicycles in the fictional town of Exampleton. Website information was not collected. Unknown does not mean absent. Extract businessName, websiteStatus, and evidenceIds. Do not invent a website.",
    });
    return {
      ...assessProbe(result.output),
      model,
      elapsedMs: Date.now() - start,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  } catch {
    throw new Error("model_call_failed");
  }
}
