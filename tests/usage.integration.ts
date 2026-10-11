import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
import { readUsage } from "../src/server/usage.js";
loadLocalEnv();
test("usage totals admitted runs per scope for today and this month, including failed runs", async () => {
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    pool = createDatabase();
  const hash = () => randomBytes(32).toString("hex");
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const m of ["003_recommendations_and_drafts", "005_research", "007_identify_stage", "008_configurable_limits"])
      await pool.query(fs.readFileSync(`db/migrations/${m}.sql`, "utf8").replaceAll("case_workflow", schema));
    const research = (scope: string, stage: string, state: string, result: unknown, when = "now()") =>
      pool.query(
        `INSERT INTO "${schema}".research_runs(id,stage,input_hash,access_scope,input,state,result,error_code,created_at,expires_at)
         VALUES($1,$2,$3,$4,'{}',$5,$6,$7,${when},${state === "ready" ? "now()+interval '1 day'" : "NULL"})`,
        [randomUUID(), stage, hash(), scope, state, JSON.stringify(result), state === "failed" ? "research_report_failed" : null],
      );
    const usage = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: 0 });
    await research("a", "search", "ready", { credits: 3 });
    await research("a", "identify", "ready", { usage: usage(100, 20) });
    await research("a", "report", "failed", { diagnostics: { usage: usage(50, 10) } });
    await research("b", "search", "ready", { credits: 3 });
    // Last month: counted nowhere this month.
    await research("a", "search", "ready", { credits: 3 }, "date_trunc('month', now()) - interval '2 days'");
    await pool.query(
      `INSERT INTO "${schema}".recommendation_runs(id,input_hash,access_scope,state,report,catalogue,identity,result,expires_at)
       VALUES($1,$2,'a','ready','{}','{}','{}',$3,now()+interval '1 day')`,
      [randomUUID(), hash(), JSON.stringify({ usage: usage(300, 30) })],
    );
    const a = await readUsage(pool, "a", schema);
    assert.deepEqual(a.today, { searches: 1, credits: 3, aiRuns: 3, tokens: 510 });
    assert.deepEqual(a.month, a.today);
    assert.deepEqual((await readUsage(pool, "c", schema)).today, { searches: 0, credits: 0, aiRuns: 0, tokens: 0 });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
