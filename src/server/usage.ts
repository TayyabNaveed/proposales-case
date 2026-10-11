import type pg from "pg";
import { z } from "zod";
// Usage read from the stored runs: every paid call that was admitted, whether
// it succeeded or failed. Cache hits create no run, so they correctly cost
// nothing. Calls made outside the app (evaluation scripts) are not included.
export type UsagePeriod = {
  searches: number;
  // Tavily credits; a failed search can have unknown usage, so this is a floor.
  credits: number;
  aiRuns: number;
  tokens: number;
};
const period = z.object({
  searches: z.coerce.number(),
  credits: z.coerce.number(),
  aiRuns: z.coerce.number(),
  tokens: z.coerce.number(),
});
export async function readUsage(
  pool: pg.Pool,
  scope: string,
  schema = "case_workflow",
): Promise<{ today: UsagePeriod; month: UsagePeriod }> {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const r = await pool.query(
    `WITH runs AS (
       SELECT created_at, stage,
         CASE WHEN stage = 'search' THEN (result->>'credits')::numeric END AS credits,
         coalesce(result->'usage', result->'diagnostics'->'usage') AS u
       FROM "${schema}".research_runs WHERE access_scope = $1
       UNION ALL
       SELECT created_at, 'recommendation', NULL,
         coalesce(result->'usage', diagnostics->'usage')
       FROM "${schema}".recommendation_runs WHERE access_scope = $1
     ), utc AS (SELECT now() AT TIME ZONE 'UTC' AS t)
     SELECT p.name,
       count(*) FILTER (WHERE stage = 'search') AS searches,
       coalesce(sum(credits), 0) AS credits,
       count(*) FILTER (WHERE stage <> 'search') AS "aiRuns",
       coalesce(sum(coalesce((u->>'inputTokens')::bigint, 0) + coalesce((u->>'outputTokens')::bigint, 0)), 0) AS tokens
     FROM utc, (VALUES ('today'), ('month')) AS p(name)
     LEFT JOIN runs ON (runs.created_at AT TIME ZONE 'UTC') >=
       CASE p.name WHEN 'today' THEN date_trunc('day', (SELECT t FROM utc)) ELSE date_trunc('month', (SELECT t FROM utc)) END
     GROUP BY p.name`,
    [scope],
  );
  const by = (name: string) =>
    period.parse(r.rows.find((x) => x.name === name) ?? { searches: 0, credits: 0, aiRuns: 0, tokens: 0 });
  return { today: by("today"), month: by("month") };
}
