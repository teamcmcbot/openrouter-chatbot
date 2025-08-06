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
