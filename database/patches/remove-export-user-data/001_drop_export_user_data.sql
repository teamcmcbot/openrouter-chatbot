-- Patch: Drop unused export_user_data function
-- Date: 2025-09-10
-- Rationale: Unreferenced in application code; superseded by other data access paths.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='export_user_data'
    ) THEN
        EXECUTE 'DROP FUNCTION public.export_user_data(uuid)';
    END IF;
END$$;

COMMIT;
