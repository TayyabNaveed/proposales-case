import { z } from "zod";
import {
  proposalPresentationSchema,
  type ProposalPresentation,
} from "../domain/offers.js";
import { account, smallJson, safeError } from "./http.js";
import { adjustmentsSchema, type StoredDraftSnapshot } from "./drafts.js";
import type { RecommendationRecord } from "./recommendations.js";
import type { SnapshotDraftOutcome } from "./workflow.js";
const recommendationRequest = z
  .object({
    reportId: z.union([
      z.enum(["no-website", "enquiry-flow"]),
      z
        .string()
        .regex(
          /^live-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
        ),
    ]),
    refresh: z.boolean().default(false),
  })
  .strict();
const draftRequest = z
  .object({
    requestId: z.uuid(),
    recommendationId: z.uuid(),
    selections: adjustmentsSchema,
    // The operator-approved introduction and recipient (proposal-3).
    presentation: proposalPresentationSchema.optional(),
  })
  .strict();
export function publicRecommendation(r: RecommendationRecord) {
  return {
    id: r.id,
    reportId: r.report.id,
    report: r.report,
    state: r.state,
    selection: r.result?.selection ?? null,
    model: r.result?.model ?? r.identity?.model,
    promptVersion: r.result?.promptVersion,
    schemaVersion: r.result?.schemaVersion,
    usage: r.result?.usage,
    provenance: r.result?.provenance ?? r.diagnostics?.provenance,
    durationMs: r.result?.durationMs,
    cacheHit: r.cacheHit,
    expiresAt: r.expiresAt,
    errorCode: r.errorCode,
    // Why a failed run failed, e.g. ai_balance_empty; a safe code only.
    failureCode: r.diagnostics?.failureCode ?? null,
    createdAt: r.createdAt,
  };
}
export function createApiHandlers(
  deps: {
    consume(scope: string, action: string): Promise<boolean>;
    recommend(
      reportId: string,
      scope: string,
      refresh: boolean,
    ): Promise<RecommendationRecord>;
    recommendation(id: string, scope: string): Promise<RecommendationRecord>;
    snapshot(
      requestId: string,
      recommendationId: string,
      selections: unknown,
      scope: string,
      presentation?: ProposalPresentation,
    ): Promise<StoredDraftSnapshot>;
    getSnapshot(id: string, scope: string): Promise<StoredDraftSnapshot>;
    findSnapshot(
      requestId: string,
      scope: string,
    ): Promise<StoredDraftSnapshot | null>;
    draft(
      id: string,
      scope: string,
      mode: "create" | "status",
    ): Promise<SnapshotDraftOutcome>;
  },
  env: NodeJS.ProcessEnv = process.env,
) {
  const json = (value: unknown) =>
    Response.json(value, { headers: { "Cache-Control": "no-store" } });
  async function authorise(req: Request, action: string, mutation = true) {
    const scope = account(req, mutation, env);
    if (!(await deps.consume(scope, action)))
      throw new Error("too_many_attempts");
    return scope;
  }
  return {
    async recommendationsPOST(req: Request) {
      try {
        const scope = account(req, true, env),
          body = recommendationRequest.parse(await smallJson(req));
        if (!(await deps.consume(scope, "recommendation-write")))
          throw new Error("too_many_attempts");
        return json({
          recommendation: publicRecommendation(
            await deps.recommend(body.reportId, scope, body.refresh),
          ),
        });
      } catch (e) {
        return safeError(e);
      }
    },
    async recommendationsGET(req: Request) {
      try {
        const scope = await authorise(req, "recommendation-read", false),
          id = z.uuid().parse(new URL(req.url).searchParams.get("id"));
        return json({
          recommendation: publicRecommendation(
            await deps.recommendation(id, scope),
          ),
        });
      } catch (e) {
        return safeError(e);
      }
    },
    async draftsPOST(req: Request) {
      try {
        const scope = account(req, true, env),
          body = draftRequest.parse(await smallJson(req));
        if (!(await deps.consume(scope, "draft-write")))
          throw new Error("too_many_attempts");
        const saved = await deps.snapshot(
          body.requestId,
          body.recommendationId,
          body.selections,
          scope,
          body.presentation,
        );
        const outcome = await deps.draft(saved.id, scope, "create");
        return json({ snapshot: saved, outcome });
      } catch (e) {
        return safeError(e);
      }
    },
    async draftsGET(req: Request) {
      try {
        const scope = await authorise(req, "draft-read", false),
          q = new URL(req.url).searchParams,
          id = q.get("id"),
          requestId = q.get("requestId");
        if ((!id && !requestId) || (id && requestId))
          throw new Error("invalid_input");
        const saved = id
          ? await deps.getSnapshot(z.uuid().parse(id), scope)
          : await deps.findSnapshot(z.uuid().parse(requestId), scope);
        if (!saved) throw new Error("draft_missing");
        return json({
          snapshot: saved,
          outcome: await deps.draft(saved.id, scope, "status"),
        });
      } catch (e) {
        return safeError(e);
      }
    },
  };
}
