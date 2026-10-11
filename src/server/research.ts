import { activePrompts } from "../prompts/active.js";
import { promptProvenance } from "./prompt-provenance.js";
import {
  publicResearchSchema,
  searchResultSchema,
  reportResultSchema,
  reportDiagnosticsSchema,
  identifyResultSchema,
} from "../domain/research-state.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import { snapshotHash } from "./canonical.js";
import { dailyLimit } from "./limits.js";
import {
  researchInputSchema,
  researchOutputSchema,
  identifyOutputSchema,
  operatorChoiceSchema,
  notesEvidence,
  type ResearchInput,
  type OperatorChoice,
} from "../domain/research.js";
import { reportSchema, type ReportV2 } from "../domain/reports.js";
import {
  searchBusiness,
  generateResearchReport,
  identifyBusiness,
  ResearchIdentifyFailure,
  searchVersion,
  reportPromptVersion,
  type SearchResult,
  ResearchReportFailure,
} from "./providers/research.js";
type Stage = "search" | "identify" | "report";
export type ResearchRecord = {
  id: string;
  stage: Stage;
  inputHash: string;
  accessScope: string;
  input: unknown;
  state: "running" | "ready" | "partial" | "failed";
  result: unknown;
  errorCode: string | null;
  createdAt: string;
  expiresAt: string | null;
  cacheHit: boolean;
};
const projection =
  'id,stage,input_hash AS "inputHash",access_scope AS "accessScope",input,state,result,error_code AS "errorCode",created_at AS "createdAt",expires_at AS "expiresAt"';
const record = (r: Record<string, unknown>, cacheHit = false): ResearchRecord =>
  ({
    ...r,
    createdAt: (r.createdAt as Date).toISOString(),
    expiresAt: r.expiresAt ? (r.expiresAt as Date).toISOString() : null,
    cacheHit,
  }) as ResearchRecord;
