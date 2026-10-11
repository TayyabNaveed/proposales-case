import { z } from "zod";
import type pg from "pg";
import { activePrompts } from "../prompts/active.js";
import { promptProvenance } from "./prompt-provenance.js";
import { createResearchStore } from "./research.js";
import { createRecommendationStore } from "./recommendations.js";
import { reports, type ReportV2 } from "../domain/reports.js";
import { catalogueV2, type CatalogueV2 } from "../domain/catalogue.js";
import { buildDraftSnapshot } from "../domain/offers.js";
import { adjustedSelection } from "../domain/workbench.js";
import { introInput, introOutputSchema } from "../domain/intro.js";
import { draftIntroduction, IntroFailure } from "./providers/research.js";
// Drafts the proposal introduction for the operator's current scope. Stored and
// admitted like the other paid stages; the operator reviews and may edit it.
export function createIntroService(
  pool: pg.Pool,
  options: {
    model: string;
    apiKey?: string;
    fetch?: typeof fetch;
    schema?: string;
    reports?: ReportV2[];
    resolveReport?: (id: string, scope: string) => Promise<ReportV2>;
    catalogue?: CatalogueV2;
  },
) {
  const store = createResearchStore(pool, options.schema),
    recommendations = createRecommendationStore(pool, options.schema);
  return {
    async draft(recommendationId: string, selections: unknown, scope: string, refresh = false) {
      z.uuid().parse(recommendationId);
      const rec = await recommendations.get(recommendationId, scope);
      if (rec.state !== "ready" || !rec.result) throw new Error("stale_recommendation");
      const report =
        (options.reports ?? reports).find((r) => r.id === rec.report.id) ??
        (options.resolveReport
          ? await options.resolveReport(rec.report.id, scope)
          : undefined);
      if (!report) throw new Error("stale_recommendation");
      // The same validation as the proposal itself: only a valid scope is described.
      const scoped = buildDraftSnapshot(
        report,
        adjustedSelection(rec.result.selection, selections),
        options.catalogue ?? catalogueV2,
      );
      const input = introInput(scoped);
      const a = await store.admit({
        stage: "intro",
        identity: {
          input,
          provenance: promptProvenance(activePrompts.intro, z.toJSONSchema(introOutputSchema)),
          model: options.model,
        },
        input: { recommendationId, services: input.services.map((s) => s.ref) },
        scope,
        refresh,
      });
      if (!a.claimed) return a.record;
      try {
        const result = await draftIntroduction(input, {
          apiKey: options.apiKey,
          model: options.model,
          fetch: options.fetch,
        });
        return store.finish(a.record.id, scope, "ready", result);
      } catch (error) {
        return store.finish(
          a.record.id,
          scope,
          "failed",
          error instanceof IntroFailure ? { diagnostics: error.diagnostics } : null,
          "research_intro_failed",
        );
      }
    },
  };
}
