-- Patch 004: Usage analytics and cost update fixes
-- Goal:
--   1) Prevent attachments linking (message updates) from incrementing user_usage_daily.messages_sent.
--      We restrict track_user_usage() calls to only fire on INSERT of chat_messages.
--   2) Ensure estimated_cost updates only occur via the recompute path,
--      so cost is recorded once after assistant insert (with current image units = 0)
--      and adjusted later by delta when attachments link via after_attachment_link_recompute_cost.
--
-- Notes:
--   - We keep the session stats updates (message_count, total_tokens, previews) on all ops.
--   - We delegate assistant cost processing to recompute_image_cost_for_user_message().
--     This centralizes message_token_costs writes and user_usage_daily.estimated_cost changes.

BEGIN;

-- 1) Restrict usage tracking to INSERT-only to avoid double-counting on UPDATE
CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_stats RECORD;
    total_input_tokens INTEGER := 0;
    total_output_tokens INTEGER := 0;
BEGIN
    -- Determine which session to update
    IF TG_OP = 'DELETE' THEN
        -- Use OLD record for DELETE operations (exclude error messages)
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = OLD.session_id
        AND (error_message IS NULL OR error_message = '');

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = OLD.session_id;
    ELSE
        -- INSERT or UPDATE operations (exclude error messages)
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = NEW.session_id
        AND (error_message IS NULL OR error_message = '');

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = NEW.session_id;

        -- Only track usage for successful messages on INSERT (avoid UPDATE double-counting)
        IF TG_OP = 'INSERT' AND NEW.role IN ('user', 'assistant')
           AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END, -- messages_sent
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END, -- messages_received
                CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.input_tokens, 0) ELSE 0 END, -- input_tokens
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.output_tokens, 0) ELSE 0 END, -- output_tokens
                NEW.model, -- model_used
                false, -- session_created
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_ms, 0) ELSE 0 END -- generation_ms (ms)
            );
        END IF;
    END IF;

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2) Centralize estimated_cost updates via recompute function
--    Replace calculate_and_record_message_cost() to defer to recompute path only
CREATE OR REPLACE FUNCTION public.calculate_and_record_message_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- Only handle successful assistant messages
    IF NEW.role = 'assistant' AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
        -- Delegate to recompute (handles message_token_costs upsert and daily cost delta)
        -- This records per-token cost immediately (with 0 image units if none yet),
        -- and later image deltas when attachments are linked.
        PERFORM public.recompute_image_cost_for_user_message(NEW.user_message_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
