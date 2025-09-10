# Database Schema Cleanup Analysis

**Date:** September 10, 2025  
**Status:** Pre-production cleanup analysis  
**Scope:** Complete database schema audit for unused objects

## Executive Summary

This analysis identifies **unused database objects** across all schemas that should be removed before production deployment. The analysis cross-references schema definitions with actual codebase usage to identify orphaned objects.

Update (Sept 10 2025 - post-cleanup): Functions `jsonb_deep_merge`, `sync_profile_from_auth`, and `update_user_preferences` were removed from schema & documentation after validation of zero application references.

> Historical Note: A prior analysis file `database-clean-up.md` dated December 30, 2024 listed initial inventory (18 tables, 40 functions, 10 triggers, 5 views) and early removal candidates. Its unique historical recommendations have been consolidated here; that file is now deprecated and removed.

## Analysis Methodology

1. **Schema Extraction**: Analyzed all schema files in `/database/schema/`
2. **Codebase Scanning**: Searched all TypeScript/JavaScript files for database references
3. **Cross-Reference**: Identified objects defined in schema but not used in code
4. **Patch Verification**: Reviewed patches to identify removed functionality

## Findings: Unused Database Objects

### 🔴 CRITICAL CLEANUP REQUIRED (Post-removal state)

#### Tables - Completely Unused

None found - all tables are actively used.

#### Functions - Unused/Obsolete

1. **`public.export_user_data`** ❌ UNUSED

   - **Location**: `01-users.sql`
   - **Purpose**: GDPR data export functionality
   - **Status**: No API endpoints or code references
   - **Action**: REMOVE - GDPR export not implemented in UI/API

2. **`public.get_session_with_messages`** ❌ REMOVED IN PATCHES

   - **Location**: Mentioned in `02-chat.sql` comments as "removed"
   - **Status**: Function was removed but may still have references
   - **Action**: VERIFY removal is complete

3. **`public.sync_user_conversations`** ❌ REMOVED IN PATCHES

   - **Location**: Mentioned in `02-chat.sql` comments as "removed"
   - **Status**: Function was removed but may still have references
   - **Action**: VERIFY removal is complete

4. **`public.get_error_count`** ❌ PATCH NOT MERGED TO MAIN SCHEMA
   - **Location**: Called in `src/app/api/admin/analytics/performance/route.ts`
   - **Patch Location**: `database/patches/admin-analytics-fixes/002_admin_error_functions.sql`
   - **Status**: Function exists in patch but not merged into main schema files
   - **Action**: MERGE patch into main schema or apply patch in deployment

#### Views - Potentially Unused

1. **`public.api_user_summary`** ⚠️ QUESTIONABLE
   - **Location**: `04-system.sql`
   - **Purpose**: Comprehensive user view for API
   - **Status**: No direct `.from('api_user_summary')` calls found
   - **Action**: INVESTIGATE - May be used indirectly or remove if obsolete

#### System Tables - Underutilized

1. **`public.system_cache`** ⚠️ MINIMAL USAGE

   - **Location**: `04-system.sql`
   - **Purpose**: Application-level caching
   - **Status**: Only used in cleanup functions, no active caching found
   - **Action**: REMOVE if caching isn't implemented

2. **`public.system_stats`** ⚠️ MINIMAL USAGE
   - **Location**: `04-system.sql`
   - **Purpose**: System statistics tracking
   - **Status**: Only populated by cleanup functions, no API exposure
   - **Action**: REMOVE if not used for monitoring

### 🟡 REVIEW REQUIRED

#### Tables - Review Usage Pattern

1. **`public.user_activity_log`** - Heavy write, limited read

   - **Usage**: Extensive logging via `log_user_activity()` function
   - **API Exposure**: No direct user-facing endpoints
   - **Retention**: Used in `cleanup_old_data()` with 90-day retention
   - **Action**: VERIFY if logs are actually consumed anywhere

2. **`public.moderation_actions`** - Admin-only audit trail
   - **Usage**: Populated by ban/unban functions
   - **API Exposure**: No API endpoints to view moderation history
   - **Action**: VERIFY if admin UI consumes this data

#### Storage Policies - Overly Specific

1. **Storage bucket policies** in `05-storage.sql`
   - **Issue**: Very specific to `attachments-images` bucket
   - **Action**: CONSOLIDATE or generalize if more storage buckets are planned

### 🟢 CONFIRMED ACTIVE

#### Heavily Used Core Objects

- `profiles` - User management (✓ Active)
- `chat_sessions` - Conversation management (✓ Active)
- `chat_messages` - Message storage (✓ Active)
- `chat_attachments` - Image attachments (✓ Active)
- `chat_message_annotations` - URL citations (✓ Active)
- `model_access` - Model configuration (✓ Active)
- `model_sync_log` - Model sync tracking (✓ Active)
- `message_token_costs` - Cost tracking (✓ Active)
- `user_usage_daily` - Usage analytics (✓ Active)
- `anonymous_usage_daily` - Anonymous analytics (✓ Active)
- `anonymous_error_events` - Anonymous error tracking (✓ Active)
- `cta_events` - CTA analytics (✓ Active)
- `admin_audit_log` - Admin action auditing (✓ Active)

#### Essential Functions (In Use)

