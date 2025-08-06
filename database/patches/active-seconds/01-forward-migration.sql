-- =============================================================================
-- MIGRATION: Rename active_minutes to active_seconds
-- =============================================================================
-- This migration renames the active_minutes column to active_seconds to 
-- accurately reflect that the values are stored in seconds, not minutes.
--
-- IMPORTANT: This migration preserves all existing data
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 1: Drop dependent functions to allow column rename
-- =============================================================================

-- Drop functions that reference the active_minutes column
DROP FUNCTION IF EXISTS public.track_user_usage(UUID, INTEGER, INTEGER, INTEGER, INTEGER, VARCHAR(100), BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS public.get_user_complete_profile(UUID);

-- =============================================================================
-- PHASE 2: Rename the column
-- =============================================================================

-- Rename the column in user_usage_daily table
ALTER TABLE public.user_usage_daily 
RENAME COLUMN active_minutes TO active_seconds;

-- =============================================================================
-- PHASE 3: Recreate functions with updated column references
-- =============================================================================

-- Recreate track_user_usage function with updated parameter name and logic
CREATE OR REPLACE FUNCTION public.track_user_usage(
    p_user_id UUID,
    p_messages_sent INTEGER DEFAULT 0,
    p_messages_received INTEGER DEFAULT 0,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_session_created BOOLEAN DEFAULT false,
    p_active_seconds INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
    today_date DATE := CURRENT_DATE;
    model_usage JSONB;
BEGIN
    -- Get current model usage for today
    SELECT models_used INTO model_usage
    FROM public.user_usage_daily
    WHERE user_id = p_user_id AND usage_date = today_date;

    -- Update model usage if a model was used
    IF p_model_used IS NOT NULL THEN
        IF model_usage IS NULL THEN
            model_usage := jsonb_build_object(p_model_used, 1);
        ELSE
            model_usage := jsonb_set(
                model_usage,
                ARRAY[p_model_used],
                (COALESCE((model_usage->>p_model_used)::integer, 0) + 1)::text::jsonb
            );
        END IF;
    END IF;

    -- Insert or update daily usage
    INSERT INTO public.user_usage_daily (
        user_id, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, total_tokens, models_used,
        sessions_created, active_seconds
    ) VALUES (
        p_user_id, today_date, p_messages_sent, p_messages_received,
        p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
        COALESCE(model_usage, '{}'::jsonb),
        CASE WHEN p_session_created THEN 1 ELSE 0 END,
        p_active_seconds
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        messages_sent = user_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = user_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = user_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = user_usage_daily.output_tokens + EXCLUDED.output_tokens,
        total_tokens = user_usage_daily.total_tokens + EXCLUDED.total_tokens,
        models_used = COALESCE(EXCLUDED.models_used, user_usage_daily.models_used),
        sessions_created = user_usage_daily.sessions_created + EXCLUDED.sessions_created,
        active_seconds = user_usage_daily.active_seconds + EXCLUDED.active_seconds,
        updated_at = NOW();

    -- Update profile usage stats
    UPDATE public.profiles SET
        usage_stats = jsonb_set(
            jsonb_set(
                jsonb_set(
                    usage_stats,
                    '{total_messages}',
                    ((COALESCE((usage_stats->>'total_messages')::integer, 0) + p_messages_sent + p_messages_received))::text::jsonb
                ),
                '{total_tokens}',
                ((COALESCE((usage_stats->>'total_tokens')::integer, 0) + p_input_tokens + p_output_tokens))::text::jsonb
            ),
            '{sessions_created}',
            ((COALESCE((usage_stats->>'sessions_created')::integer, 0) + CASE WHEN p_session_created THEN 1 ELSE 0 END))::text::jsonb
        ),
        last_active = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate get_user_complete_profile function with updated field name
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
        ui_preferences, session_preferences,
        created_at, updated_at, last_active, usage_stats
    INTO profile_data
    FROM public.profiles
    WHERE id = user_uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Get allowed models with details (from model_access table)
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

    -- Get recent usage stats with updated field name
    SELECT jsonb_build_object(
        'today', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'messages_sent', messages_sent,
                    'messages_received', messages_received,
                    'total_tokens', total_tokens,
                    'models_used', models_used,
                    'sessions_created', sessions_created,
                    'active_seconds', active_seconds
                ) ORDER BY usage_date DESC
            )
            FROM public.user_usage_daily
            WHERE user_id = user_uuid
            AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        'total', profile_data.usage_stats
    ) INTO usage_stats_data;

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
                'system_prompt', profile_data.system_prompt
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

-- =============================================================================
-- PHASE 4: Update trigger function comments for clarity
-- =============================================================================

-- Update the session stats trigger function comment
COMMENT ON FUNCTION public.update_session_stats() IS 
'Updates session statistics when messages are added/updated/deleted. 
Note: elapsed_time is passed as active_seconds (duration in seconds) to track_user_usage.';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify the column was renamed successfully
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_usage_daily' 
        AND column_name = 'active_seconds'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'Column rename failed: active_seconds column not found';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_usage_daily' 
        AND column_name = 'active_minutes'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'Column rename failed: active_minutes column still exists';
    END IF;
    
    RAISE NOTICE 'SUCCESS: Column renamed from active_minutes to active_seconds';
END $$;

-- Verify functions were recreated successfully
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'track_user_usage'
    ) THEN
        RAISE EXCEPTION 'Function recreation failed: track_user_usage not found';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'get_user_complete_profile'
    ) THEN
        RAISE EXCEPTION 'Function recreation failed: get_user_complete_profile not found';
    END IF;
    
    RAISE NOTICE 'SUCCESS: Functions recreated successfully';
END $$;

COMMIT;

-- =============================================================================
-- POST-MIGRATION NOTES
-- =============================================================================

-- The following files need manual updates:
-- 1. database/samples/get_user_complete_profile.json
--    - Change "active_minutes" to "active_seconds" in sample data
-- 
-- 2. docs/database/DB_StepThrough.md
--    - Update documentation to reference "active_seconds"
--
-- 3. Update main schema files after testing:
--    - database/schema/01-users.sql
--    - database/schema/02-chat.sql
--
-- 4. Consider updating API documentation to reflect field name change
