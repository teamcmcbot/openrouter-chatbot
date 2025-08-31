-- =============================================================================
-- REMOVE-IS-ACTIVE PATCH (STEP 01)
-- Update views/select helpers to remove references to is_active
-- Safe to run multiple times
-- =============================================================================

-- 1) Update or drop/recreate get_user_recent_sessions without is_active
DO $$
BEGIN
    -- Check if function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'get_user_recent_sessions'
          AND n.nspname = 'public'
    ) THEN
        EXECUTE $$
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
        ) AS $$$$
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
                s.last_message_preview,
                s.last_message_timestamp
            FROM public.chat_sessions s
            WHERE s.user_id = user_uuid
            ORDER BY s.updated_at DESC
            LIMIT session_limit;
        END;
        $$$$ LANGUAGE plpgsql SECURITY DEFINER;
        $$;
    END IF;
END $$;

-- 2) No-op: other references will be caught by the ALTER TABLE step if any views still depend
