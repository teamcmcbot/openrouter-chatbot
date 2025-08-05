# Supabase Lint Review

## Overview
This report reviews Supabase database linter findings (performance and security) against the current schema files. It provides recommendations on whether to address each issue or ignore it for now.

## Warnings
### Auth RLS Initialization Plan
Repeated calls to `auth.*` functions in row level security policies can be evaluated once per statement by wrapping them in a subquery: `(select auth.uid())`.

- **profiles**: Policies use `auth.uid()` directly. Recommend updating to subquery form for better performance【F:database/schema/01-users.sql†L136-L143】
- **user_activity_log**: Same pattern; update policy accordingly【F:database/schema/01-users.sql†L146-L147】
- **chat_sessions**: Policies reference `auth.uid()` directly. Replace with `(select auth.uid())` to avoid per‑row evaluation【F:database/schema/02-chat.sql†L105-L115】
- **chat_messages**: Policies rely on `auth.uid()` inside subqueries; wrap in `select` for efficiency【F:database/schema/02-chat.sql†L118-L147】
- **user_usage_daily**: Policies use `auth.uid()` directly. Switch to `(select auth.uid())`【F:database/schema/01-users.sql†L150-L157】
- **model_sync_log**: Admin check calls `auth.uid()`; using a subquery will cache the result per statement【F:database/schema/03-models.sql†L116-L123】

## Informational Findings
### Missing Primary Keys
The linter flagged several tables without primary keys (`total_functions`, `total_policies`, `model_access_backup`, `total_tables`, `total_users`, `total_models`)【4fce9c†L2-L7】. These tables are not present in the current schema and appear to be leftover artifacts. No action needed.

### Unused Indexes
| Index | Recommendation |
|-------|----------------|
| `idx_system_cache_expires` on `system_cache` | Keep. Supports cleanup queries for expired cache entries【F:database/schema/04-system.sql†L52】 |
| `idx_system_stats_date` on `system_stats` | Keep. Useful for future stats queries by date【F:database/schema/04-system.sql†L55】 |
| `idx_profiles_email` on `profiles` | Keep. Likely needed for lookups by email in authentication flows【F:database/schema/01-users.sql†L113】 |
| `idx_profiles_last_active` on `profiles` | Consider removing; no current queries depend on `last_active` ordering or filtering【F:database/schema/01-users.sql†L114】 |
| `idx_chat_messages_user_message_id` on `chat_messages` | Keep for potential linkage between user and assistant messages【F:database/schema/02-chat.sql†L89-L91】 |
| `idx_chat_sessions_updated_at` on `chat_sessions` | Keep; API queries order by `updated_at` and benefit from this index【F:database/schema/02-chat.sql†L81】【F:src/app/api/chat/sessions/route.ts†L21-L25】 |
| `idx_model_access_last_synced` on `model_access` | Keep; supports admin sync operations【F:database/schema/03-models.sql†L100】 |
| `idx_model_access_openrouter_seen` on `model_access` | Keep for tracking when models were last seen on OpenRouter【F:database/schema/03-models.sql†L101】 |

## Summary
- Update RLS policies to wrap `auth.*` calls in subqueries to reduce per‑row evaluation overhead.
- No action required for missing primary key warnings, as the referenced tables are absent.
- Maintain most indexes; consider dropping `idx_profiles_last_active` if no future use is planned.
