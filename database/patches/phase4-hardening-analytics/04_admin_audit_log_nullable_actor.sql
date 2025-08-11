-- Phase 4 follow-up: Allow NULL actor for system-initiated audit entries (idempotent)
BEGIN;

DO $$
BEGIN
  -- Drop NOT NULL on actor_user_id if present to permit system-triggered logs
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'admin_audit_log'
      AND column_name  = 'actor_user_id'
      AND is_nullable  = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.admin_audit_log ALTER COLUMN actor_user_id DROP NOT NULL';
  END IF;
END$$;

COMMENT ON COLUMN public.admin_audit_log.actor_user_id IS 'Nullable: NULL indicates a system/scheduled action (no human actor)';

COMMIT;
