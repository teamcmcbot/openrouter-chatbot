-- =============================================================================
-- FINAL SYSTEM SCHEMA
-- =============================================================================
-- This file contains the final structure for system-related tables,
-- functions, triggers, RLS policies, and views.

-- =============================================================================
-- SYSTEM OPTIMIZATION TABLES
-- =============================================================================

-- Cache table for frequently accessed data
CREATE TABLE public.system_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    cache_value JSONB NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- System statistics and health monitoring
CREATE TABLE public.system_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stat_date DATE NOT NULL,

    -- User statistics
    total_users INTEGER DEFAULT 0,
    active_users_today INTEGER DEFAULT 0,
    new_users_today INTEGER DEFAULT 0,

    -- Usage statistics
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    -- Performance metrics
    avg_response_time DECIMAL(10,3) DEFAULT 0,
    error_rate DECIMAL(5,4) DEFAULT 0,

    -- Storage statistics
    database_size_mb DECIMAL(15,2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(stat_date)
);

-- =============================================================================
-- INDEXES FOR OPTIMIZATION
-- =============================================================================

-- Cache indexes
CREATE INDEX idx_system_cache_expires ON public.system_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Stats indexes
CREATE INDEX idx_system_stats_date ON public.system_stats(stat_date DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE public.system_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_stats ENABLE ROW LEVEL SECURITY;

-- System cache policies (admin only for write, all for read if applicable)
CREATE POLICY "All authenticated users can view system cache" ON public.system_cache
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Only admins can modify system cache" ON public.system_cache
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND subscription_tier = 'admin'
        )
    );

-- System stats policies (all authenticated users can view, admins can write)
CREATE POLICY "All authenticated users can view system stats" ON public.system_stats
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Only admins can modify system stats" ON public.system_stats
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND subscription_tier = 'admin'
        )
    );

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to clean up old data
CREATE OR REPLACE FUNCTION public.cleanup_old_data(
    days_to_keep INTEGER DEFAULT 90
)
RETURNS JSONB AS $$
DECLARE
    cleanup_date TIMESTAMPTZ;
    deleted_activity INTEGER;
    deleted_usage INTEGER;
    deleted_cache INTEGER;
BEGIN
    cleanup_date := NOW() - (days_to_keep || ' days')::INTERVAL;

    -- Clean up old activity logs (keep last N days)
    DELETE FROM public.user_activity_log
    WHERE timestamp < cleanup_date;
    GET DIAGNOSTICS deleted_activity = ROW_COUNT;

    -- Clean up old usage data (keep last N days)
    DELETE FROM public.user_usage_daily
    WHERE usage_date < CURRENT_DATE - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_usage = ROW_COUNT;

    -- Clean up expired cache entries
    DELETE FROM public.system_cache
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    GET DIAGNOSTICS deleted_cache = ROW_COUNT;

    -- Update system stats
    INSERT INTO public.system_stats (
        stat_date,
        total_users,
        total_conversations,
        total_messages
    )
    SELECT
        CURRENT_DATE,
        (SELECT COUNT(*) FROM public.profiles),
        (SELECT COUNT(*) FROM public.chat_sessions),
        (SELECT COUNT(*) FROM public.chat_messages)
    ON CONFLICT (stat_date) DO UPDATE SET
        total_users = EXCLUDED.total_users,
        total_conversations = EXCLUDED.total_conversations,
        total_messages = EXCLUDED.total_messages;

    RETURN jsonb_build_object(
        'success', true,
        'cleanup_date', cleanup_date,
        'deleted_records', jsonb_build_object(
            'activity_logs', deleted_activity,
            'usage_records', deleted_usage,
            'cache_entries', deleted_cache
        ),
        'cleanup_completed_at', NOW()
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

-- Create a comprehensive view for API usage
CREATE OR REPLACE VIEW public.api_user_summary AS
SELECT
    p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    p.subscription_tier,
    p.credits,
    p.default_model,
    p.temperature,
    p.system_prompt,
    p.ui_preferences,
    p.session_preferences,
    p.last_active,
    COALESCE(recent_usage.messages_today, 0) as messages_today,
    COALESCE(recent_usage.tokens_today, 0) as tokens_today,
    COALESCE(session_count.total_sessions, 0) as total_sessions
FROM public.profiles p
LEFT JOIN (
    SELECT
        user_id,
        SUM(messages_sent + messages_received) as messages_today,
        SUM(total_tokens) as tokens_today
    FROM public.user_usage_daily
    WHERE usage_date = CURRENT_DATE
    GROUP BY user_id
) recent_usage ON p.id = recent_usage.user_id
LEFT JOIN (
    SELECT
        user_id,
        COUNT(*) as total_sessions
    FROM public.chat_sessions
    GROUP BY user_id
) session_count ON p.id = session_count.user_id;

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

-- Admin-only daily model sync activity (last 30 days)
-- Supersedes v_model_recent_activity_admin
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
GROUP BY 1
ORDER BY day DESC;

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
