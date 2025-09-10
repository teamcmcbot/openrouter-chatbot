-- Patch: Remove unused system tables (system_cache, system_stats) and adjust dependent functions
-- Date: 2025-09-10
-- Rationale: Tables are empty, caching handled via Redis, stats aggregation unused.

BEGIN;

-- Safety: only proceed if both tables exist (prevents partial state in fresh clones)
DO $$
BEGIN
    IF to_regclass('public.system_cache') IS NOT NULL THEN
        EXECUTE 'DROP TABLE public.system_cache CASCADE';
    END IF;
    IF to_regclass('public.system_stats') IS NOT NULL THEN
        EXECUTE 'DROP TABLE public.system_stats CASCADE';
    END IF;
END$$;

-- Recreate cleanup_old_data without references to removed tables
CREATE OR REPLACE FUNCTION public.cleanup_old_data(days_to_keep INTEGER DEFAULT 90)
RETURNS JSONB AS $$
DECLARE
    cleanup_date TIMESTAMPTZ;
    deleted_activity INTEGER := 0;
    deleted_usage INTEGER := 0;
    deleted_cache INTEGER := 0; -- retained for backward-compatible JSON shape
BEGIN
    cleanup_date := NOW() - (days_to_keep || ' days')::INTERVAL;

    DELETE FROM public.user_activity_log WHERE timestamp < cleanup_date;
    GET DIAGNOSTICS deleted_activity = ROW_COUNT;

    DELETE FROM public.user_usage_daily
    WHERE usage_date < CURRENT_DATE - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_usage = ROW_COUNT;

    -- system_cache removed; keep field in response for compatibility (always 0)

    RETURN jsonb_build_object(
        'success', true,
        'cleanup_date', cleanup_date,
        'deleted_records', jsonb_build_object(
            'activity_logs', deleted_activity,
            'usage_records', deleted_usage,
            'cache_entries', deleted_cache
        ),
        'cleanup_completed_at', NOW(),
        'schema_version', 'system-table-removal-001'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Rollback guidance:
-- To restore, re-run original table CREATE statements from 04-system.sql and prior cleanup_old_data definition.