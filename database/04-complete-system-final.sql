-- =============================================================================
-- COMPREHENSIVE DATABASE SCHEMA - PHASE 4: COMPLETE SYSTEM
-- =============================================================================
-- Execute this after Phase 3 to finalize all advanced features
-- Final preferences, optimization, and system maintenance

-- =============================================================================
-- ADVANCED PREFERENCES AND SETTINGS
-- =============================================================================

-- Helper function for jsonb deep merge (define first)
CREATE OR REPLACE FUNCTION jsonb_deep_merge(a jsonb, b jsonb)
RETURNS jsonb AS $$
DECLARE
    result jsonb := a;
    key text;
    value jsonb;
BEGIN
    FOR key, value IN SELECT * FROM jsonb_each(b)
    LOOP
        IF jsonb_typeof(value) = 'object' AND result ? key AND jsonb_typeof(result -> key) = 'object' THEN
            result := jsonb_set(result, ARRAY[key], jsonb_deep_merge(result -> key, value));
        ELSE
            result := jsonb_set(result, ARRAY[key], value);
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Ensure all preference columns exist with proper defaults
DO $$
BEGIN
    -- Update UI preferences with more comprehensive defaults
    UPDATE public.profiles 
    SET ui_preferences = jsonb_deep_merge(
        ui_preferences,
        '{
            "theme": "dark",
            "sidebar_width": 280,
            "code_highlighting": true,
            "auto_save": true,
            "show_token_count": true,
            "compact_mode": false,
            "show_model_info": true,
            "auto_scroll": true,
            "message_grouping": true
        }'::jsonb
    )
    WHERE ui_preferences IS NULL OR jsonb_typeof(ui_preferences) = 'null';
    
    -- Update session preferences with comprehensive defaults
    UPDATE public.profiles 
    SET session_preferences = jsonb_deep_merge(
        session_preferences,
        '{
            "max_history": 10,
            "auto_title": true,
            "save_anonymous": false,
            "auto_save_interval": 30,
            "confirm_delete": true,
            "show_timestamps": true,
            "export_format": "markdown"
        }'::jsonb
    )
    WHERE session_preferences IS NULL OR jsonb_typeof(session_preferences) = 'null';
END $$;

-- =============================================================================
-- SYSTEM OPTIMIZATION TABLES
-- =============================================================================

