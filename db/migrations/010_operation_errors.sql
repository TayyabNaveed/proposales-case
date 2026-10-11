-- A provider write can now end as rejected (a definite client error: nothing was
-- created), and every failed write keeps a safe error category such as http_422
-- or network, never a provider body. Widening keeps every existing row valid.
ALTER TABLE case_workflow.provider_operations ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE case_workflow.provider_operations DROP CONSTRAINT IF EXISTS provider_operations_error_code_check;
ALTER TABLE case_workflow.provider_operations ADD CONSTRAINT provider_operations_error_code_check
  CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,40}$');
ALTER TABLE case_workflow.provider_operations DROP CONSTRAINT IF EXISTS provider_operations_state_check;
ALTER TABLE case_workflow.provider_operations ADD CONSTRAINT provider_operations_state_check
  CHECK (state IN ('claimed', 'unknown', 'confirmed', 'rejected'));
