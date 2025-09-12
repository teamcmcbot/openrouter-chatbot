# Database Cleanup Analysis

**Date**: December 30, 2024  
**Objective**: Identify unused database objects for clean production deployment  
**Source**: Analysis of `/database/schema/` files only (excludes patches)

## Executive Summary

This analysis examines all database objects defined in the 6 main schema files against their usage in the codebase to identify potentially unused tables, functions, triggers, and other database objects that could be safely removed before production deployment.

## Schema Object Inventory

### Tables (18 total)

1. **profiles** - User profile data (ACTIVE)
2. **user_activity_log** - User action tracking (ACTIVE)
3. **moderation_actions** - Admin moderation records (ACTIVE)
4. **user_usage_daily** - Daily usage aggregation (ACTIVE)
5. **chat_sessions** - Conversation containers (ACTIVE)
6. **chat_messages** - Individual messages (ACTIVE)
7. **chat_attachments** - File attachments (ACTIVE)
8. **chat_message_annotations** - Message metadata (ACTIVE)
9. **message_token_costs** - Token cost tracking (ACTIVE)
10. **model_access** - Available models registry (ACTIVE)
11. **model_sync_log** - Model synchronization logs (ACTIVE)
12. **system_cache** - Generic caching (REVIEW)
13. **system_stats** - Database health metrics (REVIEW)
14. **admin_audit_log** - Admin action logging (ACTIVE)
15. **cta_events** - Call-to-action tracking (ACTIVE)
16. **anonymous_usage_daily** - Anonymous user analytics (ACTIVE)
17. **anonymous_model_usage_daily** - Anonymous model stats (ACTIVE)
18. **anonymous_error_events** - Anonymous error tracking (ACTIVE)

### Functions (40 total)

1. **jsonb_deep_merge** - JSONB utility (UNUSED - used only by unused update_user_preferences)
2. **update_updated_at_column** - Timestamp trigger function (ACTIVE)
3. **log_user_activity** - Activity logging (ACTIVE)
4. **is_admin** - Admin permission check (ACTIVE)
5. **is_banned** - Ban status check (ACTIVE)
6. **handle_user_profile_sync** - Auth sync handler (ACTIVE)
7. **ban_user** - User banning function (ACTIVE)
8. **unban_user** - User unbanning function (ACTIVE)
9. **sync_profile_from_auth** - Manual profile sync (UNUSED - REMOVE)
10. **protect_ban_columns** - Ban field protection (ACTIVE)
11. **track_user_usage** - Usage tracking (ACTIVE)
12. **update_user_tier** - Subscription management (ACTIVE)
13. **update_user_preferences** - Preference updates (UNUSED - replaced by direct SQL)
14. **get_user_complete_profile** - Profile retrieval (ACTIVE)
15. **export_user_data** - GDPR compliance (UNUSED - REVIEW)
16. **update_session_stats** - Session statistics (ACTIVE)
17. **update_session_timestamp** - Session timing (ACTIVE)
18. **get_user_recent_sessions** - Session history (ACTIVE)
19. **track_session_creation** - Session tracking (ACTIVE)
20. **calculate_and_record_message_cost** - Cost calculation (ACTIVE)
21. **recompute_image_cost_for_user_message** - Image cost recalc (ACTIVE)
22. **on_chat_attachment_link_recompute** - Attachment cost handler (ACTIVE)
23. **get_global_model_costs** - Global cost analytics (ACTIVE)
24. **get_recent_errors** - Error reporting (ACTIVE)
25. **get_user_allowed_models** - Model access check (ACTIVE)
26. **can_user_use_model** - Model permission check (ACTIVE)
27. **sync_openrouter_models** - Model synchronization (ACTIVE)
28. **update_model_tier_access** - Model tier management (ACTIVE)
29. **cleanup_old_data** - Data maintenance (ACTIVE)
30. **analyze_database_health** - Health monitoring (REVIEW)
31. **write_admin_audit** - Audit logging (ACTIVE)
32. **cleanup_cta_events** - CTA maintenance (ACTIVE)
33. **ingest_cta_event** - CTA data ingestion (ACTIVE)
34. **\_set_updated_at** - Anonymous usage timestamp (ACTIVE)
35. **ingest_anonymous_usage** - Anonymous data ingestion (ACTIVE)
36. **cleanup_anonymous_usage** - Anonymous data cleanup (ACTIVE)
37. **get_anonymous_model_costs** - Anonymous cost analytics (ACTIVE)
38. **ingest_anonymous_error** - Anonymous error logging (ACTIVE)
39. **get_anonymous_errors** - Anonymous error retrieval (ACTIVE)
40. **cleanup_anonymous_errors** - Anonymous error cleanup (ACTIVE)

