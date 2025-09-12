-- Purpose: Rollback wrapper changes by replacing SELECT-wrapped calls back to direct calls
-- Safety: Idempotent; only textual transform of policy expressions. Behavior is unchanged.

BEGIN;

DO $$
DECLARE
  r RECORD;
  target_tables text[] := ARRAY[
    'profiles',
    'user_activity_log',
    'chat_sessions',
    'chat_messages',
    'user_usage_daily',
    'model_sync_log',
    'admin_audit_log',
    'message_token_costs',
    'chat_attachments',
    'chat_message_annotations',
    'cta_events',
    'anonymous_usage_daily',
    'anonymous_model_usage_daily',
    'anonymous_error_events',
    'moderation_actions'
  ];
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
    WHERE n.nspname = 'public'
      AND c.relname = ANY (target_tables)
  LOOP
    using_expr := r.using_expr;
    check_expr := r.check_expr;

    new_using := using_expr;
    new_check := check_expr;

    IF new_using IS NOT NULL THEN
      new_using := regexp_replace(new_using, '(\s*select\s+auth\.uid\s*\(\s*\)\s*)', 'auth.uid()', 'gi');
      new_using := regexp_replace(new_using, '(\s*select\s+auth\.role\s*\(\s*\)\s*)', 'auth.role()', 'gi');
      new_using := regexp_replace(new_using, '(\s*select\s+current_setting\s*\(([^)]*?)\)\s*)', 'current_setting(\1)', 'gi');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, '(\s*select\s+auth\.uid\s*\(\s*\)\s*)', 'auth.uid()', 'gi');
      new_check := regexp_replace(new_check, '(\s*select\s+auth\.role\s*\(\s*\)\s*)', 'auth.role()', 'gi');
      new_check := regexp_replace(new_check, '(\s*select\s+current_setting\s*\(([^)]*?)\)\s*)', 'current_setting(\1)', 'gi');
    END IF;

    changed_using := COALESCE(new_using, '') <> COALESCE(using_expr, '');
    changed_check := COALESCE(new_check, '') <> COALESCE(check_expr, '');

    IF changed_using OR changed_check THEN
      using_sql := CASE WHEN new_using IS NOT NULL THEN ' USING (' || new_using || ')' ELSE '' END;
      check_sql := CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END;
      EXECUTE format('ALTER POLICY %I ON %I.%I%s%s', r.polname, r.schemaname, r.relname, using_sql, check_sql);
      RAISE NOTICE 'Rolled back policy % on %.% (using_changed=%, check_changed=%)', r.polname, r.schemaname, r.relname, changed_using, changed_check;
    ELSE
      RAISE NOTICE 'No change needed for policy % on %.%', r.polname, r.schemaname, r.relname;
    END IF;
  END LOOP;
END $$;

COMMIT;
