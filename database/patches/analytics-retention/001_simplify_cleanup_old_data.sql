-- Patch: Simplify cleanup_old_data to single integer-based retention across analytics tables
-- Date: 2025-09-10
-- Context: Replaces earlier multi-config implementation; uniform retention parameter.
-- Safety: Idempotent redefinition of function only. Assumes tables already exist.

BEGIN;

-- Drop any previous internal/JSONB variants if present (defensive cleanup)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='_cleanup_old_data_internal'
    ) THEN
        EXECUTE 'DROP FUNCTION public._cleanup_old_data_internal(jsonb)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='cleanup_old_data' AND pg_get_function_identity_arguments(p.oid)='jsonb'
    ) THEN
        EXECUTE 'DROP FUNCTION public.cleanup_old_data(jsonb)';
    END IF;
END$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_data(days_to_keep INTEGER DEFAULT 90)
RETURNS JSONB AS $$
DECLARE
    v_started_at TIMESTAMPTZ := NOW();
    v_cutoff_ts TIMESTAMPTZ := NOW() - (days_to_keep || ' days')::INTERVAL;
    v_cutoff_date DATE := CURRENT_DATE - (days_to_keep || ' days')::INTERVAL;
    del_activity BIGINT := 0;
    del_usage BIGINT := 0;
    del_anon_usage BIGINT := 0;
    del_anon_model_usage BIGINT := 0;
    del_anon_errors BIGINT := 0;
    del_token_costs BIGINT := 0;
    del_cta BIGINT := 0;
    del_sync BIGINT := 0;
BEGIN
    DELETE FROM public.user_activity_log WHERE timestamp < v_cutoff_ts;
    GET DIAGNOSTICS del_activity = ROW_COUNT;

    DELETE FROM public.user_usage_daily WHERE usage_date < v_cutoff_date;
    GET DIAGNOSTICS del_usage = ROW_COUNT;

    DELETE FROM public.anonymous_usage_daily WHERE usage_date < v_cutoff_date;
    GET DIAGNOSTICS del_anon_usage = ROW_COUNT;

    DELETE FROM public.anonymous_model_usage_daily WHERE usage_date < v_cutoff_date;
    GET DIAGNOSTICS del_anon_model_usage = ROW_COUNT;

    DELETE FROM public.anonymous_error_events WHERE event_timestamp < v_cutoff_ts;
    GET DIAGNOSTICS del_anon_errors = ROW_COUNT;

    DELETE FROM public.message_token_costs WHERE message_timestamp < v_cutoff_ts;
    GET DIAGNOSTICS del_token_costs = ROW_COUNT;

    DELETE FROM public.cta_events WHERE created_at < v_cutoff_ts;
    GET DIAGNOSTICS del_cta = ROW_COUNT;

    DELETE FROM public.model_sync_log WHERE COALESCE(sync_completed_at, sync_started_at) < v_cutoff_ts;
    GET DIAGNOSTICS del_sync = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'started_at', v_started_at,
        'completed_at', NOW(),
        'days_to_keep', days_to_keep,
        'cutoff_timestamp', v_cutoff_ts,
        'deleted_records', jsonb_build_object(
            'user_activity_log', del_activity,
            'user_usage_daily', del_usage,
            'anonymous_usage_daily', del_anon_usage,
            'anonymous_model_usage_daily', del_anon_model_usage,
            'anonymous_error_events', del_anon_errors,
            'message_token_costs', del_token_costs,
            'cta_events', del_cta,
            'model_sync_log', del_sync
        ),
        'schema_version', 'retention-simple-v1'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
