import { trustedEditorUrl } from "./provider-url.js";
import { logEvent } from "./log.js";
import pg from "pg";
import fs from "node:fs";
import type { Operation, OperationStore, Outcome } from "./operations.js";

export function createDatabase(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) throw new Error("database_configuration_missing");
  const u = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    throw new Error("database_protocol_invalid");
  const ca =
    env.DATABASE_CA_PEM ??
    fs.readFileSync(env.DATABASE_CA_PATH ?? "prod-ca-2021.crt", "utf8");
  // Driver URL SSL parameters must not replace explicit CA and hostname verification.
  for (const k of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    u.searchParams.delete(k);
  const pool = new pg.Pool({
    connectionString: u.toString(),
    ssl: { ca, rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    query_timeout: 10000,
    statement_timeout: 10000,
    application_name: "proposales-case",
  });
  pool.on("error", () => {
    logEvent("error", "database_idle_connection_error");
  });
  return pool;
}
export function createOperationStore(
  pool: pg.Pool,
  schema = "case_workflow",
): OperationStore {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const table = `"${schema}".provider_operations`;
  return {
    async claim(key, hash) {
      if (!key || key.length > 200 || !hash || hash.length > 128)
        throw new Error("invalid_operation");
      const insert = await pool.query(
        `INSERT INTO ${table} (operation_key,payload_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING operation_key`,
        [key, hash],
      );
      if (insert.rowCount === 1) return "claimed";
      const existing = await pool.query(
        `SELECT payload_hash FROM ${table} WHERE operation_key=$1`,
        [key],
      );
      if (existing.rows.length !== 1) throw new Error("operation_missing");
      return existing.rows[0].payload_hash === hash ? "existing" : "conflict";
    },
    async get(key) {
      const r = await pool.query(
        `SELECT state,provider_id AS "providerId",editor_url AS "editorUrl",error_code AS "errorCode" FROM ${table} WHERE operation_key=$1`,
        [key],
      );
      if (r.rows.length !== 1) throw new Error("operation_missing");
      return r.rows[0] as Operation;
    },
    async record(key, outcome: Outcome) {
      const id = outcome.state === "confirmed" ? outcome.providerId : null;
      const url =
        outcome.state === "confirmed"
          ? trustedEditorUrl(outcome.editorUrl)
          : undefined;
      const code = outcome.state === "confirmed" ? null : (outcome.errorCode ?? null);
      // A rejection is final; an unknown outcome may still be reconciled to
      // confirmed (or found to be rejected) later.
      const r = await pool.query(
        `UPDATE ${table} SET state=$2, provider_id=$3, editor_url=COALESCE($4,editor_url), error_code=$5, updated_at=now() WHERE operation_key=$1 AND (state IN ('claimed','unknown') OR (state=$2 AND provider_id IS NOT DISTINCT FROM $3))`,
        [key, outcome.state, id, url ?? null, code],
      );
      if (r.rowCount !== 1) throw new Error("operation_transition_conflict");
      if (outcome.state !== "confirmed")
        logEvent(outcome.state === "unknown" ? "error" : "warn", "proposal_create_" + outcome.state, {
          operationKey: key,
          code,
        });
    },
  };
}
