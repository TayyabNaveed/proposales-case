-- Least-privilege runtime access for the hosted app. The role itself, with its
-- password, is created by the operator outside source control:
--   CREATE ROLE case_app LOGIN NOINHERIT PASSWORD '<chosen password>';
-- The app only reads, inserts and updates rows; it never deletes or changes DDL.
-- Every table has RLS enabled without policies, so the role also needs a policy.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'case_app') THEN
    RAISE NOTICE 'case_app role absent; skipping grants';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA case_workflow TO case_app;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA case_workflow TO case_app;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'case_workflow' LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'case_workflow' AND tablename = t AND policyname = 'case_app_rows'
    ) THEN
      EXECUTE format(
        'CREATE POLICY case_app_rows ON case_workflow.%I FOR ALL TO case_app USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;
