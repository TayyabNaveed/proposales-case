import { trustedEditorUrl } from "../provider-url.js";
import { validateImageUrl, type ContentSummary } from "../provider-assets.js";
import {
  buildOptionalDefaultsPatch,
  buildPricedPayload,
  verifyPricedProposal,
  type ServiceMapping,
} from "./proposales-mapping.js";
import type { DraftSnapshot } from "../../domain/offers.js";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";

const numericId = z.number().int().positive().safe();
const companySchema = z.object({
  id: numericId,
  name: z.string(),
  currency: z.string().length(3),
});
const editorUrl = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "secure.proposales.com" &&
      !u.username &&
      !u.password
    );
  });
const createdSchema = z.object({
  proposal: z.object({ uuid: z.string().uuid(), url: z.unknown().optional() }),
});
const proposalSchema = z.object({
  uuid: z.string().uuid(),
  company_id: numericId,
  url: z.unknown().optional().transform(trustedEditorUrl),
  status: z.string().nullable(),
  status_changed_at: z.number().nullable().optional(),
  data: z.record(z.string(), z.unknown()).nullish(),
  currency: z.string().optional(),
  title_md: z.string().nullable().optional(),
  description_md: z.string().nullable().optional(),
  recipient_is_set: z.boolean().optional(),
  recipient_email: z.string().nullable().optional(),
  recipient_company_name: z.string().nullable().optional(),
  blocks: z.array(z.unknown()).optional(),
  tax_options: z.record(z.string(), z.unknown()).optional(),
});
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly outcomeUnknown = false,
  ) {
    super(`proposales: ${code}`);
    this.name = "ProviderError";
  }
}
export type DraftInput = {
  title: string;
  description: string;
  operationKey: string;
};
export type CompanySummary = { id: string; name: string; currency: string };

