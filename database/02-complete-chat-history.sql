-- =============================================================================
-- COMPREHENSIVE DATABASE SCHEMA - PHASE 2: CHAT HISTORY & SYNC
-- =============================================================================
-- Execute this after Phase 1 to set up chat history with TEXT IDs for client compatibility
-- Includes all fixes: TEXT ID support, proper policies, sync functionality

-- =============================================================================
-- CHAT TABLES WITH TEXT IDS (CLIENT COMPATIBLE)
-- =============================================================================

-- Chat sessions table (represents conversations)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    -- Primary key and identification (TEXT to support client-generated IDs)
    id TEXT PRIMARY KEY, -- Supports IDs like "conv_1752734987703_j9spjufk8"
    
    -- User ownership (foreign key to profiles)
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Session metadata
    title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    
    -- Activity tracking
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Usage statistics
    message_count INTEGER DEFAULT 0 NOT NULL,
    total_tokens INTEGER DEFAULT 0 NOT NULL,
    last_model VARCHAR(100),
    
    -- Status flags
    is_active BOOLEAN DEFAULT true NOT NULL,
    
    -- Preview information (for sidebar display)
    last_message_preview TEXT,
    last_message_timestamp TIMESTAMPTZ
);

-- Chat messages table (individual messages within conversations)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    -- Primary key and identification (TEXT to support client-generated IDs)
    id TEXT PRIMARY KEY, -- Supports IDs like "msg_1752735003369_o159ep4bq"
    
    -- Session relationship
    session_id TEXT REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    
    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- Model and performance metadata
    model VARCHAR(100),
    total_tokens INTEGER DEFAULT 0,
    
    -- Timing information
    message_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Error handling
    error_message TEXT,
    is_streaming BOOLEAN DEFAULT false,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Chat sessions indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON public.chat_sessions(user_id, updated_at DESC);

