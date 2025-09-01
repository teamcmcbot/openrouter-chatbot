-- Patch: Enrich model in get_recent_errors (admin analytics)
-- Date: 2025-09-01
-- Notes:
--  - Forward-only, safe change. Replaces function body with COALESCE-based model fallback.
--  - Adds index on message_token_costs(user_message_id) to optimize fallback lookup.

-- 1) Performance index for fallback join (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_message_token_costs_user_message_id'
    ) THEN
        CREATE INDEX idx_message_token_costs_user_message_id
            ON public.message_token_costs(user_message_id);
    END IF;
END $$;

-- 2) Replace function with enriched model selection
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
        COALESCE(
            m.model,
            -- If this row is an assistant message with a cost snapshot, trust cost snapshot model
            (SELECT mtc.model_id FROM public.message_token_costs mtc WHERE mtc.assistant_message_id = m.id LIMIT 1),
            -- If this row is a user message with a later assistant cost snapshot, use that model
            (SELECT mtc2.model_id FROM public.message_token_costs mtc2 WHERE mtc2.user_message_id = m.id ORDER BY mtc2.message_timestamp DESC LIMIT 1),
            -- If an assistant message exists linked by user_message_id, use its model
            (SELECT m2.model FROM public.chat_messages m2 WHERE m2.user_message_id = m.id ORDER BY m2.message_timestamp DESC LIMIT 1),
            -- Fall back to session's last known model
            s.last_model
        ) AS model,
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

COMMENT ON FUNCTION public.get_recent_errors(DATE, DATE, INTEGER)
    IS 'Admin-only: most recent error messages (default 100) with enriched model fallback from costs / assistant / session.';