export function createProposales(options: {
  apiKey: string;
  companyId: string;
  fetch?: typeof fetch;
}) {
  const { apiKey, companyId } = options;
  if (
    !apiKey.trim() ||
    !/^[1-9]\d*$/.test(companyId) ||
    !Number.isSafeInteger(Number(companyId))
  )
    throw new ProviderError("configuration");
  const transport = options.fetch ?? fetch;
  async function request(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    parent?: AbortSignal,
  ): Promise<unknown> {
    const write = method !== "GET";
    const signal = AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(parent ? [parent] : []),
    ]);
    for (let attempt = 0; attempt < (write ? 1 : 2); attempt++) {
      if (signal.aborted) throw new ProviderError("aborted");
      try {
        const response = await transport(
          `https://api.proposales.com/v3/${path}`,
          {
            method,
            redirect: "error",
            signal,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        );
        if (!response.ok) {
          // Discard provider bodies: they can contain account data or reflected credentials.
          await response.body?.cancel();
          const retryable = response.status === 429 || response.status >= 500;
          const header = response.headers.get("retry-after");
          const seconds = header === null ? 0.25 : Number(header);
          const waitMs = Number.isFinite(seconds)
            ? Math.max(0, seconds * 1000)
            : Math.max(0, Date.parse(header!) - Date.now());
          if (
            !write &&
            attempt === 0 &&
            retryable &&
            Number.isFinite(waitMs) &&
            waitMs <= 2000
          ) {
            await delay(waitMs, undefined, { signal });
            continue;
          }
          throw new ProviderError(
            write && response.status >= 500
              ? "outcome_unknown"
              : `http_${response.status}`,
            write && response.status >= 500,
          );
        }
        try {
          return await response.json();
        } catch {
          throw new ProviderError(
            write ? "outcome_unknown" : "invalid_response",
            write,
          );
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (write) throw new ProviderError("outcome_unknown", true);
        if (signal.aborted) throw new ProviderError("aborted");
        if (attempt === 0) {
          await delay(250, undefined, { signal }).catch(() => {
            throw new ProviderError("aborted");
          });
          continue;
        }
        throw new ProviderError("transport_failed");
      }
    }
    throw new ProviderError("transport_failed");
  }
  function parse<T>(schema: z.ZodType<T>, value: unknown, write = false): T {
    const r = schema.safeParse(value);
    if (!r.success)
      throw new ProviderError(
        write ? "outcome_unknown" : "invalid_response",
        write,
      );
    return r.data;
  }
  function parseCreated(value: unknown) {
    const identity = parse(createdSchema, value, true).proposal;
    const url = editorUrl.safeParse(identity.url);
    return { uuid: identity.uuid, url: url.success ? url.data : undefined };
  }
  function readContent(raw: unknown): ContentSummary[] {
    const r = parse(
      z.object({
        data: z.array(
          z.object({
            product_id: numericId,
            variation_id: numericId,
            title: z.record(z.string(), z.string()),
            description: z.record(z.string(), z.string()),
            images: z.array(z.object({ uuid: z.uuid() })).optional(),
          }),
        ),
      }),
      raw,
    );
    return r.data.map((c) => ({
      productId: c.product_id,
      variationId: c.variation_id,
      title: c.title.en ?? "",
      description: c.description.en ?? "",
      imageUuids: c.images?.map((i) => i.uuid) ?? [],
    }));
  }
  return {
    async listCompanies(signal?: AbortSignal): Promise<CompanySummary[]> {
      const r = parse(
        z.object({ data: z.array(companySchema) }),
        await request("companies", "GET", undefined, signal),
      );
      return r.data.map((c) => ({ ...c, id: String(c.id) }));
    },
    async verifyCompany(signal?: AbortSignal) {
      const c = (await this.listCompanies(signal)).find(
        (c) => c.id === companyId,
      );
      if (!c) throw new ProviderError("company_scope");
      return c;
    },
    async createContent(
      input: { title: string; description: string; imageUrl: string },
      signal?: AbortSignal,
    ) {
      if (
        !input.title ||
        input.title.length > 250 ||
        !input.description ||
        input.description.length > 10000
      )
        throw new ProviderError("invalid_input");
      const url = validateImageUrl(input.imageUrl);
      const r = parse(
        z.object({
          data: z.object({ product_id: numericId, variation_id: numericId }),
        }),
        await request(
          "content",
          "POST",
          {
            company_id: Number(companyId),
            language: "en",
            title: input.title,
            description: input.description,
            images: [{ uuid: "", url }],
          },
          signal,
        ),
        true,
      );
      return { productId: r.data.product_id, variationId: r.data.variation_id };
    },
    async listContent(signal?: AbortSignal): Promise<ContentSummary[]> {
      return readContent(
        await request(
          `content?company_id=${companyId}`,
          "GET",
          undefined,
          signal,
        ),
      );
    },
    async getContent(
      variationId: number,
      signal?: AbortSignal,
    ): Promise<ContentSummary> {
      if (!numericId.safeParse(variationId).success)
        throw new ProviderError("invalid_input");
      const r = readContent(
        await request(
          `content?company_id=${companyId}&variation_id=${variationId}`,
          "GET",
          undefined,
          signal,
        ),
      );
      if (r.length !== 1 || r[0].variationId !== variationId)
        throw new ProviderError("content_scope");
      return r[0];
    },
    async createPricedDraft(
      snapshot: DraftSnapshot,
      mappings: ServiceMapping[],
      operationKey: string,
      signal?: AbortSignal,
    ) {
      const body = buildPricedPayload(
        snapshot,
        mappings,
        companyId,
        operationKey,
      );
      return parseCreated(await request("proposals", "POST", body, signal));
    },
    async patchOptionalDefaults(
      uuid: string,
      snapshot: DraftSnapshot,
      mappings: ServiceMapping[],
      operationKey: string,
      signal?: AbortSignal,
    ) {
      const current = await this.getDraft(uuid, signal);
      const body = buildOptionalDefaultsPatch(
        current,
        snapshot,
        mappings,
        companyId,
        operationKey,
      );
      const result = parseCreated(
        await request(`proposals/${uuid}`, "PATCH", body, signal),
      );
      if (result.uuid !== uuid)
        throw new ProviderError("outcome_unknown", true);
      return result;
    },
    async verifyPricedDraft(
      uuid: string,
      snapshot: DraftSnapshot,
      mappings: ServiceMapping[],
      operationKey: string,
      signal?: AbortSignal,
    ) {
      return verifyPricedProposal(
        await this.getDraft(uuid, signal),
        snapshot,
        mappings,
        companyId,
        operationKey,
      );
    },
    async contentCount(signal?: AbortSignal) {
      return (await this.listContent(signal)).length;
    },
    async createDraft(input: DraftInput, signal?: AbortSignal) {
      const valid = z
        .object({
          title: z.string().min(1).max(160),
          description: z.string().min(1).max(10000),
          operationKey: z.string().min(1).max(200),
        })
        .safeParse(input);
      if (!valid.success) throw new ProviderError("invalid_input");
      const body = {
        company_id: Number(companyId),
        language: "en",
        title_md: input.title,
        description_md: input.description,
        data: { case_operation: input.operationKey },
        blocks: [],
      };
      return parseCreated(await request("proposals", "POST", body, signal));
    },
    async getDraft(uuid: string, signal?: AbortSignal) {
      if (!z.string().uuid().safeParse(uuid).success)
        throw new ProviderError("invalid_input");
      const r = parse(
        z.object({ data: proposalSchema }),
        await request(`proposals/${uuid}`, "GET", undefined, signal),
      ).data;
      if (r.uuid !== uuid) throw new ProviderError("proposal_identity");
      if (String(r.company_id) !== companyId)
        throw new ProviderError("company_scope");
      return r;
    },
    async findByOperation(operationKey: string, signal?: AbortSignal) {
      const q = new URLSearchParams({
        company_id: companyId,
        "filter[case_operation]": operationKey,
        limit: "25",
      });
      const r = parse(
        z.object({ data: z.array(proposalSchema) }),
        await request(`proposal-search?${q}`, "GET", undefined, signal),
      );
      if (
        r.data.some(
          (p) =>
            String(p.company_id) !== companyId ||
            p.data?.case_operation !== operationKey,
        )
      )
        throw new ProviderError("company_scope");
      return r.data;
    },
  };
}
