-- =============================================================================
-- FINAL SYSTEM SCHEMA
-- =============================================================================
-- This file contains the final structure for system-related tables,
-- functions, triggers, RLS policies, and views.

-- =============================================================================
-- (Removed) system_cache & system_stats tables were deprecated (Sept 2025) in favor of Redis and external analytics.

-- =============================================================================
-- INDEXES FOR OPTIMIZATION
-- =============================================================================

-- (Removed) related indexes for deprecated tables

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- (Removed) RLS policies for deprecated tables

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Simplified single-parameter cleanup covering all analytics tables.
-- NOTE: Manual admin call only. days_to_keep applies uniformly.
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

-- Function to analyze database health
CREATE OR REPLACE FUNCTION public.analyze_database_health()
RETURNS JSONB AS $$
DECLARE
    health_data JSONB;
    table_sizes JSONB;
    index_usage JSONB;
BEGIN
    -- Get table sizes
    SELECT jsonb_object_agg(
        schemaname || '.' || tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
    ) INTO table_sizes
    FROM pg_tables
    WHERE schemaname = 'public';

    -- Get basic health metrics
    health_data := jsonb_build_object(
        'timestamp', NOW(),
        'database_size', pg_size_pretty(pg_database_size(current_database())),
        'table_sizes', table_sizes,
        'total_users', (SELECT COUNT(*) FROM public.profiles),
        'total_conversations', (SELECT COUNT(*) FROM public.chat_sessions),
        'total_messages', (SELECT COUNT(*) FROM public.chat_messages),
        'active_users_last_7_days', (
            SELECT COUNT(DISTINCT user_id)
            FROM public.user_activity_log
            WHERE timestamp >= NOW() - INTERVAL '7 days'
        )
    );

    RETURN health_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- (Removed) api_user_summary view (dropped via patch remove-api-user-summary/001_drop_api_user_summary.sql on 2025-09-10; unused in application).

-- =============================================================================
-- ANALYTICS VIEWS (PHASE 4)
-- =============================================================================

-- Admin-only sync stats
CREATE OR REPLACE VIEW public.v_sync_stats AS
SELECT
    (SELECT id FROM public.model_sync_log WHERE sync_status='completed' ORDER BY sync_completed_at DESC NULLS LAST LIMIT 1) AS last_success_id,
    (SELECT sync_completed_at FROM public.model_sync_log WHERE sync_status='completed' ORDER BY sync_completed_at DESC NULLS LAST LIMIT 1) AS last_success_at,
    (
        SELECT CASE WHEN COUNT(*)=0 THEN 0::numeric ELSE ROUND(SUM(CASE WHEN sync_status='completed' THEN 1 ELSE 0 END)::numeric * 100 / COUNT(*), 2) END
        FROM public.model_sync_log
        WHERE sync_started_at >= NOW() - INTERVAL '30 days'
    ) AS success_rate_30d,
    (
        SELECT ROUND(AVG(duration_ms)::numeric, 2)
        FROM public.model_sync_log
        WHERE sync_status='completed'
            AND sync_started_at >= NOW() - INTERVAL '30 days'
    ) AS avg_duration_ms_30d,
    (
        SELECT COUNT(*) FROM public.model_sync_log WHERE sync_started_at >= NOW() - INTERVAL '24 hours'
    ) AS runs_24h,
    (
        SELECT COUNT(*) FROM public.model_sync_log WHERE sync_status='failed' AND sync_started_at >= NOW() - INTERVAL '24 hours'
    ) AS failures_24h;

-- Public model counts (safe aggregate)
CREATE OR REPLACE VIEW public.v_model_counts_public AS
SELECT
    COUNT(*) FILTER (WHERE status='new') AS new_count,
    COUNT(*) FILTER (WHERE status='active') AS active_count,
    COUNT(*) FILTER (WHERE status='inactive') AS inactive_count,
    COUNT(*) FILTER (WHERE status='disabled') AS disabled_count,
    COUNT(*) AS total_count
FROM public.model_access;

-- Harden: explicit invoker semantics and clear privileges
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_model_counts_public'
    ) THEN
        EXECUTE 'ALTER VIEW public.v_model_counts_public SET (security_invoker = true)';
    END IF;
END$$;

REVOKE ALL ON TABLE public.v_model_counts_public FROM PUBLIC;
GRANT SELECT ON TABLE public.v_model_counts_public TO anon;
GRANT SELECT ON TABLE public.v_model_counts_public TO authenticated;
GRANT SELECT ON TABLE public.v_model_counts_public TO service_role;

-- Admin-only daily model sync activity (last 30 days)
-- Hardened: explicit security_invoker, restricted SELECT, wrapper RPC with admin check.
CREATE OR REPLACE VIEW public.v_model_sync_activity_daily AS
SELECT
    DATE_TRUNC('day', COALESCE(sync_completed_at, sync_started_at)) AS day,
    SUM(models_added) AS models_added,
    SUM(models_marked_inactive) AS models_marked_inactive,
    SUM(models_reactivated) AS models_reactivated,
    COUNT(*) AS runs
FROM public.model_sync_log
WHERE sync_status = 'completed'
  AND COALESCE(sync_completed_at, sync_started_at) >= NOW() - INTERVAL '30 days'
GROUP BY 1; -- Ordering applied by caller

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_model_sync_activity_daily'
    ) THEN
        EXECUTE 'ALTER VIEW public.v_model_sync_activity_daily SET (security_invoker = true)';
    END IF;
