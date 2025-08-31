-- Archived legacy function for reference only. Replaced by client-side active tracking.
-- Do not run. Column chat_sessions.is_active has been dropped.

-- (Original content retained for historical context)
CREATE OR REPLACE FUNCTION public.set_active_session(
    target_user_id UUID,
    target_session_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    RAISE EXCEPTION 'Archived: set_active_session is deprecated and should not be executed.';
END;
$$ LANGUAGE plpgsql;
