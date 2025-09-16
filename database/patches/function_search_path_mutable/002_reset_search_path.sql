-- Purpose: Rollback script to reset search_path for the same set of functions
-- Safety: Idempotent; only resets function-level search_path if previously set

BEGIN;

DO $$
DECLARE
  fn RECORD;
  target_schema TEXT := 'public';
  target_names TEXT[] := ARRAY[
  'update_updated_at_column',
  'log_user_activity',
  'handle_user_profile_sync',
  'track_user_usage',
  'update_user_tier',
  'get_user_complete_profile',
  'update_session_stats',
  'update_session_timestamp',
  'get_user_recent_sessions',
  'track_session_creation',
  'calculate_and_record_message_cost',
  'recompute_image_cost_for_user_message',
  'on_chat_attachment_link_recompute',
  'get_user_model_costs_daily',
  'get_global_model_costs',
  'get_error_count',
  'get_recent_errors',
  'get_user_allowed_models',
  'can_user_use_model',
  'get_sync_stats',
  'sync_openrouter_models',
  'cleanup_old_data',
  'analyze_database_health',
  'get_model_sync_activity_daily',
  'write_admin_audit',
  'cleanup_cta_events',
  '_set_updated_at',
  'ingest_anonymous_usage',
  'get_anonymous_model_costs',
  'ingest_anonymous_error',
  'get_anonymous_errors',
  'cleanup_anonymous_errors'
  ];
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = target_schema
      AND p.proname = ANY (target_names)
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) RESET search_path',
      fn.schema_name,
      fn.func_name,
      fn.identity_args
    );
    RAISE NOTICE 'Reset search_path for %.% (%).', fn.schema_name, fn.func_name, fn.identity_args;
  END LOOP;
END$$;

COMMIT;
