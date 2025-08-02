-- =====================================================
-- Phase 2: Database Function Updates
-- =====================================================
-- 
-- This script updates database functions to exclude error messages 
-- from analytics tracking and token calculations.
--
-- DEPENDENCY ANALYSIS:
-- - update_session_stats(): Triggered by chat_messages table changes
-- - track_user_usage(): Called by update_session_stats() function
-- - Both functions are core to the analytics system
-- - Changes are backward compatible and only filter out error messages
--
-- SAFETY: These updates are non-breaking and improve data accuracy
-- =====================================================

-- =============================================================================
-- FUNCTION 1: Enhanced update_session_stats()
-- =============================================================================
-- PURPOSE: Exclude error messages from session statistics and token calculations
-- CHANGES: 
-- 1. Add WHERE clause to exclude messages with error_message
-- 2. Only call track_user_usage() for successful messages
-- 3. Maintain all existing functionality for non-error messages

CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_stats RECORD;
    total_input_tokens INTEGER := 0;
    total_output_tokens INTEGER := 0;
BEGIN
    -- Determine which session to update
    IF TG_OP = 'DELETE' THEN
        -- Use OLD record for DELETE operations
        -- ENHANCEMENT: Exclude error messages from statistics
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = OLD.session_id
        AND (error_message IS NULL OR error_message = ''); -- EXCLUDE ERROR MESSAGES

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
        -- Use NEW record for INSERT/UPDATE operations
        -- ENHANCEMENT: Exclude error messages from statistics
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = NEW.session_id
        AND (error_message IS NULL OR error_message = ''); -- EXCLUDE ERROR MESSAGES

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

        -- ENHANCEMENT: Only track usage for successful messages (exclude error messages)
        IF NEW.role IN ('user', 'assistant') 
           AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END, -- messages_sent
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END, -- messages_received
                CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.input_tokens, 0) ELSE 0 END, -- input_tokens
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.output_tokens, 0) ELSE 0 END, -- output_tokens
                NEW.model, -- model_used
                false, -- session_created
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_time, 0) ELSE 0 END -- active_minutes
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

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these queries after applying the function updates to verify the changes

-- Query 1: Verify error messages are excluded from session stats
-- This should show sessions with message_count that excludes error messages
/*
SELECT 
    cs.id,
    cs.message_count as session_count,
    COUNT(cm.id) as total_messages,
    COUNT(CASE WHEN cm.error_message IS NULL OR cm.error_message = '' THEN 1 END) as success_messages,
    COUNT(CASE WHEN cm.error_message IS NOT NULL AND cm.error_message != '' THEN 1 END) as error_messages
FROM public.chat_sessions cs
LEFT JOIN public.chat_messages cm ON cs.id = cm.session_id
GROUP BY cs.id, cs.message_count
HAVING COUNT(CASE WHEN cm.error_message IS NOT NULL AND cm.error_message != '' THEN 1 END) > 0
LIMIT 10;
*/

-- Query 2: Verify token calculations exclude error messages
-- This should show that total_tokens in sessions matches sum of non-error messages
/*
SELECT 
    cs.id,
    cs.total_tokens as session_tokens,
    COALESCE(SUM(CASE WHEN cm.error_message IS NULL OR cm.error_message = '' 
                     THEN COALESCE(cm.total_tokens, 0) ELSE 0 END), 0) as calculated_tokens,
    COUNT(CASE WHEN cm.error_message IS NOT NULL AND cm.error_message != '' THEN 1 END) as error_count
FROM public.chat_sessions cs
LEFT JOIN public.chat_messages cm ON cs.id = cm.session_id
GROUP BY cs.id, cs.total_tokens
HAVING COUNT(CASE WHEN cm.error_message IS NOT NULL AND cm.error_message != '' THEN 1 END) > 0
LIMIT 10;
*/

-- Query 3: Check that error messages exist and are properly flagged
/*
SELECT 
    id,
    role,
    LEFT(content, 50) as content_preview,
    error_message IS NOT NULL as has_error,
    LEFT(error_message, 50) as error_preview
FROM public.chat_messages 
WHERE error_message IS NOT NULL AND error_message != ''
LIMIT 5;
*/

-- =============================================================================
-- ROLLBACK SCRIPT (if needed)
-- =============================================================================
-- If you need to rollback these changes, run the original function definition
-- from database/schema/02-chat.sql lines 155-244
-- 
-- The rollback would restore the original behavior where error messages
-- are included in statistics and usage tracking.
-- =============================================================================

-- ROLLBACK NOTES:
-- 1. The original update_session_stats() function can be restored from git history
-- 2. No data corruption occurs - only analytics accuracy is affected
-- 3. All error messages remain in the database unchanged
-- 4. The track_user_usage() function is unchanged and compatible

-- =============================================================================
-- DEPLOYMENT INSTRUCTIONS
-- =============================================================================
-- 1. Test in development environment first
-- 2. Backup database before applying to production
-- 3. Run function update during low-traffic period
-- 4. Verify results using the verification queries above
-- 5. Monitor session statistics after deployment
-- =============================================================================
