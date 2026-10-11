import { z } from "zod";
import { dailyLimit } from "./limits.js";
import { compositionVersion } from "../domain/presentation.js";
import {
  compositionAssetsSchema,
  type CompositionAssets,
} from "../domain/proposal-groups.js";
import { checkedCompositionAssets } from "./providers/category-blocks.js";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { reports, type ReportV2 } from "../domain/reports.js";
import { catalogueV2, type CatalogueV2 } from "../domain/catalogue.js";
import {
  buildDraftSnapshot,
  proposalPresentationSchema,
  type DraftSnapshot,
  type ProposalPresentation,
} from "../domain/offers.js";
import { snapshotHash } from "./canonical.js";
import { recommendationIdentity } from "./providers/recommendations.js";
import {
  createRecommendationStore,
  type RecommendationRecord,
} from "./recommendations.js";
export { adjustmentSchema as adjustmentsSchema } from "../domain/workbench.js";
import {
  adjustmentSchema as adjustmentsSchema,
  adjustedSelection,
} from "../domain/workbench.js";
export type Adjustments = z.infer<typeof adjustmentsSchema>;
export function prepareDraftSnapshot(
  record: RecommendationRecord,
  raw: unknown,
  report: ReportV2,
  catalogue: CatalogueV2,
  scope: string,
  model: string,
  presentation?: ProposalPresentation,
): DraftSnapshot {
  if (record.accessScope !== scope) throw new Error("recommendation_missing");
  const identity = recommendationIdentity(report, catalogue, scope, model);
  if (
    record.state !== "ready" ||
    !record.result ||
    !record.expiresAt ||
    Date.parse(record.expiresAt) <= Date.now() ||
    identity.inputHash !== record.inputHash ||
    snapshotHash(record.report) !== identity.reportHash ||
    snapshotHash(record.catalogue) !== identity.catalogueHash ||
    record.result.reportHash !== identity.reportHash ||
    record.result.catalogueHash !== identity.catalogueHash ||
    record.result.model !== model ||
    record.result.promptVersion !== identity.promptVersion ||
    record.result.schemaVersion !== identity.schemaVersion
  )
    throw new Error("stale_recommendation");
  return {
    ...buildDraftSnapshot(
      report,
      adjustedSelection(record.result.selection, raw),
      catalogue,
    ),
    compositionVersion,
    // Without approved text, the proposal still gets the VAT line and title.
    presentation: proposalPresentationSchema.parse(
      presentation ?? { intro: "" },
    ),
  };
}
export type StoredDraftSnapshot = {
  id: string;
  requestId: string;
  recommendationId: string;
  accessScope: string;
  snapshot: DraftSnapshot;
  snapshotHash: string;
  createdAt: string;
};
const projection = `id,request_id AS "requestId",recommendation_id AS "recommendationId",access_scope AS "accessScope",snapshot,snapshot_hash AS "snapshotHash",created_at AS "createdAt"`;
const project = (row: any): StoredDraftSnapshot => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
export function createDraftStore(
  pool: pg.Pool,
  schema = "case_workflow",
  limit: number | null = dailyLimit("draft"),
) {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const table = `"${schema}".draft_snapshots`,
    budget = `"${schema}".draft_budgets`;
  return {
    async get(id: string, scope: string) {
      const r = await pool.query(
        `SELECT ${projection} FROM ${table} WHERE id=$1 AND access_scope=$2`,
        [id, scope],
      );
      if (r.rowCount !== 1) throw new Error("draft_missing");
      return project(r.rows[0]);
    },
    async findRequest(requestId: string, scope: string) {
      const r = await pool.query(
        `SELECT ${projection} FROM ${table} WHERE request_id=$1 AND access_scope=$2`,
        [requestId, scope],
      );
      return r.rowCount === 1 ? project(r.rows[0]) : null;
    },
    async save(
      requestId: string,
      recommendationId: string,
      scope: string,
      snapshot: DraftSnapshot,
    ) {
      z.uuid().parse(requestId);
      z.uuid().parse(recommendationId);
      if (!scope || scope.length > 200) throw new Error("invalid_input");
      const hash = snapshotHash(snapshot),
        client = await pool.connect();
      try {
        await client.query("BEGIN");
        const id = randomUUID();
        const insert = await client.query(
          `INSERT INTO ${table}(id,request_id,recommendation_id,access_scope,snapshot,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(access_scope,request_id) DO NOTHING RETURNING ${projection}`,
          [
            id,
            requestId,
            recommendationId,
            scope,
            JSON.stringify(snapshot),
            hash,
          ],
        );
        if (insert.rowCount === 1) {
          const b = await client.query(
            `INSERT INTO ${budget}(access_scope,day,admitted) VALUES($1,(now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(access_scope,day) DO UPDATE SET admitted=${budget}.admitted+1 WHERE $2::int IS NULL OR ${budget}.admitted<$2 RETURNING admitted`,
            [scope, limit],
          );
          if (b.rowCount !== 1) throw new Error("draft_budget_exceeded");
          await client.query("COMMIT");
          return project(insert.rows[0]);
        }
        const existing = await client.query(
          `SELECT ${projection} FROM ${table} WHERE access_scope=$1 AND request_id=$2`,
          [scope, requestId],
        );
        const row = existing.rows[0];
        if (
          !row ||
          row.snapshotHash !== hash ||
          row.recommendationId !== recommendationId
        )
          throw new Error("draft_request_conflict");
        await client.query("COMMIT");
        return project(row);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
export function createDraftService(
  pool: pg.Pool,
  options: {
    schema?: string;
    model: string;
    reports?: ReportV2[];
    resolveReport?: (id: string, scope: string) => Promise<ReportV2>;
    catalogue?: CatalogueV2;
    compositionAssets?: (snapshot: DraftSnapshot) => Promise<CompositionAssets>;
  },
) {
  const store = createDraftStore(pool, options.schema),
    recommendations = createRecommendationStore(pool, options.schema);
  return {
    async getOrCreateDraftSnapshot(
      requestId: string,
      recommendationId: string,
      selections: unknown,
      accessScope: string,
      presentation?: ProposalPresentation,
    ) {
      z.uuid().parse(requestId);
      z.uuid().parse(recommendationId);
      const existing = await store.findRequest(requestId, accessScope);
      if (existing) {
        const canonical = (items: Adjustments) =>
          [...items].sort((a, b) => a.serviceId.localeCompare(b.serviceId));
        const requested = adjustmentsSchema.parse(selections);
        const saved = existing.snapshot.items.map(
          ({ serviceId, quantity, disposition }) => ({
            serviceId,
            quantity,
            disposition,
          }),
        );
        // A repeat must ask for the same scope and text; never a silent overwrite.
        // Snapshots from before proposal-3 have no presentation to compare.
        const samePresentation =
          !existing.snapshot.presentation ||
          snapshotHash(existing.snapshot.presentation) ===
            snapshotHash(
              proposalPresentationSchema.parse(presentation ?? { intro: "" }),
            );
        if (
          existing.recommendationId !== recommendationId ||
          snapshotHash(canonical(requested)) !==
            snapshotHash(canonical(saved)) ||
          !samePresentation
        )
          throw new Error("draft_request_conflict");
        return existing;
      }
      const recommendation = await recommendations.get(
          recommendationId,
          accessScope,
        ),
        report =
          (options.reports ?? reports).find(
            (r) => r.id === recommendation.report.id,
          ) ??
          (options.resolveReport
            ? await options.resolveReport(recommendation.report.id, accessScope)
            : undefined);
      if (!report) throw new Error("stale_recommendation");
      let snapshot = prepareDraftSnapshot(
        recommendation,
        selections,
        report,
        options.catalogue ?? catalogueV2,
        accessScope,
        options.model,
        presentation,
      );
      if (options.compositionAssets) {
        const assets = compositionAssetsSchema.parse(
          await options.compositionAssets(snapshot),
        );
        snapshot = {
          ...snapshot,
          compositionVersion: "proposal-4",
          compositionAssets: assets,
        };
        checkedCompositionAssets(snapshot, assets.companyId);
      }
      return store.save(requestId, recommendationId, accessScope, snapshot);
    },
    store,
  };
}
