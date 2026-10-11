import { randomUUID } from "node:crypto";
import { dailyLimit } from "./limits.js";
import type pg from "pg";
import { reports, type ReportV2 } from "../domain/reports.js";
import { catalogueV2, type CatalogueV2 } from "../domain/catalogue.js";
import { validateSelection } from "../domain/selection.js";
import { snapshotHash } from "./canonical.js";
import { createDatabase } from "./db.js";
import {
  recommendServices,
  recommendationIdentity,
  RecommendationFailure,
  type RecommendationRun,
  type RunDiagnostics,
} from "./providers/recommendations.js";

type Identity = ReturnType<typeof recommendationIdentity>;
export type RecommendationRecord = {
  id: string;
  inputHash: string;
  accessScope: string;
  state: "running" | "ready" | "failed";
  report: ReportV2;
  catalogue: CatalogueV2;
  identity: Identity;
  result: RecommendationRun | null;
  diagnostics: RunDiagnostics | null;
  errorCode: string | null;
  createdAt: string;
  expiresAt: string | null;
  cacheHit: boolean;
};
type AdmissionInput = {
  identity: Identity;
  report: ReportV2;
  catalogue: CatalogueV2;
  accessScope: string;
};
const projection = `id,input_hash AS "inputHash",access_scope AS "accessScope",state,report,catalogue,identity,result,diagnostics,error_code AS "errorCode",created_at AS "createdAt",expires_at AS "expiresAt"`;
const record = (
  row: Record<string, unknown>,
  cacheHit = false,
): RecommendationRecord =>
  ({
    ...row,
    createdAt: (row.createdAt as Date).toISOString(),
    expiresAt: row.expiresAt ? (row.expiresAt as Date).toISOString() : null,
    cacheHit,
  }) as RecommendationRecord;
