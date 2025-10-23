-- Migration: Add conversation search indexes
-- Feature: Chat Sidebar Search (Phase 2 - Server-side search)
-- Date: October 23, 2025
-- Description: Adds performance indexes for ILIKE pattern matching on conversation titles and message content

-- ============================================================================
-- CONVERSATION SEARCH PERFORMANCE INDEXES
-- ============================================================================

-- Index 1: Conversation title search (user-scoped)
-- Optimizes: WHERE user_id = $1 AND title ILIKE '%query%'
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_title_pattern 
ON public.chat_sessions(user_id, title text_pattern_ops);

COMMENT ON INDEX public.idx_chat_sessions_user_title_pattern IS 
'Optimizes ILIKE pattern matching for conversation title search by user. Used in /api/chat/search endpoint.';

-- Index 2: Message content search
-- Optimizes: WHERE content ILIKE '%query%' AND role IN ('user', 'assistant')
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_pattern 
ON public.chat_messages(content text_pattern_ops)
WHERE role IN ('user', 'assistant');

COMMENT ON INDEX public.idx_chat_messages_content_pattern IS 
'Optimizes ILIKE pattern matching for message content search. Filtered to user and assistant messages only.';

-- Index 3: Conversation search context (composite)
-- Optimizes: Retrieval of conversation metadata during search
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_search
ON public.chat_sessions(user_id, last_message_timestamp DESC)
INCLUDE (title, last_message_preview, message_count);

COMMENT ON INDEX public.idx_chat_sessions_user_search IS 
'Composite index for efficient conversation retrieval with search metadata. Includes commonly needed fields for search results.';

-- Index 4: Message-to-session join (search operations)
-- Optimizes: JOIN chat_messages ON session_id during search
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_content
ON public.chat_messages(session_id, role)
INCLUDE (content, message_timestamp)
WHERE role IN ('user', 'assistant');

COMMENT ON INDEX public.idx_chat_messages_session_content IS 
'Optimizes message content retrieval during search operations. Includes content and timestamp for result display.';

-- ============================================================================
-- VERIFICATION QUERY (optional - uncomment to verify after migration)
-- ============================================================================
-- SELECT 
--     schemaname,
--     tablename,
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) as size
-- FROM pg_stat_user_indexes
-- WHERE indexname IN (
--     'idx_chat_sessions_user_title_pattern',
--     'idx_chat_messages_content_pattern',
--     'idx_chat_sessions_user_search',
--     'idx_chat_messages_session_content'
-- )
-- ORDER BY tablename, indexname;
