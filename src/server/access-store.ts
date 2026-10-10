import type pg from "pg";
export async function consumeLoginAttempt(
  pool: pg.Pool,
  bucket: string,
  schema = "case_workflow",
  limit = 5,
) {
  if (
    !/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema) ||
    !bucket ||
    bucket.length > 128
  )
    throw new Error("invalid_access_bucket");
  const table = `"${schema}".access_attempts`;
  const r = await pool.query(
    `INSERT INTO ${table}(bucket,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN ${table}.expires_at<=now() THEN 1 ELSE ${table}.attempts+1 END, expires_at=CASE WHEN ${table}.expires_at<=now() THEN now()+interval '1 minute' ELSE ${table}.expires_at END RETURNING attempts`,
    [bucket],
  );
  return r.rows[0].attempts <= limit;
}
// Shared signed demo principal; action-specific limits do not trust forwarding headers.
export async function consumeActionAttempt(pool: pg.Pool, bucket: string) {
  if (!bucket || bucket.length > 128) throw new Error("invalid_access_bucket");
  const r = await pool.query(
    `INSERT INTO case_workflow.access_attempts(bucket,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN case_workflow.access_attempts.expires_at<=now() THEN 1 ELSE case_workflow.access_attempts.attempts+1 END,expires_at=CASE WHEN case_workflow.access_attempts.expires_at<=now() THEN now()+interval '1 minute' ELSE case_workflow.access_attempts.expires_at END RETURNING attempts`,
    [bucket],
  );
  return r.rows[0].attempts <= 30;
}
