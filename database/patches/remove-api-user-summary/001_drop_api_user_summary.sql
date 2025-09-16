-- Patch: Drop unused api_user_summary view (pending verification of no application references)
-- Date: 2025-09-10
-- Rationale: View not queried directly; removing to reduce schema surface.

BEGIN;

DROP VIEW IF EXISTS public.api_user_summary;

COMMIT;
