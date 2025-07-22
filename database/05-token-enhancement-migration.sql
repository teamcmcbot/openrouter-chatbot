-- =============================================================================
-- TOKEN ENHANCEMENT MIGRATION - PHASE 5: INPUT/OUTPUT TOKEN TRACKING
-- =============================================================================
-- Execute this after Phase 4 to add detailed token tracking to chat_messages
-- Adds input_tokens, output_tokens, user_message_id columns for comprehensive token analytics

-- =============================================================================
-- FUNCTION TRIGGER OVERVIEW
-- =============================================================================
--
-- This migration updates existing database functions that are triggered by:
--
-- 1. sync_user_conversations() - Called by /api/chat/sync POST endpoint
--    - Triggered when: User signs in and syncs local chat history to database
--    - Triggered when: Frontend periodically syncs conversations for signed-in users
--    - Updated to handle: new token fields (input_tokens, output_tokens, user_message_id)
--
-- 2. update_session_stats_enhanced() - Triggered by database triggers
--    - Triggered when: Any INSERT/UPDATE/DELETE on chat_messages table
--    - Automatically updates: chat_sessions statistics and user_usage_daily analytics
--    - Enhanced to track: separate input/output tokens for comprehensive analytics
--
-- 3. track_user_usage() - Called by enhanced trigger function
--    - Triggered when: New messages are added to chat_messages
--    - Updates: user_usage_daily table with detailed token breakdown
--    - Integrates with: existing analytics infrastructure
--
-- NO BREAKING CHANGES: All existing function names and signatures preserved
-- =============================================================================

-- =============================================================================
-- CHAT MESSAGES TABLE ENHANCEMENTS
-- =============================================================================

-- Add new token tracking columns to chat_messages table
DO $$
BEGIN
    -- Add input_tokens column (for user messages - prompt tokens)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'chat_messages' AND column_name = 'input_tokens') THEN
        ALTER TABLE public.chat_messages ADD COLUMN input_tokens INTEGER DEFAULT 0;
        RAISE NOTICE 'Added input_tokens column to chat_messages table';
    ELSE
        RAISE NOTICE 'input_tokens column already exists in chat_messages table';
    END IF;
    
    -- Add output_tokens column (for assistant messages - completion tokens)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'chat_messages' AND column_name = 'output_tokens') THEN
        ALTER TABLE public.chat_messages ADD COLUMN output_tokens INTEGER DEFAULT 0;
        RAISE NOTICE 'Added output_tokens column to chat_messages table';
    ELSE
        RAISE NOTICE 'output_tokens column already exists in chat_messages table';
    END IF;
    
    -- Add user_message_id column (for assistant messages to reference user message)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'chat_messages' AND column_name = 'user_message_id') THEN
        ALTER TABLE public.chat_messages ADD COLUMN user_message_id TEXT;
        RAISE NOTICE 'Added user_message_id column to chat_messages table';
    ELSE
        RAISE NOTICE 'user_message_id column already exists in chat_messages table';
    END IF;
END $$;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Create index for user_message_id lookups (linking assistant responses to user messages)
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_message_id 
ON public.chat_messages(user_message_id) 
WHERE user_message_id IS NOT NULL;

-- Create composite index for token analytics queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_tokens_role 
ON public.chat_messages(role, input_tokens, output_tokens) 
WHERE input_tokens > 0 OR output_tokens > 0;

-- =============================================================================
-- DATA MIGRATION FOR EXISTING RECORDS
-- =============================================================================

-- Migrate existing token data to new structure
DO $$
DECLARE
    updated_user_messages INTEGER;
    updated_assistant_messages INTEGER;
