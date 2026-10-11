import fs from "node:fs";
import { createDatabase } from "../src/server/db.js";
import { loadLocalEnv, safeFailure } from "./env.js";
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  loadLocalEnv();
  pool = createDatabase();
  for (const migration of [
    "001_operations",
    "002_offers",
    "003_recommendations_and_drafts",
    "004_provider_assets",
    "005_research",
    "006_app_role",
    "007_identify_stage",
    "008_configurable_limits",
    "009_intro_stage",
  ]) {
    await pool.query(
      fs.readFileSync("db/migrations/" + migration + ".sql", "utf8"),
    );
    console.log(JSON.stringify({ migration, ok: true }));
  }
} catch (e) {
  safeFailure(e);
} finally {
  await pool?.end();
}
