-- Daily caps are configured in src/server/limits.ts (env DAILY_LIMIT_*). The
-- application enforces the number; the database only keeps counts positive.
-- Widening keeps every existing row valid.
ALTER TABLE case_workflow.research_budgets DROP CONSTRAINT IF EXISTS research_budgets_admitted_check;
ALTER TABLE case_workflow.research_budgets ADD CONSTRAINT research_budgets_admitted_check CHECK (admitted >= 1);
ALTER TABLE case_workflow.recommendation_budgets DROP CONSTRAINT IF EXISTS recommendation_budgets_admitted_check;
ALTER TABLE case_workflow.recommendation_budgets ADD CONSTRAINT recommendation_budgets_admitted_check CHECK (admitted >= 1);
ALTER TABLE case_workflow.draft_budgets DROP CONSTRAINT IF EXISTS draft_budgets_admitted_check;
ALTER TABLE case_workflow.draft_budgets ADD CONSTRAINT draft_budgets_admitted_check CHECK (admitted >= 1);
