import fs from "node:fs";
import { createDatabase } from "../src/server/db.js";
import { loadLocalEnv, safeFailure } from "./env.js";
// Applies each migration once, recorded in a ledger. Re-running a migration that
// a later one widened (007 then 009, both defining the research stage rule) would
// narrow the rule again and fail, so migrations are not re-run blindly.
const migrations = [
  "001_operations",
  "002_offers",
  "003_recommendations_and_drafts",
  "004_provider_assets",
  "005_research",
  "006_app_role",
  "007_identify_stage",
  "008_configurable_limits",
  "009_intro_stage",
  "010_operation_errors",
];
// Idempotent grants for the optional app role: they must follow new tables.
const repeatable = new Set(["006_app_role"]);
// Databases created before the ledger had every migration up to 009 applied;
// 009's intro stage rule is the evidence.
const beforeLedger = migrations.slice(0, migrations.indexOf("009_intro_stage") + 1);
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  loadLocalEnv();
  pool = createDatabase();
  const ledger = await pool.query(
    `SELECT to_regclass('case_workflow.schema_migrations') IS NOT NULL AS ledger,
            to_regclass('case_workflow.research_runs') IS NOT NULL AS existing,
            EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_runs_stage_check'
                    AND pg_get_constraintdef(oid) LIKE '%intro%') AS intro`,
  );
  const { ledger: hasLedger, existing, intro } = ledger.rows[0];
  await pool.query(
    `CREATE SCHEMA IF NOT EXISTS case_workflow;
     CREATE TABLE IF NOT EXISTS case_workflow.schema_migrations (
       name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
     ALTER TABLE case_workflow.schema_migrations ENABLE ROW LEVEL SECURITY;
     REVOKE ALL ON case_workflow.schema_migrations FROM PUBLIC, anon, authenticated;`,
  );
  if (!hasLedger && existing) {
    if (!intro) throw Object.assign(Error("unknown migration state"), { code: "MIGRATION_STATE_UNKNOWN" });
    for (const name of beforeLedger)
      await pool.query(
        `INSERT INTO case_workflow.schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING`,
        [name],
      );
    console.log(JSON.stringify({ bootstrapped: beforeLedger.length }));
  }
  const applied = new Set(
    (await pool.query(`SELECT name FROM case_workflow.schema_migrations`)).rows.map((r) => r.name),
  );
  for (const migration of migrations) {
    if (applied.has(migration) && !repeatable.has(migration)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync("db/migrations/" + migration + ".sql", "utf8"));
      await client.query(
        `INSERT INTO case_workflow.schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING`,
        [migration],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    console.log(JSON.stringify({ migration, ok: true }));
  }
} catch (e) {
  safeFailure(e);
} finally {
  await pool?.end();
}
