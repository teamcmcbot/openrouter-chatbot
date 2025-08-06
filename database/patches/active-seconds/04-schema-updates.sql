-- =============================================================================
-- SCHEMA UPDATE SCRIPT: Apply active_seconds changes to main schema files
-- =============================================================================
-- This script contains the changes that need to be applied to the main
-- schema files after the migration has been tested and verified.
--
-- Apply these changes to:
-- - database/schema/01-users.sql
-- - database/schema/02-chat.sql
-- =============================================================================

-- =============================================================================
-- CHANGES FOR database/schema/01-users.sql
-- =============================================================================

/*
Line 97: Change column definition
FROM: active_minutes INTEGER DEFAULT 0,
TO:   active_seconds INTEGER DEFAULT 0,

Line 417: Change function parameter
FROM: p_active_minutes INTEGER DEFAULT 0
TO:   p_active_seconds INTEGER DEFAULT 0

Line 446: Change INSERT column list
FROM: sessions_created, active_minutes
TO:   sessions_created, active_seconds

Line 452: Change VALUES list  
FROM: p_active_minutes
TO:   p_active_seconds

Line 462: Change UPDATE clause (appears 3 times)
FROM: active_minutes = user_usage_daily.active_minutes + EXCLUDED.active_minutes,
TO:   active_seconds = user_usage_daily.active_seconds + EXCLUDED.active_seconds,

Line 656: Change JSON field name (appears 2 times)
FROM: 'active_minutes', active_minutes
TO:   'active_seconds', active_seconds
*/

-- =============================================================================
-- CHANGES FOR database/schema/02-chat.sql  
-- =============================================================================

/*
Line 251: Update comment for clarity
FROM: CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_time, 0) ELSE 0 END -- active_minutes
TO:   CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_time, 0) ELSE 0 END -- active_seconds
*/

-- =============================================================================
-- TEMPLATE REPLACEMENTS FOR AUTOMATION
-- =============================================================================

-- Use these sed commands to automate the changes:

-- For 01-users.sql:
-- sed -i.bak 's/active_minutes INTEGER DEFAULT 0,/active_seconds INTEGER DEFAULT 0,/g' database/schema/01-users.sql
-- sed -i.bak 's/p_active_minutes INTEGER DEFAULT 0/p_active_seconds INTEGER DEFAULT 0/g' database/schema/01-users.sql  
-- sed -i.bak 's/sessions_created, active_minutes/sessions_created, active_seconds/g' database/schema/01-users.sql
-- sed -i.bak 's/p_active_minutes/p_active_seconds/g' database/schema/01-users.sql
-- sed -i.bak 's/active_minutes = user_usage_daily\.active_minutes + EXCLUDED\.active_minutes/active_seconds = user_usage_daily.active_seconds + EXCLUDED.active_seconds/g' database/schema/01-users.sql
-- sed -i.bak "s/'active_minutes', active_minutes/'active_seconds', active_seconds/g" database/schema/01-users.sql

-- For 02-chat.sql:
-- sed -i.bak 's/-- active_minutes/-- active_seconds/g' database/schema/02-chat.sql

-- =============================================================================
-- VALIDATION QUERIES
-- =============================================================================

-- After applying changes, run these queries to validate:

-- 1. Check that old references are gone:
-- SELECT * FROM pg_class WHERE relname LIKE '%active_minutes%';

-- 2. Check function signatures:
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('track_user_usage', 'get_user_complete_profile');

-- 3. Test function calls:
-- SELECT public.track_user_usage('00000000-0000-0000-0000-000000000001'::uuid, 0, 0, 0, 0, NULL, false, 30);

-- =============================================================================
-- DOCUMENTATION UPDATES NEEDED
-- =============================================================================

/*
After schema changes, update these files manually:

1. database/samples/get_user_complete_profile.json
   - Lines 44, 54, 64: Change "active_minutes" to "active_seconds"

2. docs/database/DB_StepThrough.md  
   - Line 133: Change reference from "active_minutes" to "active_seconds"

3. Consider updating API documentation to reflect field name change
*/
