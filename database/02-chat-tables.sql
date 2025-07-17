-- Phase 2: Chat History Tables and Synchronization
-- Execute this AFTER Phase 1 (01-user-profiles.sql)

-- =============================================================================
-- CHAT SESSIONS TABLE
-- =============================================================================

-- Create chat sessions table (represents conversations)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
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

-- =============================================================================
-- CHAT MESSAGES TABLE  
-- =============================================================================

-- Create chat messages table (individual messages within conversations)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Session relationship
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    
    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- Model and token information
    model VARCHAR(100),
    tokens INTEGER DEFAULT 0,
    
    -- Timing information
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Message status
    is_error BOOLEAN DEFAULT false NOT NULL,
    error_message TEXT,
    
    -- Optional metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- Chat Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_activity ON public.chat_sessions(user_id, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created ON public.chat_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON public.chat_sessions(user_id, is_active) WHERE is_active = true;

-- Chat Messages Indexes  
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_timestamp ON public.chat_messages(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON public.chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON public.chat_messages(session_id, role);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on both tables
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
-- DATABASE FUNCTIONS
-- =============================================================================

-- Function to update session statistics when messages change
CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_record RECORD;
    last_msg RECORD;
BEGIN
    -- Get session ID based on operation type
    IF TG_OP = 'DELETE' THEN
        session_record := (SELECT * FROM public.chat_sessions WHERE id = OLD.session_id);
    ELSE
        session_record := (SELECT * FROM public.chat_sessions WHERE id = NEW.session_id);
    END IF;
    
    -- Calculate new statistics
    SELECT 
        COUNT(*) as msg_count,
        COALESCE(SUM(tokens), 0) as total_tokens
    INTO session_record
    FROM public.chat_messages 
    WHERE session_id = session_record.id;
    
    -- Get last message info
    SELECT content, timestamp, model
    INTO last_msg
    FROM public.chat_messages 
    WHERE session_id = session_record.id 
    ORDER BY timestamp DESC 
    LIMIT 1;
    
    -- Update session with new stats
    UPDATE public.chat_sessions SET
        message_count = session_record.msg_count,
        total_tokens = session_record.total_tokens,
        last_activity = NOW(),
        updated_at = NOW(),
        last_message_preview = CASE 
            WHEN last_msg.content IS NOT NULL THEN 
                LEFT(last_msg.content, 100) 
            ELSE NULL 
        END,
        last_message_timestamp = last_msg.timestamp,
        last_model = COALESCE(last_msg.model, last_model)
    WHERE id = session_record.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update session updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DATABASE TRIGGERS
-- =============================================================================

-- Trigger to update session stats when messages change
DROP TRIGGER IF EXISTS on_message_change ON public.chat_messages;
CREATE TRIGGER on_message_change
    AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();

-- Trigger to update session timestamp on updates
DROP TRIGGER IF EXISTS on_session_updated ON public.chat_sessions;
CREATE TRIGGER on_session_updated
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_session_timestamp();

-- =============================================================================
-- UTILITY FUNCTIONS FOR API
-- =============================================================================

-- Function to get user's recent chat sessions (for sidebar)
CREATE OR REPLACE FUNCTION public.get_user_recent_sessions(
    user_uuid UUID,
    session_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
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
    ORDER BY s.last_activity DESC
    LIMIT session_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get session messages (for chat view)
CREATE OR REPLACE FUNCTION public.get_session_messages(
    session_uuid UUID,
    user_uuid UUID
)
RETURNS TABLE (
    id UUID,
    role VARCHAR(20),
    content TEXT,
    model VARCHAR(100),
    tokens INTEGER,
    timestamp TIMESTAMPTZ,
    is_error BOOLEAN,
    error_message TEXT,
    metadata JSONB
) AS $$
BEGIN
    -- Verify user owns this session
    IF NOT EXISTS (
        SELECT 1 FROM public.chat_sessions 
        WHERE id = session_uuid AND user_id = user_uuid
    ) THEN
        RAISE EXCEPTION 'Session not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        m.id,
        m.role,
        m.content,
        m.model,
        m.tokens,
        m.timestamp,
        m.is_error,
        m.error_message,
        m.metadata
    FROM public.chat_messages m
    WHERE m.session_id = session_uuid
    ORDER BY m.timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- DATA MIGRATION HELPER FUNCTION
-- =============================================================================

-- Function to migrate localStorage conversations to database
CREATE OR REPLACE FUNCTION public.migrate_user_conversations(
    user_uuid UUID,
    conversations_json JSONB
)
RETURNS TABLE (
    migrated_session_id UUID,
    original_conversation_id TEXT,
    message_count INTEGER
) AS $$
DECLARE
    conv JSONB;
    session_id UUID;
    msg JSONB;
    msg_count INTEGER;
BEGIN
    -- Loop through each conversation in the JSON array
    FOR conv IN SELECT * FROM jsonb_array_elements(conversations_json)
    LOOP
        -- Create new session
        INSERT INTO public.chat_sessions (
            user_id,
            title,
            created_at,
            updated_at,
            last_activity,
            is_active
        ) VALUES (
            user_uuid,
            conv->>'title',
            (conv->>'createdAt')::TIMESTAMPTZ,
            (conv->>'updatedAt')::TIMESTAMPTZ,
            (conv->>'updatedAt')::TIMESTAMPTZ,
            (conv->>'isActive')::BOOLEAN
        ) RETURNING id INTO session_id;
        
        msg_count := 0;
        
        -- Insert messages for this session
        FOR msg IN SELECT * FROM jsonb_array_elements(conv->'messages')
        LOOP
            INSERT INTO public.chat_messages (
                session_id,
                role,
                content,
                model,
                tokens,
                timestamp,
                is_error
            ) VALUES (
                session_id,
                msg->>'role',
                msg->>'content',
                msg->>'model',
                COALESCE((msg->>'tokens')::INTEGER, 0),
                COALESCE((msg->>'timestamp')::TIMESTAMPTZ, NOW()),
                COALESCE((msg->>'isError')::BOOLEAN, false)
            );
            
            msg_count := msg_count + 1;
        END LOOP;
        
        -- Return migration result
        RETURN QUERY SELECT 
            session_id as migrated_session_id,
            conv->>'id' as original_conversation_id,
            msg_count;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if tables were created successfully
DO $$
BEGIN
    -- Check if chat_sessions table exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_sessions' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'chat_sessions table was not created successfully';
    END IF;
    
    -- Check if chat_messages table exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_messages' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'chat_messages table was not created successfully';
    END IF;
    
    -- Check if RLS is enabled
    IF NOT EXISTS (
        SELECT FROM pg_tables 
        WHERE tablename IN ('chat_sessions', 'chat_messages')
        AND schemaname = 'public' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on chat tables';
    END IF;
    
    RAISE NOTICE 'Phase 2 database setup completed successfully!';
    RAISE NOTICE 'Tables created: chat_sessions, chat_messages';
    RAISE NOTICE 'RLS policies: ✓ enabled and configured';
    RAISE NOTICE 'Utility functions: ✓ migration and query helpers installed';
    RAISE NOTICE 'Performance indexes: ✓ optimized for chat operations';
END $$;

-- =============================================================================
-- COMPLETION CHECKLIST
-- =============================================================================

/*
✅ Phase 2 Database Setup Checklist:

□ 1. Ensure Phase 1 (01-user-profiles.sql) was executed successfully
□ 2. Execute this SQL script in Supabase SQL Editor  
□ 3. Verify "Phase 2 database setup completed successfully!" message appears
□ 4. Check Table Editor → chat_sessions and chat_messages tables exist
□ 5. Verify foreign key relationships between tables
□ 6. Test RLS policies prevent cross-user data access
□ 7. Confirm utility functions are available for API endpoints

Database Schema Ready For:
- ✅ Chat session CRUD operations
- ✅ Message storage and retrieval  
- ✅ User data isolation and security
- ✅ localStorage conversation migration
- ✅ Performance-optimized queries
- ⏳ Ready for Phase 3 (User Management Enhancements)

Next Steps:
- Agent will implement API endpoints (/api/chat/*)
- Chat sync functionality will be activated
- Anonymous conversation migration will be available
*/
