-- 001_fix_unindexed_fk.sql
-- Create a covering index for moderation_actions.created_by (unindexed FK)
-- Safe to run repeatedly; IF NOT EXISTS guards.

DO $$
BEGIN
    -- Ensure table exists first (fresh clones use 01-users.sql)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='moderation_actions'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_moderation_actions_created_by
            ON public.moderation_actions(created_by);
    END IF;
END$$;
