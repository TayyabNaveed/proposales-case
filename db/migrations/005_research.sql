-- Separate source-search and model-report admissions; no public Data API access.
CREATE TABLE IF NOT EXISTS case_workflow.research_runs (
 id uuid PRIMARY KEY,
 stage text NOT NULL CHECK(stage IN ('search','report')),
 input_hash text NOT NULL CHECK(length(input_hash)=64),
 access_scope text NOT NULL CHECK(length(access_scope) BETWEEN 1 AND 200),
 input jsonb NOT NULL,
 state text NOT NULL DEFAULT 'running' CHECK(state IN ('running','ready','partial','failed')),
 result jsonb,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 CHECK(state<>'ready' OR (result IS NOT NULL AND expires_at IS NOT NULL)),
 CHECK(state NOT IN ('partial','failed') OR error_code IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS case_workflow.research_heads (
 input_hash text PRIMARY KEY CHECK(length(input_hash)=64),
 run_id uuid REFERENCES case_workflow.research_runs(id)
);
CREATE TABLE IF NOT EXISTS case_workflow.research_budgets (
 access_scope text NOT NULL,
 stage text NOT NULL CHECK(stage IN ('search','report')),
 day date NOT NULL,
 admitted integer NOT NULL CHECK(admitted BETWEEN 1 AND 10),
 PRIMARY KEY(access_scope,stage,day)
);
ALTER TABLE case_workflow.research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_workflow.research_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_workflow.research_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.research_runs,case_workflow.research_heads,case_workflow.research_budgets FROM PUBLIC,anon,authenticated;
