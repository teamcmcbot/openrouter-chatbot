-- ============================================================================
-- Patch: 001-elapsed-time-ms-migration.sql
-- Purpose: Migrate response timing from seconds to milliseconds.
-- Changes:
--   * chat_messages: drop elapsed_time, add elapsed_ms
--   * user_usage_daily: drop active_minutes, add generation_ms
--   * message_token_costs: add elapsed_ms (for future TPS metrics)
--   * Functions updated: track_user_usage, update_session_stats,
--                        track_session_creation, get_user_complete_profile
--   * Add analytics view: user_usage_daily_metrics
--   * Reset profiles.usage_stats counters (dev-only) for specified user IDs
-- Assumptions: Prior data in chat/session/usage/cost tables already wiped.
-- BREAKING: Removes active_minutes & elapsed_time with no compatibility layer.
-- ============================================================================

BEGIN;

-- 1. Schema alterations ------------------------------------------------------

-- chat_messages: replace elapsed_time -> elapsed_ms
ALTER TABLE public.chat_messages
    DROP COLUMN IF EXISTS elapsed_time;
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER DEFAULT 0;

-- user_usage_daily: replace active_minutes -> generation_ms
ALTER TABLE public.user_usage_daily
    DROP COLUMN IF EXISTS active_minutes;
ALTER TABLE public.user_usage_daily
    ADD COLUMN IF NOT EXISTS generation_ms BIGINT DEFAULT 0;

-- message_token_costs: add elapsed_ms (per assistant message latency snapshot)
ALTER TABLE public.message_token_costs
    ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER DEFAULT 0; -- 0 = unknown/legacy

COMMENT ON COLUMN public.message_token_costs.elapsed_ms IS 'Assistant message generation latency in milliseconds (total wall-clock).';
COMMENT ON COLUMN public.user_usage_daily.generation_ms IS 'Aggregated assistant generation time in milliseconds for the day.';
COMMENT ON COLUMN public.chat_messages.elapsed_ms IS 'Per-message assistant generation latency in milliseconds.';

-- 2. Function replacements ---------------------------------------------------

-- Drop dependent triggers first (they will be recreated automatically because names unchanged)
DROP TRIGGER IF EXISTS on_message_change ON public.chat_messages;
DROP TRIGGER IF EXISTS on_session_created ON public.chat_sessions;