### Triggers (10 total)

1. **update_profiles_updated_at** - Profile timestamp trigger (ACTIVE)
2. **on_auth_user_profile_sync** - Auth sync trigger (ACTIVE)
3. **trg_protect_ban_columns** - Ban protection trigger (ACTIVE)
4. **on_message_change** - Message update trigger (ACTIVE)
5. **on_session_updated** - Session update trigger (ACTIVE)
6. **on_session_created** - Session creation trigger (ACTIVE)
7. **after_assistant_message_cost** - Cost tracking trigger (ACTIVE)
8. **after_attachment_link_recompute_cost** - Attachment cost trigger (ACTIVE)
9. **on_anonymous_usage_update** - Anonymous usage trigger (ACTIVE)
10. **on_anonymous_model_usage_update** - Anonymous model trigger (ACTIVE)

### Views (5 total)

1. **api_user_summary** - User API summary (ACTIVE)
2. **v_sync_stats** - Sync statistics (ACTIVE)
3. **v_model_counts_public** - Public model counts (ACTIVE)
4. **v_model_sync_activity_daily** - Daily sync activity (ACTIVE)
5. **user_model_costs_daily** - Daily user costs (ACTIVE)

### Indexes (50+ performance optimization indexes) - ALL ACTIVE

### RLS Policies (100+ security policies) - ALL ACTIVE

## Key Findings

### HIGH CONFIDENCE - Unused Objects (Safe to Remove)

#### Functions to Remove

1. **`sync_profile_from_auth(user_uuid UUID)`**

   - Manual profile sync utility
   - No references in application code
   - Profile sync handled by triggers
   - **Risk**: Low - redundant functionality

2. **`update_user_preferences(user_uuid, preference_type, preferences)`**

   - Complex preference update function with JSONB merging
   - Uses `jsonb_deep_merge` internally
   - Application code uses direct UPDATE on profiles table instead
   - See `/src/app/api/user/data/route.ts` - does not call this function
   - **Risk**: Low - unused by current implementation

3. **`jsonb_deep_merge(a jsonb, b jsonb)`**
   - JSONB utility function used by `update_user_preferences`
   - Since `update_user_preferences` is unused, this is also unused
   - **Risk**: Low - can be removed with `update_user_preferences`

#### Functions Needing Future Consideration

1. **`export_user_data(user_uuid UUID)`**
   - GDPR compliance function
   - No references in admin/API code
   - May be intended for future compliance requirements
   - **Risk**: Medium - potential compliance feature

### MEDIUM CONFIDENCE - Review Required

#### Tables Needing Verification

1. **`system_cache`** - Generic caching table

   - No direct code references found
   - May be used by system functions
   - **Action**: Verify if populated in production

2. **`system_stats`** - Database health monitoring
   - Limited code references
   - May be populated by scheduled jobs
   - **Action**: Check production usage

#### Functions Needing Verification

1. **`analyze_database_health()`** - Health monitoring
   - No direct code references
   - May be used by monitoring systems
   - **Action**: Verify monitoring setup

## Cleanup Recommendations

### Phase 1: Safe Removals

```sql
-- Remove unused utility functions (CONFIRMED SAFE)
-- Application uses direct UPDATE queries on profiles table instead
DROP FUNCTION IF EXISTS public.update_user_preferences(UUID, VARCHAR(50), JSONB);
DROP FUNCTION IF EXISTS public.jsonb_deep_merge(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.sync_profile_from_auth(UUID);
```

### Phase 2: Conditional Removals (After Verification)

```sql
-- Only if GDPR compliance not needed
-- DROP FUNCTION IF EXISTS public.export_user_data(UUID);

-- Only if system monitoring not implemented
-- DROP FUNCTION IF EXISTS public.analyze_database_health();
-- DROP TABLE IF EXISTS public.system_cache CASCADE;
-- DROP TABLE IF EXISTS public.system_stats CASCADE;
```

## Manual Verification Checklist for Supabase

