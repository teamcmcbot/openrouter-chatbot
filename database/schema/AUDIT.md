# Database Schema Audit Report

This document summarizes the merging of SQL scripts into the final schema files located in `/database/schema/`.

## Final Schema Files

1.  `01-users.sql`: User profiles, activity logs, usage tracking, and related functions/policies.
2.  `02-chat.sql`: Chat sessions, messages, and related functions/policies.
3.  `03-models.sql`: Model access control, sync logs, and related functions/policies.
4.  `04-system.sql`: System cache, statistics, health checks, and utility functions.

---

## Merged Changes Details

### Tables

#### `profiles`

- **Source Files**: `01-complete-user-management.sql`, `03-complete-user-enhancements.sql`, `04-complete-system-final.sql`, `05-model-access-migration.sql`
- **Merged Changes**:
  - Initial creation from `01-complete-user-management.sql`.
  - Columns `allowed_models`, `ui_preferences`, `session_preferences` added via `ALTER TABLE` in `03-complete-user-enhancements.sql`. These are now part of the main `CREATE TABLE` statement.
  - `ui_preferences` and `session_preferences` defaults were enhanced in `04-complete-system-final.sql`; these enhanced defaults are now in the `CREATE TABLE`.
  - The `allowed_models` column was removed in `05-model-access-migration.sql` as model access is now managed by the `model_access` table.
  - `default_model` column was made nullable and its default was dropped in `05-model-access-migration.sql`.
- **Final Definition**: `database/schema/01-users.sql`

#### `user_activity_log`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation. No `ALTER TABLE` statements affecting its structure in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `user_usage_daily`

- **Source Files**: `03-complete-user-enhancements.sql`
- **Merged Changes**: Initial creation in `03-complete-user-enhancements.sql`.
- **Final Definition**: `database/schema/01-users.sql`

#### `chat_sessions`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation. No structural changes in subsequent files.
- **Final Definition**: `database/schema/02-chat.sql`

#### `chat_messages`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation. No structural changes in subsequent files.
- **Final Definition**: `database/schema/02-chat.sql`

#### `model_access`

- **Source Files**: `03-complete-user-enhancements.sql`, `05-model-access-migration.sql`
- **Merged Changes**:
  - Initially created in `03-complete-user-enhancements.sql` with a simpler structure (`model_id`, `tier`, `is_active`, etc.).
  - Completely dropped and recreated in `05-model-access-migration.sql` with a much more detailed schema to align with OpenRouter API data (e.g., `model_name`, `description`, `pricing`, `architecture`, `is_free`/`is_pro`/`is_enterprise` flags instead of a single `tier` column).
- **Final Definition**: `database/schema/03-models.sql` (reflects the new structure from `05-model-access-migration.sql`).

#### `model_sync_log`

- **Source Files**: `05-model-access-migration.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/03-models.sql`

#### `system_cache`

- **Source Files**: `04-complete-system-final.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/04-system.sql`

#### `system_stats`

- **Source Files**: `04-complete-system-final.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/04-system.sql`

---

### Functions

#### `update_updated_at_column()`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation. No changes in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `log_user_activity()`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation. No changes in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `handle_user_profile_sync()`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation. No changes in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `sync_profile_from_auth()`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation. No changes in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `track_user_usage()`

- **Source Files**: `03-complete-user-enhancements.sql`
- **Merged Changes**: Initial creation. No changes in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `get_user_allowed_models()`

- **Source Files**: `03-complete-user-enhancements.sql`, `05-model-access-migration.sql`, `06-model-access-functions.sql`
- **Merged Changes**:
  - Initially created in `03-complete-user-enhancements.sql` to work with the old `model_access` table structure (using `tier`).
  - Dropped in `05-model-access-migration.sql` due to `model_access` table recreation.
  - Recreated in `06-model-access-functions.sql` with a new implementation to work with the new `model_access` table structure (using `is_free`, `is_pro`, `is_enterprise` flags and `status`).
- **Final Definition**: `database/schema/03-models.sql` (reflects the latest implementation from `06-model-access-functions.sql`).

#### `can_user_use_model()`

- **Source Files**: `03-complete-user-enhancements.sql`, `05-model-access-migration.sql`, `06-model-access-functions.sql`
- **Merged Changes**:
  - Initially created in `03-complete-user-enhancements.sql` for the old `model_access` structure.
  - Dropped in `05-model-access-migration.sql`.
  - Recreated in `06-model-access-functions.sql` for the new `model_access` structure.
- **Final Definition**: `database/schema/03-models.sql` (latest implementation).

#### `update_user_tier()`

- **Source Files**: `03-complete-user-enhancements.sql`
- **Merged Changes**: Initial creation. No changes in subsequent files.
- **Final Definition**: `database/schema/01-users.sql`

#### `update_user_preferences()`

- **Source Files**: `04-complete-system-final.sql`, `05-model-access-migration.sql`, `06-model-access-functions.sql`
- **Merged Changes**:
  - Initially created in `04-complete-system-final.sql`. This version handled `ui`, `session`, and `model` preferences, including updating `profiles.allowed_models`.
  - Dropped in `05-model-access-migration.sql` (due to `model_access` changes and `profiles.allowed_models` removal).
  - Recreated in `06-model-access-functions.sql` with a modified logic for the `model` preference type, removing the update to `allowed_models` array as that column was removed from `profiles`.
