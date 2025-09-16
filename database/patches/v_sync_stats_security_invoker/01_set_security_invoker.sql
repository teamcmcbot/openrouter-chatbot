-- Patch: Set security_invoker=true on v_sync_stats view
-- Rationale: Supabase linter flags SECURITY DEFINER views. We previously replaced the SECURITY DEFINER view
-- with a plain view + SECURITY DEFINER wrapper function. However the linter snapshot may still flag it
-- until explicitly marked as security invoker. This patch enforces the property for clarity/idempotence.
-- Safe / idempotent: Repeat executions have no adverse effect.

DO $$
BEGIN
    -- Only apply if view exists
    IF EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_sync_stats'
    ) THEN
        EXECUTE 'ALTER VIEW public.v_sync_stats SET (security_invoker = true)';
    END IF;
END$$;