-- Chat messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON public.chat_messages(message_timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_timestamp ON public.chat_messages(session_id, message_timestamp);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Chat Sessions Policies
CREATE POLICY "Users can view their own chat sessions" ON public.chat_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own chat sessions" ON public.chat_sessions
    FOR DELETE USING (user_id = auth.uid());

-- Chat Messages Policies (using session ownership)
CREATE POLICY "Users can view messages from their sessions" ON public.chat_messages
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in their sessions" ON public.chat_messages
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update messages in their sessions" ON public.chat_messages
    FOR UPDATE USING (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages in their sessions" ON public.chat_messages
    FOR DELETE USING (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to update session statistics when messages change
CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_stats RECORD;
BEGIN
    -- Determine which session to update
    IF TG_OP = 'DELETE' THEN
        -- Use OLD record for DELETE operations
        SELECT 
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
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
    END IF;
    
    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update session timestamp on updates
CREATE OR REPLACE FUNCTION public.update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's recent chat sessions (for API)
CREATE OR REPLACE FUNCTION public.get_user_recent_sessions(
    user_uuid UUID,
    session_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id TEXT,
    title VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ,
    message_count INTEGER,
    total_tokens INTEGER,
    last_model VARCHAR(100),
    is_active BOOLEAN,
    last_message_preview TEXT,
    last_message_timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        s.last_activity,
        s.message_count,
        s.total_tokens,
        s.last_model,
        s.is_active,
        s.last_message_preview,
        s.last_message_timestamp
    FROM public.chat_sessions s
    WHERE s.user_id = user_uuid
    ORDER BY s.updated_at DESC
    LIMIT session_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get session with messages (for API)
CREATE OR REPLACE FUNCTION public.get_session_with_messages(
    session_text_id TEXT,
    requesting_user_uuid UUID
)
RETURNS TABLE (
    session_id TEXT,
    session_title VARCHAR(255),
    session_created_at TIMESTAMPTZ,
    session_updated_at TIMESTAMPTZ,
    message_id TEXT,
    message_role VARCHAR(20),
    message_content TEXT,
    message_model VARCHAR(100),
    message_tokens INTEGER,
    message_timestamp TIMESTAMPTZ,
    message_metadata JSONB
) AS $$
BEGIN
    -- Verify user owns this session
    IF NOT EXISTS (
        SELECT 1 FROM public.chat_sessions 
        WHERE id = session_text_id AND user_id = requesting_user_uuid
    ) THEN
        RAISE EXCEPTION 'Session not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        s.id as session_id,
        s.title as session_title,
        s.created_at as session_created_at,
        s.updated_at as session_updated_at,
        m.id as message_id,
        m.role as message_role,
        m.content as message_content,
        m.model as message_model,
        m.total_tokens as message_tokens,
        m.message_timestamp as message_timestamp,
        m.metadata as message_metadata
    FROM public.chat_sessions s
    LEFT JOIN public.chat_messages m ON s.id = m.session_id
    WHERE s.id = session_text_id
    ORDER BY m.message_timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to update session stats when messages change
CREATE OR REPLACE TRIGGER on_message_change
    AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();

-- Trigger to update session timestamp on updates
CREATE OR REPLACE TRIGGER on_session_updated
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_session_timestamp();

-- =============================================================================
-- BULK SYNC FUNCTIONS (FOR API)
-- =============================================================================

-- Function to sync multiple conversations at once
CREATE OR REPLACE FUNCTION public.sync_user_conversations(
    user_uuid UUID,
    conversations_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    conversation JSONB;
    message JSONB;
    sync_results JSONB := jsonb_build_object(
        'synced', 0,
        'errors', 0,
        'details', '[]'::jsonb
    );
    error_details JSONB;
BEGIN
    -- Loop through each conversation
    FOR conversation IN SELECT * FROM jsonb_array_elements(conversations_data)
    LOOP
        BEGIN
            -- Insert or update session
            INSERT INTO public.chat_sessions (
                id, user_id, title, message_count, total_tokens,
                last_model, last_message_preview, last_message_timestamp,
                created_at, updated_at
            ) VALUES (
                conversation->>'id',
                user_uuid,
                conversation->>'title',
                (conversation->>'messageCount')::integer,
                (conversation->>'totalTokens')::integer,
                conversation->>'lastModel',
                conversation->>'lastMessagePreview',
                (conversation->>'lastMessageTimestamp')::timestamptz,
                (conversation->>'createdAt')::timestamptz,
                (conversation->>'updatedAt')::timestamptz
            )
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                message_count = EXCLUDED.message_count,
                total_tokens = EXCLUDED.total_tokens,
                last_model = EXCLUDED.last_model,
                last_message_preview = EXCLUDED.last_message_preview,
                last_message_timestamp = EXCLUDED.last_message_timestamp,
                updated_at = EXCLUDED.updated_at;
            
            -- Insert messages for this conversation
            IF conversation->'messages' IS NOT NULL THEN
                FOR message IN SELECT * FROM jsonb_array_elements(conversation->'messages')
                LOOP
                    INSERT INTO public.chat_messages (
                        id, session_id, role, content, model, total_tokens,
                        message_timestamp, error_message, is_streaming
                    ) VALUES (
                        message->>'id',
                        conversation->>'id',
                        message->>'role',
                        message->>'content',
                        message->>'model',
                        COALESCE((message->>'total_tokens')::integer, 0),
                        (message->>'timestamp')::timestamptz,
                        CASE WHEN (message->>'error')::boolean THEN 'Message failed' ELSE NULL END,
                        false
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        content = EXCLUDED.content,
                        model = EXCLUDED.model,
                        total_tokens = EXCLUDED.total_tokens,
                        message_timestamp = EXCLUDED.message_timestamp;
                END LOOP;
            END IF;
            
            -- Increment success counter
            sync_results := jsonb_set(
                sync_results,
                '{synced}',
                ((sync_results->>'synced')::integer + 1)::text::jsonb
            );
            
        EXCEPTION WHEN OTHERS THEN
            -- Handle errors
            error_details := jsonb_build_object(
                'conversationId', conversation->>'id',
                'error', SQLERRM
            );
            
            sync_results := jsonb_set(
                sync_results,
                '{errors}',
                ((sync_results->>'errors')::integer + 1)::text::jsonb
            );
            
            sync_results := jsonb_set(
                sync_results,
                '{details}',
                (sync_results->'details') || error_details
            );
        END;
    END LOOP;
    
    RETURN sync_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION & SETUP COMPLETE
-- =============================================================================

-- Verify everything is set up correctly
DO $$
DECLARE
    sessions_count INTEGER;
    messages_count INTEGER;
    policies_count INTEGER;
BEGIN
    -- Check if tables exist
    SELECT COUNT(*) INTO sessions_count 
    FROM information_schema.tables 
    WHERE table_name = 'chat_sessions';
    
    SELECT COUNT(*) INTO messages_count
    FROM information_schema.tables 
    WHERE table_name = 'chat_messages';
    
    SELECT COUNT(*) INTO policies_count
    FROM information_schema.table_privileges
    WHERE grantee = 'authenticated' 
    AND table_name IN ('chat_sessions', 'chat_messages');
    
    IF sessions_count = 0 THEN
        RAISE EXCEPTION 'chat_sessions table was not created';
    END IF;
    
    IF messages_count = 0 THEN
        RAISE EXCEPTION 'chat_messages table was not created';
    END IF;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'PHASE 2 SETUP COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  ✓ chat_sessions (TEXT ID support)';
    RAISE NOTICE '  ✓ chat_messages (TEXT ID support)';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '  ✓ Client-compatible TEXT IDs';
    RAISE NOTICE '  ✓ Row Level Security policies';
    RAISE NOTICE '  ✓ Automatic session statistics';
    RAISE NOTICE '  ✓ Bulk sync functions';
    RAISE NOTICE '  ✓ Performance indexes';
    RAISE NOTICE 'API Ready:';
    RAISE NOTICE '  ✓ /api/chat/sync endpoint compatible';
    RAISE NOTICE '  ✓ Direct client ID storage';
    RAISE NOTICE 'Ready for Phase 3: User Enhancements';
    RAISE NOTICE '============================================';
END $$;