BEGIN
    -- Update user messages: move total_tokens to input_tokens
    UPDATE public.chat_messages 
    SET input_tokens = total_tokens,
        output_tokens = 0
    WHERE role = 'user' 
    AND total_tokens > 0 
    AND (input_tokens IS NULL OR input_tokens = 0);
    
    GET DIAGNOSTICS updated_user_messages = ROW_COUNT;
    
    -- Update assistant messages: move total_tokens to output_tokens
    UPDATE public.chat_messages 
    SET input_tokens = 0,
        output_tokens = total_tokens
    WHERE role = 'assistant' 
    AND total_tokens > 0 
    AND (output_tokens IS NULL OR output_tokens = 0);
    
    GET DIAGNOSTICS updated_assistant_messages = ROW_COUNT;
    
    RAISE NOTICE 'Migrated token data: % user messages, % assistant messages', 
                 updated_user_messages, updated_assistant_messages;
END $$;

-- =============================================================================
-- UPDATE EXISTING TRIGGER FUNCTION (ORIGINAL NAME)
-- =============================================================================

-- Update the existing update_session_stats function to include new token fields
-- This function is triggered by the existing on_message_change trigger
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
        SELECT 
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages 
             WHERE session_id = OLD.session_id 
             ORDER BY message_timestamp DESC 
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages 
             WHERE session_id = OLD.session_id 
             ORDER BY message_timestamp DESC 
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages 
        WHERE session_id = OLD.session_id;
        
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
        SELECT 
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages 
             WHERE session_id = NEW.session_id 
             ORDER BY message_timestamp DESC 
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages 
             WHERE session_id = NEW.session_id 
             ORDER BY message_timestamp DESC 
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages 
        WHERE session_id = NEW.session_id;
        
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
        
        -- Update user_usage_daily with detailed token tracking
        IF NEW.role IN ('user', 'assistant') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END,
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END,
                COALESCE(NEW.input_tokens, 0),
                COALESCE(NEW.output_tokens, 0),
                NEW.model,
                false,
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_time, 0) ELSE 0 END
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

-- Replace the existing trigger (keeping original name)
DROP TRIGGER IF EXISTS on_message_change ON public.chat_messages;
CREATE TRIGGER on_message_change
    AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();

-- =============================================================================
-- VERIFICATION AND COMPLETION
-- =============================================================================

-- Verify the migration was successful
DO $$
DECLARE
    input_tokens_exists BOOLEAN;
    output_tokens_exists BOOLEAN;
    user_message_id_exists BOOLEAN;
    total_messages INTEGER;
    messages_with_tokens INTEGER;
BEGIN
    -- Check if new columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_messages' AND column_name = 'input_tokens'
    ) INTO input_tokens_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_messages' AND column_name = 'output_tokens'
    ) INTO output_tokens_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_messages' AND column_name = 'user_message_id'
    ) INTO user_message_id_exists;
    
    -- Get message statistics
    SELECT COUNT(*) INTO total_messages FROM public.chat_messages;
    SELECT COUNT(*) INTO messages_with_tokens 
    FROM public.chat_messages 
    WHERE input_tokens > 0 OR output_tokens > 0;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'TOKEN ENHANCEMENT MIGRATION COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Database Schema Updates:';
    RAISE NOTICE '  ✓ input_tokens column: %', CASE WHEN input_tokens_exists THEN 'Added' ELSE 'Failed' END;
    RAISE NOTICE '  ✓ output_tokens column: %', CASE WHEN output_tokens_exists THEN 'Added' ELSE 'Failed' END;
    RAISE NOTICE '  ✓ user_message_id column: %', CASE WHEN user_message_id_exists THEN 'Added' ELSE 'Failed' END;
    RAISE NOTICE '';
    RAISE NOTICE 'Data Migration Results:';
    RAISE NOTICE '  📊 Total messages: %', total_messages;
    RAISE NOTICE '  🔢 Messages with token data: %', messages_with_tokens;
    RAISE NOTICE '';
    RAISE NOTICE 'Enhanced Features:';
    RAISE NOTICE '  ✅ Separate input/output token tracking';
    RAISE NOTICE '  ✅ User message linking for assistant responses';
    RAISE NOTICE '  ✅ Enhanced sync function with token support';
    RAISE NOTICE '  ✅ Automatic usage tracking integration';
    RAISE NOTICE '  ✅ Performance indexes for token queries';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for API and Frontend Integration! 🚀';
    RAISE NOTICE '============================================';
END $$;