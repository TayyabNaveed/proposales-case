import "server-only";
import { createHmac } from "node:crypto";
import { database } from "./runtime.js";
import {
  createRecommendationStore,
  createRecommendationService,
} from "./recommendations.js";
import { createDraftService, createDraftStore } from "./drafts.js";
import { createOperationStore } from "./db.js";
import { createAssetStore, getServiceMapping } from "./provider-assets.js";
import {
  loadCompositionAssets,
  proposalComposition,
} from "./category-assets.js";
import { checkedCompositionAssets } from "./providers/category-blocks.js";
import { createProposales } from "./providers/proposales.js";
import {
  buildPricedPayload,
  verifyPricedProposal,
} from "./providers/proposales-mapping.js";
import type { DraftSnapshot } from "../domain/offers.js";
import { createDraftFromSnapshot } from "./workflow.js";
import { createApiHandlers } from "./api.js";
import { consumeActionAttempt } from "./access-store.js";
import { createResearchStore, createResearchService } from "./research.js";
import { createResearchApi } from "./research-api.js";
import { readUsage } from "./usage.js";
import { listProposals } from "./proposals.js";
import { account, safeError, smallJson } from "./http.js";
import { createIntroService } from "./intro.js";
import { adjustmentsSchema } from "./drafts.js";
import { z } from "zod";
async function consume(scope: string, action: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("access_unconfigured");
  return consumeActionAttempt(
    database(),
    createHmac("sha256", secret)
      .update("action:" + scope + ":" + action)
      .digest("hex"),
  );
}
function researchService() {
  return createResearchService(createResearchStore(database()), {
    model: process.env.DEEPSEEK_MODEL ?? "",
  });
}
export function researchHandlers() {
  const research = researchService();
  return createResearchApi({
    consume,
    search: research.search,
    identify: research.identify,
    report: research.report,
    get: research.get,
  });
}
function model() {
  const value = process.env.DEEPSEEK_MODEL;
  if (!value || !process.env.DEEPSEEK_API_KEY)
    throw new Error("model_configuration_missing");
  return value;
}
export function apiHandlers() {
  return createApiHandlers({
    consume,
    async recommend(reportId, scope, refresh) {
      return createRecommendationService(
        createRecommendationStore(database()),
        { model: model(), resolveReport: researchService().resolveReport },
      ).getOrCreateRecommendation(reportId, scope, refresh);
    },
    async recommendation(id, scope) {
      return createRecommendationStore(database()).get(id, scope);
    },
    async snapshot(
      requestId,
      recommendationId,
      selections,
      scope,
      presentation,
    ) {
      return createDraftService(database(), {
        model: model(),
        resolveReport: researchService().resolveReport,
        ...(proposalComposition(process.env.PROPOSAL_COMPOSITION) ===
        "proposal-4"
          ? {
              compositionAssets: (snapshot: DraftSnapshot) =>
                loadCompositionAssets(
                  createAssetStore(database()),
                  process.env.PROPOSALES_COMPANY_ID ?? "",
                  snapshot,
                ),
            }
          : {}),
      }).getOrCreateDraftSnapshot(
        requestId,
        recommendationId,
        selections,
        scope,
        presentation,
      );
    },
    async getSnapshot(id, scope) {
      return createDraftStore(database()).get(id, scope);
    },
    async findSnapshot(requestId, scope) {
      return createDraftStore(database()).findRequest(requestId, scope);
    },
    async draft(id, scope, mode) {
      const companyId = process.env.PROPOSALES_COMPANY_ID,
        apiKey = process.env.PROPOSALES_API_KEY;
      if (!companyId || !apiKey)
        throw new Error("provider_configuration_missing");
      const api = createProposales({ apiKey, companyId }),
        assets = createAssetStore(database());
      const mappings = (s: DraftSnapshot) =>
        s.compositionVersion === "proposal-4"
          ? Promise.resolve(checkedCompositionAssets(s, companyId).services)
          : Promise.all(
              s.items.map((i) =>
                getServiceMapping(
                  assets,
                  companyId,
                  i.serviceId,
                  s.catalogueVersion,
                ),
              ),
            );
      return createDraftFromSnapshot({
        snapshotId: id,
        accessScope: scope,
        companyId,
        mode,
        drafts: createDraftStore(database()),
        operations: createOperationStore(database()),
        provider: {
          async prepare(s) {
            buildPricedPayload(
              s,
              await mappings(s),
              companyId,
              `preflight:${id}`,
            );
          },
          async create(s, key) {
            return api.createPricedDraft(s, await mappings(s), key);
          },
          async inspect(uuid, s, key) {
            const actual = await api.getDraft(uuid);
            return {
              ...verifyPricedProposal(
                actual,
                s,
                await mappings(s),
                companyId,
                key,
              ),
              url: actual.url,
            };
          },
          async find(key) {
            return (await api.findByOperation(key)).map((p) => ({
              uuid: p.uuid,
              snapshotHash:
                typeof p.data?.case_snapshot === "string"
                  ? p.data.case_snapshot
                  : "",
              url: p.url,
            }));
          },
        },
      });
    },
  });
}
export function usageHandlers() {
  return {
    async GET(req: Request) {
      try {
        const scope = account(req, false);
        if (!(await consume(scope, "usage-read")))
          throw new Error("too_many_attempts");
        return Response.json(await readUsage(database(), scope), {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (e) {
        return safeError(e);
      }
    },
  };
}
export function introHandlers() {
  return {
    async POST(req: Request) {
      try {
        const scope = account(req, true),
          body = z
            .object({
              recommendationId: z.uuid(),
              selections: adjustmentsSchema,
              refresh: z.boolean().default(false),
            })
            .strict()
            .parse(await smallJson(req));
        if (!(await consume(scope, "intro-write")))
          throw new Error("too_many_attempts");
        const r = await createIntroService(database(), {
          model: model(),
          resolveReport: researchService().resolveReport,
        }).draft(body.recommendationId, body.selections, scope, body.refresh);
        const result =
          r.state === "ready"
            ? (r.result as {
                text: string;
                dropped: number;
                promptVersion: string;
              })
            : null;
        return Response.json(
          {
            intro: {
              state: r.state,
              cacheHit: r.cacheHit,
              text: result?.text ?? "",
              dropped: result?.dropped ?? 0,
              promptVersion: result?.promptVersion ?? null,
              errorCode: r.errorCode,
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (e) {
        return safeError(e);
      }
    },
  };
}
export function proposalHandlers() {
  return {
    async GET(req: Request) {
      try {
        const scope = account(req, false);
        if (!(await consume(scope, "proposals-read")))
          throw new Error("too_many_attempts");
        const companyId = process.env.PROPOSALES_COMPANY_ID ?? "",
          apiKey = process.env.PROPOSALES_API_KEY ?? "";
        if (!apiKey || !companyId) throw new Error("provider_configuration_missing");
        const provider = createProposales({ apiKey, companyId });
        // Search returns the status-aware link (editor for a draft, view once
        // accepted) that a plain read omits. The read is the fallback, and also
        // supplies the PDF link, which search leaves out (observed 11 October).
        const proposals = await listProposals(database(), scope, companyId, async (id, key) => {
          const match = (await provider.findByOperation(key)).find((p) => p.uuid === id);
          const read =
            !match || (match.status !== "draft" && !match.pdf_url)
              ? await provider.getDraft(id)
              : null;
          const p = read ?? match!;
          return {
            status: p.status,
            statusChangedAt: p.status_changed_at ?? null,
            pdfUrl: (read ?? match)?.pdf_url ?? null,
            url: match?.url ?? null,
          };
        });
        return Response.json({ proposals }, { headers: { "Cache-Control": "no-store" } });
      } catch (e) {
        return safeError(e);
      }
    },
  };
}