END$$;

REVOKE ALL ON TABLE public.v_model_sync_activity_daily FROM PUBLIC;
GRANT SELECT ON TABLE public.v_model_sync_activity_daily TO service_role;
GRANT SELECT ON TABLE public.v_model_sync_activity_daily TO postgres;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public'
          AND p.proname='get_model_sync_activity_daily'
          AND pg_get_function_identity_arguments(p.oid) = 'p_days integer'
    ) THEN
        EXECUTE 'DROP FUNCTION public.get_model_sync_activity_daily(p_days integer)';
    END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_model_sync_activity_daily(p_days integer DEFAULT 30)
RETURNS TABLE(day date, models_added int, models_marked_inactive int, models_reactivated int) AS $$
DECLARE
    safe_days integer := LEAST(GREATEST(p_days,1),365);
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT v.day::date AS day,
           v.models_added::int,
           v.models_marked_inactive::int,
           v.models_reactivated::int
    FROM public.v_model_sync_activity_daily v
    WHERE v.day::date >= (CURRENT_DATE - (safe_days - 1))
    ORDER BY v.day::date DESC;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_model_sync_activity_daily(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_model_sync_activity_daily(integer) TO authenticated, service_role;

-- =============================================================================
-- ADMIN AUDIT LOG (PHASE 4)
-- =============================================================================

-- Audit table for admin/system actions
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action, created_at DESC);

-- Enable and enforce RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;

-- Admin-only read access
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_audit_log' AND policyname='Only admins can read audit logs'
    ) THEN
        EXECUTE 'DROP POLICY "Only admins can read audit logs" ON public.admin_audit_log';
    END IF;
    EXECUTE 'CREATE POLICY "Only admins can read audit logs" ON public.admin_audit_log FOR SELECT USING (public.is_admin(auth.uid()))';
END$$;

-- Deny direct INSERTs; use SECURITY DEFINER function
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_audit_log' AND policyname='Insert via definer only'
    ) THEN
        EXECUTE 'DROP POLICY "Insert via definer only" ON public.admin_audit_log';
    END IF;
    EXECUTE 'CREATE POLICY "Insert via definer only" ON public.admin_audit_log FOR INSERT WITH CHECK (false)';
END$$;

-- Helper to write audit log under definer role
CREATE OR REPLACE FUNCTION public.write_admin_audit(
    p_actor_user_id UUID,
    p_action TEXT,
    p_target TEXT,
    p_payload JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.admin_audit_log(actor_user_id, action, target, payload)
    VALUES (p_actor_user_id, p_action, p_target, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- CTA EVENTS ANALYTICS (MERGED FROM PATCH analytics-cta-events/001_create_cta_events.sql)
-- =============================================================================

-- Table to store CTA click events (anonymous or authenticated)
CREATE TABLE IF NOT EXISTS public.cta_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    page text NOT NULL,
    cta_id text NOT NULL,
    location text NULL,
    is_authenticated boolean NOT NULL DEFAULT false,
    user_id uuid NULL,
    ip_hash text NULL,
    meta jsonb NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cta_events_created_at ON public.cta_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cta_events_page_cta ON public.cta_events(page, cta_id);
CREATE INDEX IF NOT EXISTS idx_cta_events_user ON public.cta_events(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.cta_events ENABLE ROW LEVEL SECURITY;

-- Policies: admin can read, server roles can insert
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cta_events' AND policyname='Admin can read CTA events'
    ) THEN
        EXECUTE 'DROP POLICY "Admin can read CTA events" ON public.cta_events';
    END IF;
    EXECUTE 'CREATE POLICY "Admin can read CTA events" ON public.cta_events FOR SELECT USING (public.is_admin(auth.uid()))';

    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cta_events' AND policyname='Allow inserts from server roles'
    ) THEN
        EXECUTE 'DROP POLICY "Allow inserts from server roles" ON public.cta_events';
    END IF;
    EXECUTE 'CREATE POLICY "Allow inserts from server roles" ON public.cta_events FOR INSERT WITH CHECK (auth.role() = ''service_role'' OR auth.role() = ''authenticated'')';
END$$;

-- Retention helper
CREATE OR REPLACE FUNCTION public.cleanup_cta_events(days_to_keep integer DEFAULT 90)
RETURNS int AS $$
DECLARE
    cutoff timestamptz := now() - make_interval(days => days_to_keep);
    deleted_count int;
BEGIN
    DELETE FROM public.cta_events WHERE created_at < cutoff;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for safe ingestion from web tier
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'ingest_cta_event'
    ) THEN
        EXECUTE 'DROP FUNCTION public.ingest_cta_event(text, text, text, boolean, uuid, text, jsonb)';
    END IF;
END$$;

CREATE OR REPLACE FUNCTION public.ingest_cta_event(
    p_page text,
    p_cta_id text,
    p_location text DEFAULT NULL,
    p_is_authenticated boolean DEFAULT false,
    p_user_id uuid DEFAULT NULL,
    p_ip_hash text DEFAULT NULL,
    p_meta jsonb DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO public.cta_events(page, cta_id, location, is_authenticated, user_id, ip_hash, meta)
    VALUES (p_page, p_cta_id, p_location, p_is_authenticated, p_user_id, p_ip_hash, p_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.ingest_cta_event(text, text, text, boolean, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_cta_event(text, text, text, boolean, uuid, text, jsonb) TO anon, authenticated;