### Tables to Verify in Supabase SQL Editor

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables (18):
-- admin_audit_log, anonymous_error_events, anonymous_model_usage_daily,
-- anonymous_usage_daily, chat_attachments, chat_message_annotations,
-- chat_messages, chat_sessions, cta_events, message_token_costs,
-- model_access, model_sync_log, moderation_actions, profiles,
-- system_cache, system_stats, user_activity_log, user_usage_daily

-- Check if system tables have data
SELECT COUNT(*) FROM public.system_cache;
SELECT COUNT(*) FROM public.system_stats;
```

### Functions to Verify in Supabase

```sql
-- List all functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Expected functions (40) - check against list above

-- Check specific unused functions exist
SELECT COUNT(*) FROM pg_proc
WHERE proname IN ('jsonb_deep_merge', 'sync_profile_from_auth', 'export_user_data');
```

### Triggers to Verify

```sql
-- List all triggers
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY trigger_name;

-- Expected triggers (10) - check against list above
```

### Views to Verify

```sql
-- List all views
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected views (5) - check against list above
```

### Indexes to Verify

```sql
-- List all indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### RLS Policies to Verify

```sql
-- List all RLS policies
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## Impact Assessment

### Storage Savings

- **Functions**: Negligible (few KB)
- **System Tables**: 10-100KB if empty, more if populated
- **Total**: Minimal storage impact

### Performance Impact

- **Positive**: Reduced schema complexity
- **Neutral**: No query performance changes expected

### Risk Assessment

- **Phase 1**: Very Low Risk - isolated unused utilities
- **Phase 2**: Medium Risk - requires production verification

## Verification Commands for Production

Before cleanup, run these commands in production Supabase:

```sql
-- 1. Check system table usage
SELECT 'system_cache' as table_name, COUNT(*) as row_count FROM public.system_cache
UNION ALL
SELECT 'system_stats', COUNT(*) FROM public.system_stats;

-- 2. Check function usage in logs (if query logs available)
-- Look for calls to: jsonb_deep_merge, sync_profile_from_auth, export_user_data

-- 3. Verify no external tools reference these objects
-- Check admin dashboards, monitoring tools, etc.

-- 4. Test function removal in staging first
-- DROP FUNCTION IF EXISTS public.jsonb_deep_merge(jsonb, jsonb);
```

## Next Steps

1. **Manual Verification**: Check all objects exist in Supabase using above queries
2. **Production Analysis**: Verify system tables aren't populated by background jobs
3. **Staging Test**: Test removals in staging environment first
4. **Backup**: Full database backup before production changes
5. **Gradual Cleanup**: Remove objects in phases during maintenance windows

## Summary Lists for Manual Cross-Reference

### All Tables (18)

admin_audit_log, anonymous_error_events, anonymous_model_usage_daily, anonymous_usage_daily, chat_attachments, chat_message_annotations, chat_messages, chat_sessions, cta_events, message_token_costs, model_access, model_sync_log, moderation_actions, profiles, system_cache, system_stats, user_activity_log, user_usage_daily

### All Functions (40)

\_set_updated_at, analyze_database_health, ban_user, calculate_and_record_message_cost, can_user_use_model, cleanup_anonymous_errors, cleanup_anonymous_usage, cleanup_cta_events, cleanup_old_data, export_user_data, get_anonymous_errors, get_anonymous_model_costs, get_global_model_costs, get_recent_errors, get_user_allowed_models, get_user_complete_profile, get_user_recent_sessions, handle_user_profile_sync, ingest_anonymous_error, ingest_anonymous_usage, ingest_cta_event, is_admin, is_banned, jsonb_deep_merge, log_user_activity, on_chat_attachment_link_recompute, protect_ban_columns, recompute_image_cost_for_user_message, sync_openrouter_models, sync_profile_from_auth, track_session_creation, track_user_usage, unban_user, update_model_tier_access, update_session_stats, update_session_timestamp, update_updated_at_column, update_user_preferences, update_user_tier, write_admin_audit

### All Triggers (10)

after_assistant_message_cost, after_attachment_link_recompute_cost, on_anonymous_model_usage_update, on_anonymous_usage_update, on_auth_user_profile_sync, on_message_change, on_session_created, on_session_updated, trg_protect_ban_columns, update_profiles_updated_at

### All Views (5)

api_user_summary, user_model_costs_daily, v_model_counts_public, v_model_sync_activity_daily, v_sync_stats
