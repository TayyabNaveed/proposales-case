CREATE SCHEMA IF NOT EXISTS case_workflow;
REVOKE ALL ON SCHEMA case_workflow FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS case_workflow.provider_operations (
 operation_key text PRIMARY KEY CHECK (length(operation_key) BETWEEN 1 AND 200),
 payload_hash text NOT NULL CHECK (length(payload_hash) BETWEEN 1 AND 128),
 state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','unknown','confirmed')),
 provider_id uuid,
 editor_url text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((state = 'confirmed') = (provider_id IS NOT NULL))
);
ALTER TABLE case_workflow.provider_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.provider_operations FROM PUBLIC, anon, authenticated;