export function createResearchStore(
  pool: pg.Pool,
  schema = "case_workflow",
  limitFor: (stage: Stage) => number | null = dailyLimit,
) {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const runs = `"${schema}".research_runs`,
    heads = `"${schema}".research_heads`,
    budgets = `"${schema}".research_budgets`;
  return {
    async admit(a: {
      stage: Stage;
      identity: unknown;
      input: unknown;
      scope: string;
      refresh: boolean;
    }) {
      if (!a.scope || a.scope.length > 200) throw new Error("invalid_input");
      const hash = snapshotHash({
        stage: a.stage,
        identity: a.identity,
        scope: a.scope,
      });
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          `INSERT INTO ${heads}(input_hash) VALUES($1) ON CONFLICT DO NOTHING`,
          [hash],
        );
        const h = await c.query(
          `SELECT run_id FROM ${heads} WHERE input_hash=$1 FOR UPDATE`,
          [hash],
        );
        if (h.rows[0].run_id) {
          const r = await c.query(
            `SELECT ${projection},created_at>now()-interval '180 seconds' AS active,expires_at>now() AS fresh FROM ${runs} WHERE id=$1`,
            [h.rows[0].run_id],
          );
          const old = r.rows[0];
          if (!old || old.accessScope !== a.scope)
            throw new Error("research_conflict");
          if (
            (old.state === "running" && (!a.refresh || old.active)) ||
            (!a.refresh &&
              (old.state === "failed" ||
                old.state === "partial" ||
                (old.state === "ready" && old.fresh)))
          ) {
            await c.query("COMMIT");
            return {
              claimed: false,
              record: record(old, old.state === "ready"),
            };
          }
          if (old.state === "running")
            await c.query(
              `UPDATE ${runs} SET state='failed',error_code='research_interrupted' WHERE id=$1 AND state='running'`,
              [old.id],
            );
        }
        const budget = await c.query(
          `INSERT INTO ${budgets}(access_scope,stage,day,admitted) VALUES($1,$2,(now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(access_scope,stage,day) DO UPDATE SET admitted=${budgets}.admitted+1 WHERE $3::int IS NULL OR ${budgets}.admitted<$3 RETURNING admitted`,
          [a.scope, a.stage, limitFor(a.stage)],
        );
        if (budget.rowCount !== 1) throw new Error("research_budget_exceeded");
        const id = randomUUID(),
          r = await c.query(
            `INSERT INTO ${runs}(id,stage,input_hash,access_scope,input) VALUES($1,$2,$3,$4,$5) RETURNING ${projection}`,
            [id, a.stage, hash, a.scope, JSON.stringify(a.input)],
          );
        await c.query(`UPDATE ${heads} SET run_id=$2 WHERE input_hash=$1`, [
          hash,
          id,
        ]);
        await c.query("COMMIT");
        return { claimed: true, record: record(r.rows[0]) };
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    async get(id: string, scope: string) {
      z.uuid().parse(id);
      const r = await pool.query(
        `SELECT ${projection} FROM ${runs} WHERE id=$1 AND access_scope=$2`,
        [id, scope],
      );
      if (r.rowCount !== 1) throw new Error("research_missing");
      return record(r.rows[0]);
    },
    async finish(
      id: string,
      scope: string,
      state: "ready" | "partial" | "failed",
      result: unknown,
      errorCode?: string,
    ) {
      const allowed = [
        "research_search_partial",
        "research_search_failed",
        "research_report_failed",
        "research_identify_failed",
        "research_sources_missing",
      ];
      const code =
        state === "ready"
          ? null
          : allowed.includes(errorCode ?? "")
            ? errorCode
            : "research_failed";
      const r = await pool.query(
        `UPDATE ${runs} SET state=$3,result=$4,error_code=$5,expires_at=CASE WHEN $3='ready' THEN now()+interval '24 hours' ELSE NULL END WHERE id=$1 AND access_scope=$2 AND state='running' RETURNING ${projection}`,
        [
          id,
          scope,
          state,
          result === null ? null : JSON.stringify(result),
          code,
        ],
      );
      if (r.rowCount !== 1) throw new Error("research_transition_conflict");
      return record(r.rows[0]);
    },
  };
}
export function createResearchService(
  store: ReturnType<typeof createResearchStore>,
  options: {
    model: string;
    tavilyKey?: string;
    apiKey?: string;
    searchFetch?: typeof fetch;
    modelFetch?: typeof fetch;
  },
) {
  function modelConfigured() {
    if (!(options.apiKey ?? process.env.DEEPSEEK_API_KEY) || !options.model)
      throw new Error("model_configuration_missing");
  }
  function fresh(r: ResearchRecord, stage: Stage) {
    if (
      r.stage !== stage ||
      r.state !== "ready" ||
      !r.expiresAt ||
      Date.parse(r.expiresAt) <= Date.now()
    )
      throw new Error("research_stale");
  }
  return {
    async search(raw: ResearchInput, scope: string, refresh = false) {
      const input = researchInputSchema.parse(raw);
      if (!(options.tavilyKey ?? process.env.TAVILY_API_KEY))
        throw new Error("research_configuration_missing");
      const a = await store.admit({
        stage: "search",
        identity: { input, searchVersion },
        input,
        scope,
        refresh,
      });
      if (!a.claimed) return a.record;
      let result: SearchResult;
      try {
        result = await searchBusiness(input, {
          apiKey: options.tavilyKey,
          fetch: options.searchFetch,
        });
      } catch {
        return store.finish(
          a.record.id,
          scope,
          "failed",
          null,
          "research_search_failed",
        );
      }
      return store.finish(
        a.record.id,
        scope,
        result.state,
        result,
        result.state === "partial" ? "research_search_partial" : undefined,
      );
    },
    async identify(searchId: string, scope: string, refresh = false) {
      const search = await store.get(searchId, scope);
      fresh(search, "search");
      const data = searchResultSchema.parse(search.result);
      if (!data.evidence.length) throw new Error("research_sources_missing");
      modelConfigured();
      const a = await store.admit({
        stage: "identify",
        identity: {
          input: data.input,
          evidence: data.evidence,
          searchVersion,
          provenance: promptProvenance(
            activePrompts.identify,
            z.toJSONSchema(identifyOutputSchema),
          ),
          model: options.model,
        },
        input: { searchId },
        scope,
        refresh,
      });
      if (!a.claimed) return a.record;
      try {
        const result = await identifyBusiness(data.input, data.evidence, {
          apiKey: options.apiKey,
          model: options.model,
          fetch: options.modelFetch,
        });
        return store.finish(a.record.id, scope, "ready", result);
      } catch (error) {
        return store.finish(
          a.record.id,
          scope,
          "failed",
          error instanceof ResearchIdentifyFailure
            ? { diagnostics: error.diagnostics }
            : null,
          "research_identify_failed",
        );
      }
    },
    // The operator's choice selects one verified candidate and states the website.
    // Only that candidate's sources reach the report model.
    async report(
      searchId: string,
      identifyId: string,
      rawChoice: OperatorChoice,
      scope: string,
      refresh = false,
    ) {
      const choice = operatorChoiceSchema.parse(rawChoice);
      const search = await store.get(searchId, scope),
        identified = await store.get(identifyId, scope);
      fresh(search, "search");
      fresh(identified, "identify");
      if ((identified.input as { searchId?: string }).searchId !== searchId)
        throw new Error("research_choice_invalid");
      const data = searchResultSchema.parse(search.result);
      const candidate = identifyResultSchema.parse(identified.result).identity
        .candidates[choice.candidate];
      if (
        !candidate ||
        (choice.website.kind === "selected" &&
          !(candidate.websiteSourceIds ?? []).includes(choice.website.sourceId))
      )
        throw new Error("research_choice_invalid");
      const evidence = [
        ...data.evidence.filter((e) => candidate.sourceIds.includes(e.id)),
        ...(choice.notes ? [notesEvidence(choice.notes, identified.createdAt)] : []),
      ];
      if (!evidence.length) throw new Error("research_sources_missing");
      modelConfigured();
      const chosen = { candidate, website: choice.website };
      const a = await store.admit({
        stage: "report",
        identity: {
          input: data.input,
          evidence,
          chosen,
          searchVersion,
          reportPromptVersion,
          provenance: promptProvenance(
            activePrompts.research,
            z.toJSONSchema(researchOutputSchema),
          ),
          model: options.model,
        },
        input: { searchId, identifyId, choice },
        scope,
        refresh,
      });
      if (!a.claimed) return a.record;
      let result: Awaited<ReturnType<typeof generateResearchReport>>;
      try {
        result = await generateResearchReport(
          data.input,
          evidence,
          "live-" + a.record.id,
          chosen,
          {
            apiKey: options.apiKey,
            model: options.model,
            fetch: options.modelFetch,
          },
        );
      } catch (error) {
        return store.finish(
          a.record.id,
          scope,
          "failed",
          error instanceof ResearchReportFailure
            ? { diagnostics: error.diagnostics }
            : null,
          "research_report_failed",
        );
      }
      return store.finish(a.record.id, scope, "ready", result);
    },
    async resolveReport(id: string, scope: string): Promise<ReportV2> {
      if (!id.startsWith("live-")) throw new Error("report_missing");
      const r = await store.get(id.slice(5), scope);
      fresh(r, "report");
      return reportResultSchema.parse(r.result).report;
    },
    get: store.get,
  };
}
export function publicResearch(r: ResearchRecord) {
  const common = {
    id: r.id,
    stage: r.stage,
    state: r.state,
    errorCode: r.errorCode,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    cacheHit: r.cacheHit,
    input: r.input,
  };
  if (r.stage === "search")
    return publicResearchSchema.parse({
      ...common,
      result: r.result === null ? null : searchResultSchema.parse(r.result),
    });
  if (r.stage === "identify")
    return publicResearchSchema.parse({
      ...common,
      result: r.state === "ready" ? identifyResultSchema.parse(r.result) : null,
      diagnostics:
        r.state === "failed" && r.result !== null
          ? reportDiagnosticsSchema.parse(
              (r.result as { diagnostics: unknown }).diagnostics,
            )
          : null,
    });
  const failed =
    r.state === "failed" && r.result !== null
      ? reportDiagnosticsSchema.parse(
          (r.result as { diagnostics: unknown }).diagnostics,
        )
      : null;
  return publicResearchSchema.parse({
    ...common,
    result: r.state === "ready" ? reportResultSchema.parse(r.result) : null,
    diagnostics: failed,
  });
}