export function createRecommendationStore(
  pool: pg.Pool,
  schema = "case_workflow",
  limit: number | null = dailyLimit("recommendation"),
) {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const runs = `"${schema}".recommendation_runs`,
    heads = `"${schema}".recommendation_heads`,
    budgets = `"${schema}".recommendation_budgets`;
  return {
    async admit(input: AdmissionInput, refresh: boolean) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO ${heads}(input_hash) VALUES($1) ON CONFLICT DO NOTHING`,
          [input.identity.inputHash],
        );
        const head = await client.query(
          `SELECT run_id FROM ${heads} WHERE input_hash=$1 FOR UPDATE`,
          [input.identity.inputHash],
        );
        if (head.rows[0].run_id) {
          const old = await client.query(
            `SELECT ${projection},(created_at>now()-interval '120 seconds') AS active,(expires_at>now()) AS fresh FROM ${runs} WHERE id=$1`,
            [head.rows[0].run_id],
          );
          const row = old.rows[0];
          if (!row || row.accessScope !== input.accessScope)
            throw new Error("recommendation_conflict");
          if (
            (row.state === "running" && (!refresh || row.active)) ||
            (!refresh &&
              (row.state === "failed" || (row.state === "ready" && row.fresh)))
          ) {
            await client.query("COMMIT");
            return {
              claimed: false,
              record: record(row, row.state === "ready"),
            };
          }
          if (row.state === "running")
            await client.query(
              `UPDATE ${runs} SET state='failed',error_code='recommendation_interrupted' WHERE id=$1 AND state='running'`,
              [row.id],
            );
        }
        const budget = await client.query(
          `INSERT INTO ${budgets}(access_scope,day,admitted) VALUES($1,(now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(access_scope,day) DO UPDATE SET admitted=${budgets}.admitted+1 WHERE $2::int IS NULL OR ${budgets}.admitted<$2 RETURNING admitted`,
          [input.accessScope, limit],
        );
        if (budget.rowCount !== 1)
          throw new Error("recommendation_budget_exceeded");
        const id = randomUUID();
        const inserted = await client.query(
          `INSERT INTO ${runs}(id,input_hash,access_scope,report,catalogue,identity) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${projection}`,
          [
            id,
            input.identity.inputHash,
            input.accessScope,
            JSON.stringify(input.report),
            JSON.stringify(input.catalogue),
            JSON.stringify(input.identity),
          ],
        );
        await client.query(
          `UPDATE ${heads} SET run_id=$2 WHERE input_hash=$1`,
          [input.identity.inputHash, id],
        );
        await client.query("COMMIT");
        return { claimed: true, record: record(inserted.rows[0]) };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          discard = true;
        }
        throw error;
      } finally {
        client.release(discard);
      }
    },
    async get(id: string, accessScope: string) {
      const rows = await pool.query(
        `SELECT ${projection} FROM ${runs} WHERE id=$1 AND access_scope=$2`,
        [id, accessScope],
      );
      if (rows.rowCount !== 1) throw new Error("recommendation_missing");
      return record(rows.rows[0]);
    },
    async finish(
      id: string,
      accessScope: string,
      outcome:
        | { result: RecommendationRun }
        | { errorCode: string; diagnostics: RunDiagnostics | null },
    ) {
      const previous = await this.get(id, accessScope);
      let result: RecommendationRun | null = null,
        diagnostics: RunDiagnostics | null = null,
        errorCode: string | null = null;
      if ("result" in outcome) {
        result = outcome.result;
        if (
          result.reportHash !== snapshotHash(previous.report) ||
          result.catalogueHash !== snapshotHash(previous.catalogue) ||
          result.model !== previous.identity.model ||
          result.promptVersion !== previous.identity.promptVersion ||
          result.schemaVersion !== previous.identity.schemaVersion
        )
          throw new Error("recommendation_conflict");
        result = {
          ...result,
          selection: validateSelection(
            previous.report,
            result.selection,
            previous.catalogue,
          ),
        };
      } else {
        const allowed = [
          "recommendation_invalid",
          "recommendation_call_failed",
          "recommendation_cancelled",
          "recommendation_input_too_large",
          "model_configuration_missing",
        ];
        errorCode = allowed.includes(outcome.errorCode)
          ? outcome.errorCode
          : "recommendation_failed";
        diagnostics = outcome.diagnostics;
      }
      const changed = await pool.query(
        `UPDATE ${runs} SET state=$3,result=$4,diagnostics=$5,error_code=$6,expires_at=CASE WHEN $3='ready' THEN now()+interval '24 hours' ELSE NULL END WHERE id=$1 AND access_scope=$2 AND state='running' RETURNING ${projection}`,
        [
          id,
          accessScope,
          result ? "ready" : "failed",
          result ? JSON.stringify(result) : null,
          diagnostics ? JSON.stringify(diagnostics) : null,
          errorCode,
        ],
      );
      if (changed.rowCount !== 1)
        throw new Error("recommendation_transition_conflict");
      return record(changed.rows[0]);
    },
  };
}
export function createRecommendationService(
  store: ReturnType<typeof createRecommendationStore>,
  options: {
    model: string;
    apiKey?: string;
    fetch?: typeof fetch;
    reports?: ReportV2[];
    resolveReport?: (id: string, scope: string) => Promise<ReportV2>;
    catalogue?: CatalogueV2;
  },
) {
  return {
    async getOrCreateRecommendation(
      reportId: string,
      accessScope: string,
      refresh: boolean,
    ): Promise<RecommendationRecord> {
      const report =
          (options.reports ?? reports).find((r) => r.id === reportId) ??
          (options.resolveReport
            ? await options.resolveReport(reportId, accessScope)
            : undefined),
        catalogue = options.catalogue ?? catalogueV2;
      if (!report) throw new Error("report_missing");
      const identity = recommendationIdentity(
        report,
        catalogue,
        accessScope,
        options.model,
      );
      const admitted = await store.admit(
        { identity, report, catalogue, accessScope },
        refresh,
      );
      if (!admitted.claimed) return admitted.record;
      let result: RecommendationRun;
      try {
        result = await recommendServices(
          admitted.record.report,
          admitted.record.catalogue,
          {
            model: options.model,
            apiKey: options.apiKey,
            fetch: options.fetch,
          },
        );
      } catch (error) {
        return store.finish(admitted.record.id, accessScope, {
          errorCode:
            error instanceof Error ? error.message : "recommendation_failed",
          diagnostics:
            error instanceof RecommendationFailure ? error.diagnostics : null,
        });
      }
      // Persistence failure remains running/uncertain; it must not relabel a successful billed call as retryable.
      return store.finish(admitted.record.id, accessScope, { result });
    },
  };
}
let pool: ReturnType<typeof createDatabase> | undefined;
export function getOrCreateRecommendation(
  reportId: string,
  accessScope: string,
  refresh: boolean,
) {
  const model = process.env.DEEPSEEK_MODEL;
  if (!model || !process.env.DEEPSEEK_API_KEY)
    throw new Error("model_configuration_missing");
  pool ??= createDatabase();
  return createRecommendationService(createRecommendationStore(pool), {
    model,
  }).getOrCreateRecommendation(reportId, accessScope, refresh);
}
