-- Recreate get_user_recent_sessions without is_active (idempotent via DROP + CREATE)

DROP FUNCTION IF EXISTS public.get_user_recent_sessions(UUID, INTEGER);

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
    last_message_preview TEXT,
    last_message_timestamp TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        s.last_activity,
        s.message_count,
        s.total_tokens,
        s.last_model,
        s.last_message_preview,
        s.last_message_timestamp
    FROM public.chat_sessions s
    WHERE s.user_id = user_uuid
    ORDER BY s.updated_at DESC
    LIMIT session_limit;
$$;

-- If any dependent objects still reference chat_sessions.is_active,
-- they will be caught at step 03 (ALTER TABLE DROP COLUMN) as errors.
