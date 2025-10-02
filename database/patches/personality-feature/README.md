# Personality Feature - Database Patches

This directory contains database patches for the AI Personality Presets feature.

## Status

- ✅ **Phase 1 (Database):** COMPLETE - Migration executed successfully on local database
- ✅ **Phase 2 (Backend):** COMPLETE - TypeScript types, validation, API endpoints, OpenRouter integration
- ⏸️ **Phase 3 (Frontend):** Pending - UI components for user settings

See `/backlog/personality-feature.md` for full implementation plan and progress.

## Related Documents

- **Feature Plan:** `/backlog/personality-feature.md`
- **Migration File:** `/supabase/migrations/20251002000000_add_personality_presets.sql`
- **Schema File:** `/database/schema/01-users.sql` (to be updated after approval)

## Patches

### 001-add-personality-columns.sql

**Purpose:** Add support for personality presets

**Changes:**

1. Add `personality_preset` column (TEXT, nullable)
2. Add documentation comments for both columns
3. Add partial index on `personality_preset` for analytics

**Affected Tables:**

- `public.profiles`

**New Columns:**

- `personality_preset` (TEXT, nullable) - Stores actual personality preset text

**Existing Columns (unchanged):**

- `system_prompt` (TEXT) - User's custom instructions (kept as-is)

**Design:**

Both `personality_preset` and `system_prompt` are **separate, composable fields**:

- Both can be NULL
- Both can be set simultaneously
- When both are set, they are combined in `appendSystemPrompt()`:
  1. Root system prompt (from file)
  2. Personality preset (if set)
  3. User system prompt (if set)

**Example combinations:**

```
preset=NULL, system_prompt='You are helpful'
  → Uses only system prompt

preset='Be concise', system_prompt=NULL
  → Uses only preset

preset='Be professional', system_prompt='You know finance'
  → Combines both: professional + finance knowledge
```

**Backward Compatibility:**

- ✅ Existing users keep their `system_prompt` unchanged
- ✅ No data migration needed
- ✅ No breaking changes to existing code
- ✅ `personality_preset` starts as NULL for all users

## Testing Instructions

### 1. Backup Database

```bash
# Create backup before running migration
pg_dump your_database > backup_before_personality_migration.sql
```

### 2. Run Migration

```bash
# Using Supabase CLI
supabase db push

# Or manually
psql -d your_database -f supabase/migrations/20251002000000_add_personality_presets.sql
```

### 3. Verify Migration

```sql
-- Check column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'personality_preset';

-- Check index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
  AND indexname = 'idx_profiles_personality_preset';

-- Check both columns are present
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('personality_preset', 'system_prompt')
ORDER BY column_name;

-- Verify all users still have their system_prompt
SELECT
  COUNT(*) as total_users,
  COUNT(system_prompt) as users_with_system_prompt,
  COUNT(personality_preset) as users_with_preset
FROM public.profiles;

-- Sample data
SELECT
  id,
  LEFT(personality_preset, 50) as preset_preview,
  LEFT(system_prompt, 50) as system_prompt_preview,
  created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Expected Results

- ✅ New `personality_preset` column exists (TEXT, nullable)
- ✅ Existing `system_prompt` column unchanged
- ✅ All existing users have `personality_preset = NULL`
- ✅ All existing users retain their `system_prompt` values
- ✅ Partial index exists on `personality_preset`
- ✅ No data loss or modification

## Rollback Instructions

If the migration needs to be rolled back:

```sql
BEGIN;

-- Drop the index
DROP INDEX IF EXISTS public.idx_profiles_personality_preset;

-- Drop personality_preset column
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS personality_preset;

COMMIT;
```

**Note:** Rollback is safe - no existing data is modified by this migration.

## Post-Migration Tasks

**Phase 1 (Database):** ✅ COMPLETE

- ✅ Migration executed successfully
- ✅ Column `personality_preset` added to profiles table
- ✅ Partial index created
- ✅ Documentation comments added

**Phase 2 (Backend):** ✅ COMPLETE

- ✅ Updated TypeScript interfaces (UserProfile, UserPreferences)
- ✅ Created `validatePersonalityPreset()` validation function
- ✅ Updated API endpoints (GET/PUT /api/user/data)
- ✅ Updated OpenRouter integration (`appendSystemPrompt()`)
- ✅ Build successful, no TypeScript errors

**Phase 3 (Frontend):** ⏸️ PENDING

- [ ] Update User Settings UI component
- [ ] Add personality preset textarea
- [ ] Add validation and character counter
- [ ] Test in browser

See `/backlog/personality-feature.md` for detailed implementation status and next steps.

## Notes

- Migration is wrapped in a transaction (BEGIN/COMMIT) for atomicity
- Rollback script is included in migration file
- No existing data is modified - only adds new column
- No data loss can occur during migration or rollback
- Backward compatible - existing code continues to work
