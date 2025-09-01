-- Description: Admin-only error analytics helpers (count + recent list)
-- Notes:
--  - SECURITY DEFINER functions with admin check bypass RLS safely
--  - Use in admin analytics API to avoid relying on per-user RLS on chat_messages

DO $$ BEGIN
    -- get_error_count(p_start_date, p_end_date) -> BIGINT
    CREATE OR REPLACE FUNCTION public.get_error_count(
        p_start_date DATE,
        p_end_date DATE
    )
    RETURNS BIGINT
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
        v_count BIGINT := 0;
    BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Insufficient privileges';
        END IF;

        SELECT COUNT(*) INTO v_count
        FROM public.chat_messages m
        WHERE m.message_timestamp >= p_start_date
          AND m.message_timestamp < (p_end_date + 1)
          AND m.error_message IS NOT NULL
          AND m.error_message <> '';

        RETURN v_count;
    END;
    $fn$
    LANGUAGE plpgsql;

    COMMENT ON FUNCTION public.get_error_count(DATE, DATE) IS 'Admin-only: count of error messages between dates inclusive.';

    -- get_recent_errors(p_start_date, p_end_date, p_limit) -> TABLE
    CREATE OR REPLACE FUNCTION public.get_recent_errors(
        p_start_date DATE,
        p_end_date DATE,
        p_limit INTEGER DEFAULT 100
    )
    RETURNS TABLE (
        message_id TEXT,
        session_id TEXT,
        user_id UUID,
        model VARCHAR(100),
        message_timestamp TIMESTAMPTZ,
        error_message TEXT,
        completion_id VARCHAR(255),
        user_message_id TEXT,
        elapsed_ms INTEGER
    )
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Insufficient privileges';
        END IF;

        RETURN QUERY
        SELECT
            m.id AS message_id,
            m.session_id,
            s.user_id,
            m.model,
            m.message_timestamp,
            m.error_message,
            m.completion_id,
            m.user_message_id,
            m.elapsed_ms
        FROM public.chat_messages m
        JOIN public.chat_sessions s ON s.id = m.session_id
        WHERE m.message_timestamp >= p_start_date
          AND m.message_timestamp < (p_end_date + 1)
          AND m.error_message IS NOT NULL
          AND m.error_message <> ''
        ORDER BY m.message_timestamp DESC
        LIMIT COALESCE(p_limit, 100);
    END;
    $fn$
    LANGUAGE plpgsql;

    COMMENT ON FUNCTION public.get_recent_errors(DATE, DATE, INTEGER) IS 'Admin-only: most recent error messages (default 100) with metadata.';
END $$;
