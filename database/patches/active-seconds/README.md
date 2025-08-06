# Active Minutes to Active Seconds Migration

## Analysis Summary

The `user_usage_daily.active_minutes` column is currently storing values in **seconds**, not minutes, despite its name. This creates confusion and potential errors in reporting and analytics.

## Current State Analysis

### Table Schema Impact

The `active_minutes` column exists in:

- **Primary Table**: `public.user_usage_daily` (line 97 in 01-users.sql)
  - Column: `active_minutes INTEGER DEFAULT 0`
  - Purpose: Track user activity duration

### Function Dependencies

1. **`track_user_usage()` Function** (lines 417-462 in 01-users.sql)

   - **Parameter**: `p_active_minutes INTEGER DEFAULT 0`
   - **Usage**: Aggregates daily activity time
   - **INSERT**: Values inserted into `active_minutes` column
   - **UPDATE**: `active_minutes = user_usage_daily.active_minutes + EXCLUDED.active_minutes`

2. **`get_user_complete_profile()` Function** (line 656 in 01-users.sql)
   - **Return**: Includes `'active_minutes', active_minutes` in JSON response
   - **Impact**: API responses include this field

### Trigger Dependencies

1. **Message Tracking Trigger** (line 251 in 02-chat.sql)
   - **Function**: `update_session_stats()`
   - **Usage**: `CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_time, 0) ELSE 0 END -- active_minutes`
   - **Source**: Passes `elapsed_time` (in seconds) to `track_user_usage()`

### Data Files Impact

1. **Sample Data** (database/samples/get_user_complete_profile.json)

   - Contains example `active_minutes` values
   - Lines 44, 54, 64 show sample data

2. **Documentation** (docs/database/DB_StepThrough.md)

   - Line 133 references `active_minutes` in usage tracking description

3. **Legacy Files** (database/\*.sql files)
   - Multiple files contain references to the old schema

## Impact Analysis

### High Impact Areas

1. **Database Schema**: Core table definition needs column rename
2. **Function Parameters**: `track_user_usage()` function parameter names
3. **Function Logic**: Column references in INSERT/UPDATE operations
4. **API Responses**: JSON field names in user profile responses

### Medium Impact Areas

1. **Documentation**: Technical documentation references
2. **Sample Data**: Example JSON responses
3. **Comments**: Inline code comments

### Low Impact Areas

1. **Frontend Code**: No direct references found in TypeScript/React code
2. **Application Logic**: Currently seems to handle seconds correctly

## Migration Strategy

### Phase 1: Database Schema Migration

1. Rename `active_minutes` column to `active_seconds`
2. Update all function definitions
3. Update function calls and references

### Phase 2: Function Updates

1. Update `track_user_usage()` function signature
2. Update `get_user_complete_profile()` function return values
3. Update trigger function comments

### Phase 3: Documentation & Samples

1. Update sample data files
2. Update technical documentation
3. Update inline comments

## Safety Considerations

### Data Preservation

- **No data loss**: Column rename preserves all existing data
- **Value consistency**: Current values are already in seconds
- **Backward compatibility**: Need to ensure API consumers are notified

### Rollback Strategy

- Reverse migration script provided
- All changes are reversible
- Function signatures can be restored

## Files Requiring Changes

### Schema Files

- `database/schema/01-users.sql`
- `database/schema/02-chat.sql`

### Legacy Files (for consistency)

- `database/02-complete-chat-history.sql`
- `database/03-complete-user-enhancements.sql`
- `database/04-complete-system-final.sql`
- `database/patches/session-creation-tracking/01-add-session-creation-trigger.sql`
- `database/patches/message-endpoint/phase2-function-updates.sql`

### Documentation & Samples

- `database/samples/get_user_complete_profile.json`
- `docs/database/DB_StepThrough.md`

## Migration Steps

1. **Execute Forward Migration**: `01-forward-migration.sql`
2. **Verify Changes**: `02-verification.sql`
3. **Update Documentation**: Manual updates to samples and docs
4. **Test Functions**: Verify all functions work correctly
5. **Update API Consumers**: Notify of field name change

## Testing Requirements

### Pre-Migration Tests

- [ ] Verify current data is in seconds
- [ ] Test `track_user_usage()` function
- [ ] Test `get_user_complete_profile()` function
- [ ] Backup current data

### Post-Migration Tests

- [ ] Verify column rename successful
- [ ] Test all function calls work
- [ ] Verify API responses have correct field names
- [ ] Validate data integrity maintained

### Rollback Tests

- [ ] Test reverse migration script
- [ ] Verify data restoration
- [ ] Confirm function restoration
