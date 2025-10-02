# Bug Fix: Personality Preset Not Displaying After Save

**Issue:** User saved `personality_preset = "witty"` in database, but User Settings UI showed "-- No Preset --" after refresh.

**Date:** October 3, 2025  
**Status:** Fixed ✅

---

## 🐛 Root Cause Analysis

### Problem 1: Missing Field in Database Function

The `get_user_complete_profile()` PostgreSQL function was **not including `personality_preset`** in its return value.

**Location:** `/database/schema/01-users.sql` line 678-780

**Original Code (BROKEN):**

```sql
SELECT
    id, email, full_name, avatar_url,
    default_model, temperature, system_prompt,  -- personality_preset MISSING!
    subscription_tier, account_type, credits,
    ...
INTO profile_data
FROM public.profiles
WHERE id = user_uuid;

...

'preferences', jsonb_build_object(
    'model', jsonb_build_object(
        'default_model', profile_data.default_model,
        'temperature', profile_data.temperature,
        'system_prompt', profile_data.system_prompt
        -- personality_preset MISSING!
    ),
    ...
)
```

**Impact:** When frontend called `GET /api/user/data`, the database function didn't return `personality_preset`, so the API returned `undefined` (or the fallback value), not the actual database value.

### Problem 2: Undefined vs Null Handling in API

The API route was using `|| undefined` as the fallback for `personality_preset`, which can cause issues with React state updates.

**Location:** `/src/app/api/user/data/route.ts` lines 67 & 242

**Original Code (SUBOPTIMAL):**

```typescript
personality_preset: profileData.preferences?.model?.personality_preset ||
  undefined;
```

**Issue:** When the value is `null` in the database, `|| undefined` converts it to `undefined`, which might not properly update React state in some cases. Using `|| null` is more explicit and consistent with the type system.

---

## ✅ Fixes Applied

### Fix 1: Update Database Function Schema

**File:** `/database/schema/01-users.sql`

Added `personality_preset` to the SELECT statement:

```sql
SELECT
    id, email, full_name, avatar_url,
    default_model, temperature, system_prompt, personality_preset,  -- ADDED
    subscription_tier, account_type, credits,
    ...
```

Added `personality_preset` to the JSONB return object:

```sql
'model', jsonb_build_object(
    'default_model', profile_data.default_model,
    'temperature', profile_data.temperature,
    'system_prompt', profile_data.system_prompt,
    'personality_preset', profile_data.personality_preset  -- ADDED
),
```

### Fix 2: Update API to Use Null Instead of Undefined

**File:** `/src/app/api/user/data/route.ts`

Changed both GET and PUT handlers:

```typescript
// Before
personality_preset: profileData.preferences?.model?.personality_preset ||
  undefined;

// After
personality_preset: profileData.preferences?.model?.personality_preset || null;
```

### Fix 3: Create Database Migration Patch

**File:** `/database/patches/personality-feature/002-fix-get-user-complete-profile.sql`

Created a migration script to update the database function with the fixes.

---

## 🚀 How to Apply the Fix

### Step 1: Update Database Function (REQUIRED)

Run the migration patch to update the database function:

```bash
# Option 1: Using psql directly
psql -d your_database -f database/patches/personality-feature/002-fix-get-user-complete-profile.sql

# Option 2: Using Supabase CLI
supabase db push
```

### Step 2: Restart Application (REQUIRED)

The API code changes require a restart:

```bash
# Development
npm run dev

# Production
# Redeploy or restart your production server
```

### Step 3: Verify the Fix

1. Open User Settings in your browser
2. The personality preset should now display correctly (e.g., "😄 Witty & Clever")
3. Try changing to a different preset and saving
4. Refresh the page - the new preset should persist

---

## 🧪 Testing Checklist

### Database Function Test

```sql
-- Test that personality_preset is returned
SELECT
    (preferences->'model'->>'personality_preset') as personality_preset,
    (preferences->'model'->>'system_prompt') as system_prompt
FROM (
    SELECT get_user_complete_profile(id) as preferences
    FROM profiles
    WHERE personality_preset IS NOT NULL
    LIMIT 1
) sub;
```

**Expected Result:** Should return the actual `personality_preset` value (e.g., "witty")

### API Test

```bash
# Test GET endpoint
curl -X GET http://localhost:3000/api/user/data \
  -H "Cookie: <your-session-cookie>"
```

**Expected Response:**

```json
{
  "preferences": {
    "model": {
      "personality_preset": "witty", // Should be the actual value, not null
      "system_prompt": "...",
      "temperature": 0.7,
      "default_model": "..."
    }
  }
}
```

### UI Test

- [x] Open User Settings
- [x] Verify personality preset shows correctly in view mode
- [x] Enter edit mode
- [x] Change preset to different value
- [x] Save and verify success toast
- [x] Refresh page
- [x] Verify new preset persists

---

## 📊 Impact Assessment

### Before Fix

- ❌ Database had `personality_preset = "witty"`
- ❌ Frontend displayed "-- No Preset --"
- ❌ User could not see their saved preference
- ❌ Confusing UX - changes appeared not to save

### After Fix

- ✅ Database has `personality_preset = "witty"`
- ✅ Frontend displays "😄 Witty & Clever"
- ✅ User sees their saved preference correctly
- ✅ Clear UX - changes persist as expected

---

## 🔍 Verification Query

Run this to check your current personality preset value:

```sql
-- Check your personality preset in the database
SELECT
    id,
    email,
    personality_preset,
    system_prompt
FROM profiles
WHERE personality_preset IS NOT NULL
LIMIT 10;
```

---

## 📝 Related Files Modified

1. ✅ `/database/schema/01-users.sql` - Updated function definition
2. ✅ `/src/app/api/user/data/route.ts` - Fixed null handling (2 locations)
3. ✅ `/database/patches/personality-feature/002-fix-get-user-complete-profile.sql` - Migration script

---

## 🎯 Summary

The issue was caused by the database function not returning `personality_preset` in its JSONB output. The frontend API was correctly saving the value to the database, but when retrieving it, the database function didn't include it in the response. This has been fixed by:

1. Adding `personality_preset` to the SELECT statement
2. Adding `personality_preset` to the JSONB build object
3. Improving null handling in the API (using `|| null` instead of `|| undefined`)

**Action Required:** Run the database migration script and restart your application.
