-- Guided flow: an identify stage between search and report. Widening the allowed
-- stage names keeps every existing row valid.
ALTER TABLE case_workflow.research_runs DROP CONSTRAINT IF EXISTS research_runs_stage_check;
ALTER TABLE case_workflow.research_runs ADD CONSTRAINT research_runs_stage_check
  CHECK (stage IN ('search', 'identify', 'report'));
ALTER TABLE case_workflow.research_budgets DROP CONSTRAINT IF EXISTS research_budgets_stage_check;
ALTER TABLE case_workflow.research_budgets ADD CONSTRAINT research_budgets_stage_check
  CHECK (stage IN ('search', 'identify', 'report'));
