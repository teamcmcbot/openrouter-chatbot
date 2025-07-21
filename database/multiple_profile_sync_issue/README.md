# Multiple Profile Sync Issue Fix

## Overview

This directory contains SQL scripts to fix the issue where multiple `profile_synced` entries are logged during user authentication.

## Problem

During Google OAuth authentication, Supabase performs multiple updates to the `auth.users` table, causing the `handle_user_profile_sync()` trigger function to execute multiple times:

- **NEW users**: 1 `profile_created` + 7 `profile_synced` entries (8 total)
- **EXISTING users**: 3 `profile_synced` entries per sign-in

## Solution

The fix adds deduplication logic to the `handle_user_profile_sync()` function:

1. **5-minute deduplication window**: Prevents multiple `profile_synced` logs within 5 minutes
2. **Email change exception**: Always logs when email changes (important updates)
3. **Profile creation unchanged**: Always logs new profile creation
4. **Backward compatible**: Doesn't break existing functionality

## Files

### 1. `01-fix-multiple-profile-sync.sql`

- **Purpose**: Applies the fix by updating the `handle_user_profile_sync()` function
- **Usage**: Run this to implement the deduplication logic
- **Expected Result**:
  - NEW users: 1 `profile_created` + 1 `profile_synced` (2 total)
  - EXISTING users: 1 `profile_synced` per sign-in

### 2. `02-rollback-multiple-profile-sync.sql`

- **Purpose**: Reverts the fix and restores original behavior
- **Usage**: Run this if the fix causes any issues
- **Result**: Returns to original behavior with multiple log entries

### 3. `03-test-verification.sql`

- **Purpose**: Provides testing functions and verification queries
- **Usage**: Run after applying the fix to verify it's working
- **Features**:
  - Helper functions to check user activity
  - Verification queries
  - Manual testing instructions

## Implementation Steps

### Step 1: Apply the Fix

```sql
\i database/multiple_profile_sync_issue/01-fix-multiple-profile-sync.sql
```

### Step 2: Load Testing Functions

```sql
\i database/multiple_profile_sync_issue/03-test-verification.sql
```

### Step 3: Manual Testing

1. **Test NEW user sign-up**:

   - Use a new Google account to sign up
   - Check activity: `SELECT * FROM public.check_user_activity_summary('<user_uuid>');`
   - Expected: 1 `profile_created` + 1 `profile_synced`

2. **Test EXISTING user sign-in**:

   - Sign out and sign back in
   - Check activity: `SELECT * FROM public.check_user_activity_summary('<user_uuid>');`
   - Expected: 1 `profile_synced` for the session

3. **Test edge cases**:
   - Rapid successive sign-ins
   - Email changes (should still log immediately)

### Step 4: Verification Queries

```sql
-- Check if fix is applied
SELECT
    routine_name,
    routine_definition LIKE '%sync_threshold%' as has_deduplication_logic
FROM information_schema.routines
WHERE routine_name = 'handle_user_profile_sync';

-- Check recent activity for all users
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
```

## Rollback (if needed)

If the fix causes any issues:

```sql
\i database/multiple_profile_sync_issue/02-rollback-multiple-profile-sync.sql
```

## Technical Details

### Deduplication Logic

The fix adds these key components to the function:

1. **Time-based check**: Looks for recent sync activities within 5 minutes
2. **Email change detection**: Compares current vs new email
3. **Conditional logging**: Only logs if no recent sync OR email changed
4. **Enhanced details**: Adds `deduplication_applied` flag to log entries

### Function Changes

```sql
-- Added variables
DECLARE
    last_sync_time TIMESTAMPTZ;
    sync_threshold INTERVAL := '5 minutes';
    profile_email_before VARCHAR(255);
    email_changed BOOLEAN := false;

-- Added deduplication check
IF NOT email_changed THEN
    SELECT MAX(timestamp) INTO last_sync_time
    FROM public.user_activity_log
    WHERE user_id = NEW.id
    AND action IN ('profile_synced', 'profile_created')
    AND timestamp > NOW() - sync_threshold;
END IF;

-- Conditional logging
IF last_sync_time IS NULL OR email_changed THEN
    PERFORM public.log_user_activity(...);
END IF;
```

## Performance Impact

- **Minimal**: Only adds one SELECT query per sync operation
- **Indexed**: Uses existing indexes on `user_id` and `timestamp`
- **Efficient**: Query is limited by time window and user ID

## Monitoring

After implementation, monitor:

1. **Activity log volume**: Should see ~75% reduction in sync entries
2. **Function performance**: No significant impact expected
3. **User experience**: Should remain unchanged
4. **Edge cases**: Email changes, rapid logins, etc.

## Cleanup

After testing is complete, optionally remove test functions:

```sql
DROP FUNCTION IF EXISTS public.check_user_activity_summary(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_user_activity_details(UUID, INTEGER);
```
