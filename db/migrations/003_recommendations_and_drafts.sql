-- Phase 3 recommendation records. Immutable draft snapshots are added in Phase 4.
CREATE TABLE IF NOT EXISTS case_workflow.recommendation_runs (
 id uuid PRIMARY KEY,
 input_hash text NOT NULL CHECK(length(input_hash)=64),
 access_scope text NOT NULL CHECK(length(access_scope) BETWEEN 1 AND 200),
 state text NOT NULL DEFAULT 'running' CHECK(state IN ('running','ready','failed')),
 report jsonb NOT NULL,
 catalogue jsonb NOT NULL,
 identity jsonb NOT NULL,
 result jsonb,
 diagnostics jsonb,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 CHECK ((state='ready') = (result IS NOT NULL)),
 CHECK ((state='failed') = (error_code IS NOT NULL)),
 CHECK (state<>'ready' OR expires_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS case_workflow.recommendation_heads (
 input_hash text PRIMARY KEY CHECK(length(input_hash)=64),
 run_id uuid REFERENCES case_workflow.recommendation_runs(id)
);
CREATE TABLE IF NOT EXISTS case_workflow.recommendation_budgets (
 access_scope text NOT NULL,
 day date NOT NULL,
 admitted integer NOT NULL CHECK(admitted BETWEEN 1 AND 20),
 PRIMARY KEY(access_scope,day)
);
ALTER TABLE case_workflow.recommendation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_workflow.recommendation_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_workflow.recommendation_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.recommendation_runs,case_workflow.recommendation_heads,case_workflow.recommendation_budgets FROM PUBLIC,anon,authenticated;

-- Phase 4: immutable generation versions, distinct from historical approvals.
CREATE TABLE IF NOT EXISTS case_workflow.draft_snapshots (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL,
 recommendation_id uuid NOT NULL REFERENCES case_workflow.recommendation_runs(id),
 access_scope text NOT NULL CHECK(length(access_scope) BETWEEN 1 AND 200),
 snapshot jsonb NOT NULL,
 snapshot_hash text NOT NULL CHECK(length(snapshot_hash)=64),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(access_scope,request_id)
);
CREATE TABLE IF NOT EXISTS case_workflow.draft_budgets (
 access_scope text NOT NULL,
 day date NOT NULL,
 admitted integer NOT NULL CHECK(admitted BETWEEN 1 AND 10),
 PRIMARY KEY(access_scope,day)
);
ALTER TABLE case_workflow.draft_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_workflow.draft_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.draft_snapshots,case_workflow.draft_budgets FROM PUBLIC,anon,authenticated;
-- Preserve the actual provider-returned editor URL beside its durable UUID.
ALTER TABLE IF EXISTS case_workflow.provider_operations ADD COLUMN IF NOT EXISTS editor_url text;