- **Final Definition**: `database/schema/01-users.sql` (latest implementation, with `jsonb_deep_merge` helper included).

#### `get_user_complete_profile()`

- **Source Files**: `04-complete-system-final.sql`, `05-model-access-migration.sql`, `06-model-access-functions.sql`
- **Merged Changes**:
  - Initially created in `04-complete-system-final.sql`. It included `profiles.allowed_models` in the output.
  - Dropped in `05-model-access-migration.sql`.
  - Recreated in `06-model-access-functions.sql`. The new version fetches allowed models by calling `get_user_allowed_models()` and no longer includes the (removed) `profiles.allowed_models` field directly.
- **Final Definition**: `database/schema/01-users.sql` (latest implementation).

#### `export_user_data()`

- **Source Files**: `04-complete-system-final.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/01-users.sql`

#### `update_session_stats()`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation. The call to `track_user_usage` within this function correctly uses the version defined in `01-users.sql`.
- **Final Definition**: `database/schema/02-chat.sql`

#### `update_session_timestamp()`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/02-chat.sql`

#### `get_user_recent_sessions()`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/02-chat.sql`

#### `get_session_with_messages()`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/02-chat.sql`

#### `sync_user_conversations()`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/02-chat.sql`

#### `sync_openrouter_models()`

- **Source Files**: `06-model-access-functions.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/03-models.sql`

#### `update_model_tier_access()`

- **Source Files**: `06-model-access-functions.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/03-models.sql`

#### `cleanup_old_data()`

- **Source Files**: `04-complete-system-final.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/04-system.sql`

#### `analyze_database_health()`

- **Source Files**: `04-complete-system-final.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/04-system.sql`

---

### Triggers

#### `update_profiles_updated_at`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/01-users.sql`

#### `on_auth_user_profile_sync`

- **Source Files**: `01-complete-user-management.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/01-users.sql`

#### `on_message_change`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/02-chat.sql`

#### `on_session_updated`

- **Source Files**: `02-complete-chat-history.sql`
- **Merged Changes**: Initial creation.
- **Final Definition**: `database/schema/02-chat.sql`

---

### Views

#### `api_user_summary`

- **Source Files**: `04-complete-system-final.sql`, `05-model-access-migration.sql`
- **Merged Changes**:
  - Initially created in `04-complete-system-final.sql`. It selected from `profiles.allowed_models`.
  - Dropped in `05-model-access-migration.sql` due to schema changes.
  - Recreated in `06-model-access-functions.sql` (implicitly, as it was part of the functions to be recreated). The new version correctly omits the non-existent `allowed_models` column from `profiles`.
- **Final Definition**: `database/schema/04-system.sql`

---

### RLS Policies

- All RLS policies from their respective source files have been consolidated into the final schema files where their corresponding tables are defined.
- For example, policies for `profiles` are in `01-users.sql`, policies for `chat_sessions` and `chat_messages` are in `02-chat.sql`, and so on.
- No conflicts or removals of policies were necessary beyond those implicitly handled by table drops and recreations (e.g., for `model_access`).

---

### Ignored Items

- **Verification/Do Blocks**: All `DO $$ ... END;` blocks used for verification or setup completion messages in the original files (e.g., at the end of `01-complete-user-management.sql`, `02-complete-chat-history.sql`, etc.) have been omitted. These are for script execution feedback, not schema definition.
- **Data Manipulation**: No explicit `UPDATE`, `INSERT`, or `DELETE` statements (other than `ON CONFLICT DO UPDATE` for seed data or `INSERT ... ON CONFLICT` for upserts) were present in the migration scripts that needed to be ignored for schema finalization.
- **`07-model-access-verification.sql`**: This entire file was ignored as per the requirements, as it contained verification logic and temporary scripts not part of the final schema.
- **`model_access_backup` table**: The creation of `model_access_backup` in `05-model-access-migration.sql` was a temporary step for the migration and is not included in the final schema.

---

## Summary of Key Structural Changes

1.  **`profiles` Table Evolution**:

    - Merged `ALTER TABLE` additions for preference columns.
    - Removed `allowed_models` column, shifting model access logic entirely to the `model_access` table.

2.  **`model_access` Table Overhaul**:

    - The table was significantly refactored from a tier-based system to a more flexible flag-based system (`is_free`, `is_pro`, `is_enterprise`) and enriched with fields mirroring the OpenRouter API.
    - Functions depending on it (`get_user_allowed_models`, `can_user_use_model`, `update_user_preferences`, `get_user_complete_profile`, `api_user_summary`) were updated accordingly, with their latest versions retained.

3.  **Function Consolidation**:

    - Functions were recreated with the same name but updated logic to adapt to schema changes, primarily around `model_access`. The final versions represent the most up-to-date logic.

4.  **System Tables**:
    - `system_cache` and `system_stats` were added to provide system-level monitoring and caching capabilities.

The final schema in `/database/schema/` represents a clean, bootstrappable version of the database, incorporating all evolutionary changes from the migration scripts without the intermediate `ALTER` statements or temporary objects.
