-- Fix get_user_complete_profile to include personality_preset
-- Issue: Database function was not returning personality_preset in model preferences
-- Result: Frontend could not display saved personality preset value after save
-- Date: October 3, 2025

CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
    today_usage_data JSONB;
BEGIN
    -- Get main profile data (including personality_preset)
    SELECT
    id, email, full_name, avatar_url,
    default_model, temperature, system_prompt, personality_preset,
    subscription_tier, account_type, credits,
    is_banned, banned_at, banned_until, ban_reason, violation_strikes,
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

    -- Get today's usage data specifically
    SELECT jsonb_build_object(
        'messages_sent', COALESCE(messages_sent, 0),
        'messages_received', COALESCE(messages_received, 0),
        'total_tokens', COALESCE(total_tokens, 0),
        'input_tokens', COALESCE(input_tokens, 0),
        'output_tokens', COALESCE(output_tokens, 0),
        'models_used', COALESCE(models_used, '{}'::jsonb),
    'sessions_created', COALESCE(sessions_created, 0),
    'generation_ms', COALESCE(generation_ms, 0)
    ) INTO today_usage_data
    FROM public.user_usage_daily
    WHERE user_id = user_uuid
    AND usage_date = CURRENT_DATE;

    -- If no data for today, return zeros
    IF today_usage_data IS NULL THEN
        today_usage_data := jsonb_build_object(
            'messages_sent', 0,
            'messages_received', 0,
            'total_tokens', 0,
            'input_tokens', 0,
            'output_tokens', 0,
            'models_used', '{}'::jsonb,
            'sessions_created', 0,
            'generation_ms', 0
        );
    END IF;

    -- Get recent usage stats (last 7 days for backwards compatibility)
    SELECT jsonb_build_object(
        'recent_days', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'usage_date', usage_date,
                    'messages_sent', messages_sent,
                    'messages_received', messages_received,
                    'total_tokens', total_tokens,
                    'models_used', models_used,
                    'sessions_created', sessions_created,
                    'generation_ms', generation_ms
                ) ORDER BY usage_date DESC
            )
            FROM public.user_usage_daily
            WHERE user_id = user_uuid
            AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        'today', today_usage_data,
        'all_time', profile_data.usage_stats
    ) INTO usage_stats_data;

    -- Return complete profile with enhanced analytics (including personality_preset)
    RETURN jsonb_build_object(
        'id', profile_data.id,
        'email', profile_data.email,
        'full_name', profile_data.full_name,
        'avatar_url', profile_data.avatar_url,
    'subscription_tier', profile_data.subscription_tier,
    'account_type', profile_data.account_type,
    'credits', profile_data.credits,
    'is_banned', profile_data.is_banned,
    'banned_at', profile_data.banned_at,
    'banned_until', profile_data.banned_until,
    'ban_reason', profile_data.ban_reason,
    'violation_strikes', profile_data.violation_strikes,
        'preferences', jsonb_build_object(
            'model', jsonb_build_object(
                'default_model', profile_data.default_model,
                'temperature', profile_data.temperature,
                'system_prompt', profile_data.system_prompt,
                'personality_preset', profile_data.personality_preset
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog, public';

-- Add comment to document the change
COMMENT ON FUNCTION public.get_user_complete_profile(user_uuid UUID) IS 
'Returns complete user profile including preferences, usage stats, and available models. Updated Oct 2025 to include personality_preset in model preferences.';