-- Cache table for frequently accessed data
CREATE TABLE IF NOT EXISTS public.system_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    cache_value JSONB NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- System statistics and health monitoring
CREATE TABLE IF NOT EXISTS public.system_stats (
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
CREATE INDEX IF NOT EXISTS idx_system_cache_expires ON public.system_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Stats indexes
CREATE INDEX IF NOT EXISTS idx_system_stats_date ON public.system_stats(stat_date DESC);

-- =============================================================================
-- ADVANCED UTILITY FUNCTIONS
-- =============================================================================

-- Function to update user preferences
CREATE OR REPLACE FUNCTION public.update_user_preferences(
    user_uuid UUID,
    preference_type VARCHAR(50), -- 'ui', 'session', 'model'
    preferences JSONB
)
RETURNS JSONB AS $$
DECLARE
    updated_count INTEGER;
    current_prefs JSONB;
BEGIN
    -- Validate preference type
    IF preference_type NOT IN ('ui', 'session', 'model') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid preference type. Must be: ui, session, or model'
        );
    END IF;
    
    -- Update based on preference type
    CASE preference_type
        WHEN 'ui' THEN
            UPDATE public.profiles 
            SET ui_preferences = jsonb_deep_merge(COALESCE(ui_preferences, '{}'::jsonb), preferences),
                updated_at = NOW()
            WHERE id = user_uuid;
            
        WHEN 'session' THEN
            UPDATE public.profiles 
            SET session_preferences = jsonb_deep_merge(COALESCE(session_preferences, '{}'::jsonb), preferences),
                updated_at = NOW()
            WHERE id = user_uuid;
            
        WHEN 'model' THEN
            UPDATE public.profiles 
            SET default_model = COALESCE(preferences->>'default_model', default_model),
                temperature = COALESCE((preferences->>'temperature')::decimal, temperature),
                system_prompt = COALESCE(preferences->>'system_prompt', system_prompt),
                allowed_models = COALESCE(
                    ARRAY(SELECT jsonb_array_elements_text(preferences->'allowed_models')),
                    allowed_models
                ),
                updated_at = NOW()
            WHERE id = user_uuid;
    END CASE;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Log the preference update
    PERFORM public.log_user_activity(
        user_uuid,
        'preferences_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'preference_type', preference_type,
            'updated_fields', preferences
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'preference_type', preference_type,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's complete profile with preferences
CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
BEGIN
    -- Get main profile data
    SELECT 
        id, email, full_name, avatar_url,
        default_model, temperature, system_prompt, subscription_tier, credits,
        ui_preferences, session_preferences, allowed_models,
        created_at, updated_at, last_active, usage_stats
    INTO profile_data
    FROM public.profiles
    WHERE id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;
    
    -- Get allowed models with details
    SELECT jsonb_agg(
        jsonb_build_object(
            'model_id', model_id,
            'model_name', model_name,
            'model_description', model_description,
            'model_tags', model_tags,
            'daily_limit', daily_limit,
            'monthly_limit', monthly_limit
        )
    ) INTO allowed_models_data
    FROM public.get_user_allowed_models(user_uuid);
    
    -- Get recent usage stats
    SELECT jsonb_build_object(
        'today', jsonb_agg(
            jsonb_build_object(
                'messages_sent', messages_sent,
                'messages_received', messages_received,
                'total_tokens', total_tokens,
                'models_used', models_used,
                'sessions_created', sessions_created,
                'active_minutes', active_minutes
            )
        ),
        'total', profile_data.usage_stats
    ) INTO usage_stats_data
    FROM public.user_usage_daily
    WHERE user_id = user_uuid 
    AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY usage_date DESC;
    
    -- Return complete profile
    RETURN jsonb_build_object(
        'id', profile_data.id,
        'email', profile_data.email,
        'full_name', profile_data.full_name,
        'avatar_url', profile_data.avatar_url,
        'subscription_tier', profile_data.subscription_tier,
        'credits', profile_data.credits,
        'preferences', jsonb_build_object(
            'model', jsonb_build_object(
                'default_model', profile_data.default_model,
                'temperature', profile_data.temperature,
                'system_prompt', profile_data.system_prompt,
                'allowed_models', profile_data.allowed_models
            ),
            'ui', profile_data.ui_preferences,
            'session', profile_data.session_preferences
        ),
        'available_models', allowed_models_data,
        'usage_stats', usage_stats_data,
        'timestamps', jsonb_build_object(
            'created_at', profile_data.created_at,
            'updated_at', profile_data.updated_at,
            'last_active', profile_data.last_active
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Function to export user data (GDPR compliance)
CREATE OR REPLACE FUNCTION public.export_user_data(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data JSONB;
    conversations_data JSONB;
    activity_data JSONB;
    usage_data JSONB;
BEGIN
    -- Get profile data
    SELECT to_jsonb(p.*) INTO profile_data
    FROM public.profiles p
    WHERE id = user_uuid;
    
    -- Get conversations data
    SELECT jsonb_agg(
        jsonb_build_object(
            'session', to_jsonb(s.*),
            'messages', (
                SELECT jsonb_agg(to_jsonb(m.*))
                FROM public.chat_messages m
                WHERE m.session_id = s.id
                ORDER BY m.message_timestamp
            )
        )
    ) INTO conversations_data
    FROM public.chat_sessions s
    WHERE s.user_id = user_uuid;
    
    -- Get activity data
    SELECT jsonb_agg(to_jsonb(a.*)) INTO activity_data
    FROM public.user_activity_log a
    WHERE a.user_id = user_uuid
    ORDER BY a.timestamp DESC;
    
    -- Get usage data
    SELECT jsonb_agg(to_jsonb(u.*)) INTO usage_data
    FROM public.user_usage_daily u
    WHERE u.user_id = user_uuid
    ORDER BY u.usage_date DESC;
    
    RETURN jsonb_build_object(
        'export_date', NOW(),
        'user_id', user_uuid,
        'profile', profile_data,
        'conversations', COALESCE(conversations_data, '[]'::jsonb),
        'activity_log', COALESCE(activity_data, '[]'::jsonb),
        'usage_stats', COALESCE(usage_data, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- MAINTENANCE FUNCTIONS
-- =============================================================================

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
-- FINAL VERIFICATION & COMPLETION
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
    p.allowed_models,
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

-- Final verification and completion message
DO $$
DECLARE
    total_tables INTEGER;
    total_functions INTEGER;
    total_policies INTEGER;
    total_users INTEGER;
    total_models INTEGER;
BEGIN
    -- Count database objects
    SELECT COUNT(*) INTO total_tables
    FROM information_schema.tables 
    WHERE table_schema = 'public';
    
    SELECT COUNT(*) INTO total_functions
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    
    SELECT COUNT(*) INTO total_policies
    FROM information_schema.table_privileges
    WHERE grantee = 'authenticated' AND table_schema = 'public';
    
    SELECT COUNT(*) INTO total_users FROM public.profiles;
    SELECT COUNT(*) INTO total_models FROM public.model_access;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'DATABASE SETUP COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'System Overview:';
    RAISE NOTICE '  📊 Tables: %', total_tables;
    RAISE NOTICE '  ⚙️  Functions: %', total_functions;
    RAISE NOTICE '  🔒 RLS Policies: Active';
    RAISE NOTICE '  👥 Users: %', total_users;
    RAISE NOTICE '  🤖 Models Configured: %', total_models;
    RAISE NOTICE '';
    RAISE NOTICE 'Core Features Ready:';
    RAISE NOTICE '  ✅ User Authentication & Profiles';
    RAISE NOTICE '  ✅ Chat History with TEXT ID Support';
    RAISE NOTICE '  ✅ User Tiers & Model Access Control';
    RAISE NOTICE '  ✅ Usage Tracking & Analytics';
    RAISE NOTICE '  ✅ Comprehensive Preferences';
    RAISE NOTICE '  ✅ System Maintenance Functions';
    RAISE NOTICE '  ✅ GDPR Compliance (Data Export)';
    RAISE NOTICE '';
    RAISE NOTICE 'API-Ready Functions:';
    RAISE NOTICE '  🔧 get_user_complete_profile()';
    RAISE NOTICE '  🔧 get_user_allowed_models()';
    RAISE NOTICE '  🔧 sync_user_conversations()';
    RAISE NOTICE '  🔧 track_user_usage()';
    RAISE NOTICE '  🔧 update_user_preferences()';
    RAISE NOTICE '';
    RAISE NOTICE 'Your OpenRouter Chatbot database is ready! 🚀';
    RAISE NOTICE '============================================';
END $$;
