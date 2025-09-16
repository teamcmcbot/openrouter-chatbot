-- Purpose: Optimize storage.objects RLS policies by avoiding per-row re-evaluation of auth.* and current_setting()
-- Approach: Rewrite USING/WITH CHECK to wrap calls with scalar subqueries:
--   auth.uid()  -> (select auth.uid())
--   auth.role() -> (select auth.role())
--   current_setting(<args>) -> (select current_setting(<args>))
-- Scope: storage.objects policies (all policies on storage.objects)
-- Safety: Idempotent; textual transform only. Behavior unchanged.

BEGIN;

DO $$
DECLARE
  r RECORD;
  using_expr text;
  check_expr text;
  new_using text;
  new_check text;
  using_sql text;
  check_sql text;
  changed_using boolean;
  changed_check boolean;
BEGIN
  FOR r IN
    SELECT
      n.nspname  AS schemaname,
      c.relname  AS relname,
      p.polname  AS polname,
      pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
  LOOP
    using_expr := r.using_expr;
    check_expr := r.check_expr;

    new_using := using_expr;
    new_check := check_expr;

    IF new_using IS NOT NULL THEN
      -- Normalize pre-existing wrappers
      -- Parenthesized select forms
      new_using := regexp_replace(new_using, '\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)', 'auth.uid()', 'gi');
      new_using := regexp_replace(new_using, '\\(\\s*select\\s+auth\\.role\\s*\\(\\s*\\)\\s*\\)', 'auth.role()', 'gi');
      new_using := regexp_replace(new_using, '\\(\\s*select\\s+current_setting\\s*\\(([^)]*?)\\)\\s*\\)', 'current_setting(\\1)', 'gi');
      -- Bare select forms
      new_using := regexp_replace(new_using, '(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*)', 'auth.uid()', 'gi');
      new_using := regexp_replace(new_using, '(\\s*select\\s+auth\\.role\\s*\\(\\s*\\)\\s*)', 'auth.role()', 'gi');
      new_using := regexp_replace(new_using, '(\\s*select\\s+current_setting\\s*\\(([^)]*?)\\)\\s*)', 'current_setting(\\1)', 'gi');
      -- Apply wrappers
      new_using := regexp_replace(new_using, 'auth\.uid\s*\(\s*\)', '(select auth.uid())', 'gi');
      new_using := regexp_replace(new_using, 'auth\.role\s*\(\s*\)', '(select auth.role())', 'gi');
      new_using := regexp_replace(new_using, 'current_setting\s*\(([^)]*?)\)', '(select current_setting(\1))', 'gi');
    END IF;

    IF new_check IS NOT NULL THEN
      -- Normalize pre-existing wrappers
      -- Parenthesized select forms
      new_check := regexp_replace(new_check, '\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)', 'auth.uid()', 'gi');
      new_check := regexp_replace(new_check, '\\(\\s*select\\s+auth\\.role\\s*\\(\\s*\\)\\s*\\)', 'auth.role()', 'gi');
      new_check := regexp_replace(new_check, '\\(\\s*select\\s+current_setting\\s*\\(([^)]*?)\\)\\s*\\)', 'current_setting(\\1)', 'gi');
      -- Bare select forms
      new_check := regexp_replace(new_check, '(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*)', 'auth.uid()', 'gi');
      new_check := regexp_replace(new_check, '(\\s*select\\s+auth\\.role\\s*\\(\\s*\\)\\s*)', 'auth.role()', 'gi');
      new_check := regexp_replace(new_check, '(\\s*select\\s+current_setting\\s*\\(([^)]*?)\\)\\s*)', 'current_setting(\\1)', 'gi');
      -- Apply wrappers
      new_check := regexp_replace(new_check, 'auth\.uid\s*\(\s*\)', '(select auth.uid())', 'gi');
      new_check := regexp_replace(new_check, 'auth\.role\s*\(\s*\)', '(select auth.role())', 'gi');
      new_check := regexp_replace(new_check, 'current_setting\s*\(([^)]*?)\)', '(select current_setting(\1))', 'gi');
    END IF;

    changed_using := COALESCE(new_using, '') <> COALESCE(using_expr, '');
    changed_check := COALESCE(new_check, '') <> COALESCE(check_expr, '');

    IF changed_using OR changed_check THEN
      using_sql := CASE WHEN new_using IS NOT NULL THEN ' USING (' || new_using || ')' ELSE '' END;
      check_sql := CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END;
      EXECUTE format('ALTER POLICY %I ON %I.%I%s%s', r.polname, r.schemaname, r.relname, using_sql, check_sql);
      RAISE NOTICE 'Updated storage policy % (using_changed=%, check_changed=%)', r.polname, changed_using, changed_check;
    ELSE
      RAISE NOTICE 'No change needed for storage policy %', r.polname;
    END IF;
  END LOOP;
END $$;

COMMIT;
