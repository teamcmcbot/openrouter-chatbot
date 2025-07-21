-- =============================================================================
-- TESTING & VERIFICATION SCRIPT
-- =============================================================================
-- This script helps verify that the multiple profile sync fix is working correctly.
-- Run this after applying the fix and performing manual testing.
-- =============================================================================

-- Function to check recent activity for a specific user
CREATE OR REPLACE FUNCTION public.check_user_activity_summary(user_uuid UUID, hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
    action VARCHAR(50),
    count BIGINT,
    first_occurrence TIMESTAMPTZ,
    last_occurrence TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ual.action,
        COUNT(*) as count,
        MIN(ual.timestamp) as first_occurrence,
        MAX(ual.timestamp) as last_occurrence
    FROM public.user_activity_log ual
    WHERE ual.user_id = user_uuid
    AND ual.timestamp > NOW() - (hours_back || ' hours')::INTERVAL
    GROUP BY ual.action
    ORDER BY first_occurrence;
END;
$$ LANGUAGE plpgsql;

-- Function to get detailed activity log for a user
CREATE OR REPLACE FUNCTION public.get_user_activity_details(user_uuid UUID, hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
    timestamp TIMESTAMPTZ,
    action VARCHAR(50),
    details JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ual.timestamp,
        ual.action,
        ual.details
    FROM public.user_activity_log ual
    WHERE ual.user_id = user_uuid
    AND ual.timestamp > NOW() - (hours_back || ' hours')::INTERVAL
    ORDER BY ual.timestamp;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if the fix is applied by looking at the function definition
SELECT 
    routine_name,
    routine_definition LIKE '%sync_threshold%' as has_deduplication_logic,
    routine_definition LIKE '%last_sync_time%' as has_sync_time_check
FROM information_schema.routines 
WHERE routine_name = 'handle_user_profile_sync';

-- Show recent activity summary for all users (last 2 hours)
SELECT 
    p.email,
    ual.action,
    COUNT(*) as count,
    MIN(ual.timestamp) as first_time,
    MAX(ual.timestamp) as last_time
FROM public.user_activity_log ual
JOIN public.profiles p ON p.id = ual.user_id
WHERE ual.timestamp > NOW() - INTERVAL '2 hours'
GROUP BY p.email, ual.action
ORDER BY p.email, first_time;

-- =============================================================================
-- MANUAL TESTING INSTRUCTIONS
-- =============================================================================

/*
MANUAL TESTING STEPS:

1. Apply the fix:
   \i database/multiple_profile_sync_issue/01-fix-multiple-profile-sync.sql

2. Test NEW user sign-up:
   - Use a new Google account to sign up
   - After sign-up, run: SELECT * FROM public.check_user_activity_summary('<user_uuid>');
   - Expected: 1 'profile_created' + 1 'profile_synced' (total: 2 entries)

3. Test EXISTING user sign-in:
   - Sign out and sign back in with existing account
   - After sign-in, run: SELECT * FROM public.check_user_activity_summary('<user_uuid>');
   - Expected: 1 'profile_synced' entry for the sign-in session

4. Test rapid sign-ins (edge case):
   - Sign out and sign in multiple times quickly
   - Should still only see 1 'profile_synced' per actual sign-in session

5. Test email change (should still log):
   - Change email in Google account and sign in
   - Should see 'profile_synced' logged even within deduplication window

VERIFICATION QUERIES:

-- Check activity for specific user (replace with actual UUID):
SELECT * FROM public.check_user_activity_summary('00000000-0000-0000-0000-000000000000');

-- Get detailed activity for specific user:
SELECT * FROM public.get_user_activity_details('00000000-0000-0000-0000-000000000000');

-- Check all recent activity:
SELECT 
    p.email,
    ual.action,
    ual.timestamp,
    ual.details->>'deduplication_applied' as dedup_applied
FROM public.user_activity_log ual
JOIN public.profiles p ON p.id = ual.user_id
WHERE ual.timestamp > NOW() - INTERVAL '1 hour'
ORDER BY ual.timestamp DESC;

ROLLBACK IF NEEDED:
If the fix causes issues, run:
\i database/multiple_profile_sync_issue/02-rollback-multiple-profile-sync.sql
*/

-- =============================================================================
-- CLEANUP FUNCTIONS (run after testing is complete)
-- =============================================================================

-- Uncomment and run these after testing is complete to clean up test functions:
-- DROP FUNCTION IF EXISTS public.check_user_activity_summary(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS public.get_user_activity_details(UUID, INTEGER);
