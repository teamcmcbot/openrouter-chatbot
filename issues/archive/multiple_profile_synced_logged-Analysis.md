# Multiple Profile Synced Logged - Root Cause Analysis

## Issue Summary

Multiple `profile_synced` entries are being created in the `user_activity_log` table during user authentication:

- **NEW users**: 1 `profile_created` + 7 `profile_synced` entries (8 total)
- **EXISTING users**: 3 `profile_synced` entries

## Root Cause Analysis

### 1. Trigger Configuration Issue

The current trigger is configured as:

```sql
CREATE OR REPLACE TRIGGER on_auth_user_profile_sync
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_profile_sync();
```

**Problem**: This trigger fires on **EVERY** UPDATE to the `auth.users` table, not just authentication events.

### 2. Supabase Auth Behavior

During Google OAuth authentication, Supabase performs multiple operations on the `auth.users` table:

**For NEW users:**

1. INSERT (triggers `profile_created`) ✓ Expected
2. Multiple UPDATEs for:
   - Setting `email_confirmed_at`
   - Updating `last_sign_in_at`
   - Setting `raw_user_meta_data`
   - Updating `user_metadata`
   - Setting `phone_confirmed_at`
   - Updating `confirmation_sent_at`
   - Other internal auth state updates

**For EXISTING users:**

1. Multiple UPDATEs for:
   - Updating `last_sign_in_at`
   - Refreshing `raw_user_meta_data`
   - Updating session-related fields

### 3. Function Logic Issue

The `handle_user_profile_sync()` function logs `profile_synced` on **every** call when a profile exists:

```sql
-- This executes on EVERY auth.users UPDATE
PERFORM public.log_user_activity(
    NEW.id,
    'profile_synced',  -- Logged every time!
    'profile',
    NEW.id::text,
    jsonb_build_object(...)
);
```

## Detailed Breakdown

### Why 7 `profile_synced` entries for new users?

After the initial INSERT (which creates the profile), Supabase typically performs ~7 UPDATE operations on `auth.users` during OAuth completion, each triggering the sync function.

### Why 3 `profile_synced` entries for existing users?

During sign-in, Supabase typically performs ~3 UPDATE operations on `auth.users` (last_sign_in_at, metadata refresh, session updates).

## Proposed Solutions

### Solution 1: Add Deduplication Logic (Recommended)

Modify the `handle_user_profile_sync()` function to check if a sync has already occurred recently:

```sql
CREATE OR REPLACE FUNCTION public.handle_user_profile_sync()
RETURNS TRIGGER AS $$
DECLARE
    last_sync_time TIMESTAMPTZ;
    sync_threshold INTERVAL := '5 minutes';
BEGIN
    -- Check if profile already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
        -- Check for recent sync to avoid duplicates
        SELECT MAX(timestamp) INTO last_sync_time
        FROM public.user_activity_log
        WHERE user_id = NEW.id
        AND action IN ('profile_synced', 'profile_created')
        AND timestamp > NOW() - sync_threshold;

        -- Only sync if no recent sync occurred
        IF last_sync_time IS NULL THEN
            -- Update profile logic here...

            -- Log the profile update
            PERFORM public.log_user_activity(
                NEW.id,
                'profile_synced',
                'profile',
                NEW.id::text,
                jsonb_build_object(
                    'email_updated', (SELECT email FROM public.profiles WHERE id = NEW.id) != NEW.email,
                    'sync_source', 'google_oauth'
                )
            );
        END IF;
    ELSE
        -- Profile creation logic (unchanged)...
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Solution 2: Trigger Condition Refinement

Add conditions to only trigger on meaningful changes:

```sql
CREATE OR REPLACE TRIGGER on_auth_user_profile_sync
    AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
    FOR EACH ROW
    WHEN (
        TG_OP = 'INSERT' OR
        (TG_OP = 'UPDATE' AND (
            OLD.email IS DISTINCT FROM NEW.email OR
            OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
        ))
    )
    EXECUTE FUNCTION public.handle_user_profile_sync();
```

### Solution 3: Session-Based Deduplication

Track sync operations per session to prevent duplicates within the same authentication flow:

```sql
-- Add session tracking to prevent multiple syncs in same auth flow
CREATE OR REPLACE FUNCTION public.handle_user_profile_sync()
RETURNS TRIGGER AS $$
DECLARE
    current_session_id TEXT;
    last_session_sync TEXT;
BEGIN
    -- Get current session identifier (could be based on timestamp + user)
    current_session_id := EXTRACT(EPOCH FROM NOW())::TEXT || '_' || NEW.id::TEXT;

    -- Check if we've already synced in this session (within last 2 minutes)
    SELECT details->>'session_id' INTO last_session_sync
    FROM public.user_activity_log
    WHERE user_id = NEW.id
    AND action = 'profile_synced'
    AND timestamp > NOW() - INTERVAL '2 minutes'
    ORDER BY timestamp DESC
    LIMIT 1;

    -- Rest of the function logic...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Recommended Implementation

**Use Solution 1 (Deduplication Logic)** as it's the most robust:

1. **Simple to implement**: Minimal changes to existing code
2. **Reliable**: Prevents duplicates regardless of trigger frequency
3. **Configurable**: Easy to adjust the deduplication window
4. **Backward compatible**: Doesn't break existing functionality

## Expected Results After Fix

- **NEW users**: 1 `profile_created` + 1 `profile_synced` entry (2 total)
- **EXISTING users**: 1 `profile_synced` entry per sign-in

## Testing Strategy

1. Test new user registration via Google OAuth
2. Test existing user sign-in via Google OAuth
3. Verify only expected entries appear in `user_activity_log`
4. Test edge cases (rapid successive logins, network interruptions)

## Additional Considerations

- Monitor the `user_activity_log` table size after implementation
- Consider adding cleanup procedures for old activity logs
- Implement proper indexing on timestamp columns for performance
- Add monitoring/alerting for unusual activity patterns