- `is_admin()` - Authorization (✓ Used extensively)
- `is_banned()` - User status checks (✓ Used in middleware)
- `ban_user()` / `unban_user()` - Moderation (✓ Admin API)
- `get_user_allowed_models()` - Model access (✓ Model selection)
- `can_user_use_model()` - Model permissions (✓ Chat validation)
- `sync_openrouter_models()` - Model sync (✓ Admin sync)
- `track_user_usage()` - Analytics (✓ Usage tracking)
- `get_user_complete_profile()` - User data (✓ Settings API)
- `update_user_tier()` - User management (✓ Admin API)
- `update_model_tier_access()` - Model management (✓ Admin API)
- `ingest_anonymous_usage()` - Anonymous tracking (✓ Analytics API)
- `ingest_anonymous_error()` - Error tracking (✓ Error API)
- `ingest_cta_event()` - CTA tracking (✓ Analytics API)

## Recommended Actions

### Phase 1: Safe Removals (Immediate)

```sql
-- Already removed:
--   jsonb_deep_merge(jsonb, jsonb)
--   sync_profile_from_auth(uuid)
--   update_user_preferences(uuid, varchar, jsonb)

-- Pending removal (safe; no references):
DROP FUNCTION IF EXISTS public.export_user_data(uuid);

-- Potential removal (after verification):
-- DROP VIEW IF EXISTS public.api_user_summary;
```

### Phase 2: System Table Assessment (Review)

1. **Investigate `system_cache` usage**

   - If not implementing application caching, remove table
   - If keeping, ensure cleanup functions work correctly

2. **Investigate `system_stats` usage**

   - If not used for monitoring dashboards, remove table
   - If keeping, create API endpoints to expose data

3. **Review activity logging**
   - Confirm if `user_activity_log` data is consumed
   - Consider reducing retention period if storage is concern

### Phase 3: Apply Missing Patches

```sql
-- OPTION 1: Merge patch content into main schema files
-- Add the functions from database/patches/admin-analytics-fixes/002_admin_error_functions.sql
-- to database/schema/02-chat.sql

-- OPTION 2: Ensure patch is applied during deployment
-- Verify that admin-analytics-fixes patches are included in deployment pipeline
```

### Phase 4: Documentation Update

1. Update schema documentation to reflect removals
2. Update API documentation if any endpoints are affected
3. Add comments to remaining functions explaining their usage

## Risk Assessment

### Low Risk Removals ✅ (Updated)

- `jsonb_deep_merge` - Removed
- `sync_profile_from_auth` - Removed
- `update_user_preferences` - Removed (unused)
- `export_user_data` - Still present, safe to remove

### Medium Risk Reviews ⚠️

- `system_cache` / `system_stats` - May affect monitoring
- `api_user_summary` - May have indirect dependencies

### High Risk Issues ❌

- `get_error_count` - Patch not merged to main schema (breaks admin analytics if patch not applied)

## Storage Optimization Opportunities

1. **Index Review**: Some indexes may be over-specific
2. **Retention Policies**: Consider shorter retention for logs
3. **Archive Strategy**: Implement archival for old cost/usage data

## Schema Synchronization Issues

### 🚨 PATCHES NOT MERGED TO MAIN SCHEMA

Several patches contain function updates that haven't been merged back into the main schema files:

1. **Admin Analytics Functions** (`admin-analytics-fixes/`)
   - `get_error_count()` - Used in performance analytics API
   - `get_recent_errors()` - Enhanced error reporting with model enrichment
2. **Enhanced Functions** (Multiple patches)
   - Various function improvements for cost tracking, analytics, and user management
   - Main schema may have older versions of these functions

**Recommendation**: Before production deployment, merge all applied patch functions back into main schema files to ensure fresh deployments have complete functionality.

## Conclusion

The database schema is generally well-maintained with most objects actively used. The main issues are now:

1. Remaining unused function `export_user_data`
2. Schema-patch synchronization (e.g. `get_error_count`)
3. Potentially unnecessary system tables (`system_cache`, `system_stats`)
4. Activity logging volume (review retention)

**Estimated storage savings**: 5-10% (primarily from removing unused indexes and functions)

**Estimated maintenance reduction**: Moderate (fewer objects to maintain, cleaner schema)

**Risk level**: Medium (patch synchronization issues could cause deployment problems)

---

**Next Steps**:

1. **CRITICAL**: Sync all patch functions into main schema files before production
2. Get approval for Phase 1 safe removals
3. Investigate system table usage patterns
4. Create deployment script to ensure schema consistency
5. Test all changes in development environment first

---

## Appendix A: Archived 2024 Analysis Snapshot (Read-Only)

This appendix preserves key portions of the December 30, 2024 snapshot (now removed) for traceability. Items already actioned are annotated.

### 2024 Unused Function Candidates (All Addressed)

- sync_profile_from_auth (removed 2025)
- update_user_preferences (removed 2025)
- jsonb_deep_merge (removed 2025)
- export_user_data (still pending removal decision)

### 2024 System Tables Under Review

- system_cache (still under review)
- system_stats (still under review)

### 2024 Notes

- GDPR export function kept then for potential compliance; remains unused.
- Preference handling migrated to direct column updates—DB function not reinstated.

End of appendix.
