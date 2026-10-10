CREATE TABLE IF NOT EXISTS case_workflow.approved_offers (
 id uuid PRIMARY KEY, request_id uuid UNIQUE NOT NULL, reviewer_id text NOT NULL,
 snapshot jsonb NOT NULL, snapshot_hash text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE case_workflow.approved_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.approved_offers FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS case_workflow.access_attempts (
 bucket text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL
);
ALTER TABLE case_workflow.access_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.access_attempts FROM PUBLIC, anon, authenticated;