-- Drop old functions (order matters due to dependencies)
DROP FUNCTION IF EXISTS public.track_user_usage(UUID, INTEGER, INTEGER, INTEGER, INTEGER, VARCHAR, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS public.update_session_stats();
DROP FUNCTION IF EXISTS public.track_session_creation();
DROP FUNCTION IF EXISTS public.get_user_complete_profile(UUID); -- will recreate

-- Recreate track_user_usage with generation_ms -------------------------------
CREATE OR REPLACE FUNCTION public.track_user_usage(
    p_user_id UUID,
    p_messages_sent INTEGER DEFAULT 0,
    p_messages_received INTEGER DEFAULT 0,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_session_created BOOLEAN DEFAULT false,
    p_generation_ms BIGINT DEFAULT 0
) RETURNS VOID AS $$
DECLARE
    today_date DATE := CURRENT_DATE;
    model_usage JSONB;
BEGIN
    SELECT models_used INTO model_usage
    FROM public.user_usage_daily
    WHERE user_id = p_user_id AND usage_date = today_date;

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

    INSERT INTO public.user_usage_daily (
        user_id, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, total_tokens, models_used,
        sessions_created, generation_ms
    ) VALUES (
        p_user_id, today_date, p_messages_sent, p_messages_received,
        p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
        COALESCE(model_usage, '{}'::jsonb),
        CASE WHEN p_session_created THEN 1 ELSE 0 END,
        p_generation_ms
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        messages_sent = public.user_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = public.user_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = public.user_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = public.user_usage_daily.output_tokens + EXCLUDED.output_tokens,
        total_tokens = public.user_usage_daily.total_tokens + EXCLUDED.total_tokens,
        models_used = COALESCE(EXCLUDED.models_used, public.user_usage_daily.models_used),
        sessions_created = public.user_usage_daily.sessions_created + EXCLUDED.sessions_created,
        generation_ms = public.user_usage_daily.generation_ms + EXCLUDED.generation_ms,
        updated_at = NOW();

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

-- Recreate update_session_stats using elapsed_ms ------------------------------
CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_stats RECORD;
    total_input_tokens INTEGER := 0;
    total_output_tokens INTEGER := 0;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = OLD.session_id
          AND (error_message IS NULL OR error_message = '');

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        UPDATE public.chat_sessions SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = OLD.session_id;
    ELSE
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = NEW.session_id
          AND (error_message IS NULL OR error_message = '');

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        UPDATE public.chat_sessions SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = NEW.session_id;

        IF NEW.role IN ('user', 'assistant') AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END,
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END,
                CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.input_tokens, 0) ELSE 0 END,
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.output_tokens, 0) ELSE 0 END,
                NEW.model,
                false,
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_ms, 0) ELSE 0 END
            );
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate track_session_creation --------------------------------------------
CREATE OR REPLACE FUNCTION public.track_session_creation()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.track_user_usage(
        NEW.user_id,
        0, 0, 0, 0,
        NULL,
        true,
        0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate get_user_complete_profile (no legacy active_minutes) --------------
CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
    today_usage_data JSONB;
BEGIN
    SELECT id, email, full_name, avatar_url,
           default_model, temperature, system_prompt, subscription_tier, credits,
           ui_preferences, session_preferences,
           created_at, updated_at, last_active, usage_stats
    INTO profile_data
    FROM public.profiles
    WHERE id = user_uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error','User not found');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'model_id', model_id,
        'model_name', model_name,
        'model_description', model_description,
        'model_tags', model_tags,
        'daily_limit', daily_limit,
        'monthly_limit', monthly_limit
    )) INTO allowed_models_data
    FROM public.get_user_allowed_models(user_uuid);

    SELECT jsonb_build_object(
        'messages_sent', COALESCE(messages_sent,0),
        'messages_received', COALESCE(messages_received,0),
        'total_tokens', COALESCE(total_tokens,0),
        'input_tokens', COALESCE(input_tokens,0),
        'output_tokens', COALESCE(output_tokens,0),
        'models_used', COALESCE(models_used,'{}'::jsonb),
        'sessions_created', COALESCE(sessions_created,0),
        'generation_ms', COALESCE(generation_ms,0)
    ) INTO today_usage_data
    FROM public.user_usage_daily
    WHERE user_id = user_uuid AND usage_date = CURRENT_DATE;

    IF today_usage_data IS NULL THEN
        today_usage_data := jsonb_build_object(
            'messages_sent',0,'messages_received',0,'total_tokens',0,
            'input_tokens',0,'output_tokens',0,'models_used','{}'::jsonb,
            'sessions_created',0,'generation_ms',0
        );
    END IF;

    SELECT jsonb_build_object(
        'recent_days', (
            SELECT jsonb_agg(jsonb_build_object(
                'usage_date', usage_date,
                'messages_sent', messages_sent,
                'messages_received', messages_received,
                'total_tokens', total_tokens,
                'models_used', models_used,
                'sessions_created', sessions_created,
                'generation_ms', generation_ms
            ) ORDER BY usage_date DESC)
            FROM public.user_usage_daily
            WHERE user_id = user_uuid AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        'today', today_usage_data,
        'all_time', profile_data.usage_stats
    ) INTO usage_stats_data;

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

-- 3. Recreate triggers -------------------------------------------------------
CREATE TRIGGER on_message_change
    AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();

CREATE TRIGGER on_session_created
    AFTER INSERT ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.track_session_creation();

-- 4. Analytics helper view ---------------------------------------------------
CREATE OR REPLACE VIEW public.user_usage_daily_metrics AS
SELECT
    user_id,
    usage_date,
    generation_ms,
    ROUND(generation_ms / 1000.0, 3) AS generation_seconds,
    ROUND(generation_ms / 60000.0, 3) AS generation_minutes,
    messages_sent,
    messages_received,
    total_tokens,
    input_tokens,
    output_tokens,
    sessions_created,
    models_used,
    estimated_cost,
    updated_at
FROM public.user_usage_daily;

-- 5. Reset profiles usage_stats for specific users --------------------------
-- (Keeps last_reset timestamp values exactly as provided.)
UPDATE public.profiles SET usage_stats = '{"last_reset":"2025-07-17 08:23:07.148825+00","total_tokens":0,"total_messages":0,"sessions_created":0}'::jsonb
WHERE id = 'f319ca56-4197-477c-92e7-e6e2d95884be';

UPDATE public.profiles SET usage_stats = '{"last_reset":"2025-07-23 08:38:17.230665+00","total_tokens":0,"total_messages":0,"sessions_created":0}'::jsonb
WHERE id = 'bc764bc1-e02e-415e-97f3-36f5bdf7777e';

UPDATE public.profiles SET usage_stats = '{"last_reset":"2025-07-21 09:37:52.353731+00","total_tokens":0,"total_messages":0,"sessions_created":0}'::jsonb
WHERE id = '6324e1ee-1a7b-450c-8c9f-130e895696c2';

COMMIT;

-- ============================================================================
-- END PATCH
-- ============================================================================
