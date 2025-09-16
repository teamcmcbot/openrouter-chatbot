# Database Architecture

## Overview

The application uses a Supabase Postgres database. The schema is created in four phases as documented in [`database/README.md`](../../database/README.md):

1. **Phase 1 – User Management** – Profiles, activity logs and automatic Google OAuth sync.
2. **Phase 2 – Chat History** – Conversation and message tables using text IDs for client compatibility.
3. **Phase 3 – User Enhancements** – Usage analytics, tier control and model access tables.
4. **Phase 4 – System Finalization** – Preferences, cache, system stats and maintenance functions.

Each phase should be executed in order to create the full schema.

---

## Core Tables

### `profiles`

User profile information extended from `auth.users`.

- Synced automatically when a user signs in.
- Tracks subscription tier, credits and various preferences.
- Includes `account_type` ('user' | 'admin') to represent administrative role separately from `subscription_tier`.
- `update_profiles_updated_at` trigger keeps timestamps current.

### `user_activity_log`

Audit trail of user actions. Populated via the `log_user_activity` function.

### `chat_sessions`

Represents a conversation. Uses text IDs so the client can generate them. Triggers update statistics whenever messages change. Active selection is tracked client‑side only; no `is_active` column.

### `chat_messages`

Individual messages within a session. Uses text IDs and stores metadata such as tokens and completion IDs.

### `user_usage_daily`

Per‑day statistics for each user. Filled by `track_user_usage`.

### `model_access`

Defines which AI models are available to each subscription tier and associated limits.

### `model_sync_log`

Audit table for model synchronization runs (manual or scheduled). Stores start/end timestamps, counts, status, errors, duration, and `added_by_user_id` to attribute who triggered a sync. Admins can view this table via an RLS policy that checks `public.is_admin(auth.uid())`.

### (Removed) `system_cache` & `system_stats`

Removed Sept 2025 (patch `system-table-removal/001_drop_system_tables.sql`). Replaced by Redis caching and external analytics; no longer part of baseline schema.

---

## Important Functions

- `handle_user_profile_sync` – Triggered by `auth.users` to create or update a profile when the user signs in.
- `update_session_stats` & `update_session_timestamp` – Maintain session statistics.
- `get_user_recent_sessions` – Returns the latest sessions with summary info.
  (Note: legacy helper functions `get_session_with_messages` and `sync_user_conversations` were removed as unused.)
- `track_user_usage` – Records daily usage totals.
- `get_user_allowed_models` / `can_user_use_model` – Determines which models a user may access.
- `update_user_tier` – Changes a user’s subscription tier (valid values: `free`, `pro`, `enterprise`; admin privilege is managed by `profiles.account_type`).
- `get_user_complete_profile` – Returns a profile with allowed models and recent usage.
- `is_admin(p_user_id uuid)` – Helper used in RLS and server-side checks to determine if a profile is an admin based on `account_type`.
- `cleanup_old_data` – Unified retention cleanup across activity, usage, anonymous usage/model usage, anonymous errors, token cost, CTA, and model sync logs.
- `analyze_database_health` – Generates database‑wide metrics.

Removed (September 2025 cleanup): `sync_profile_from_auth`, `update_user_preferences`, helper `jsonb_deep_merge`, `export_user_data`, `api_user_summary` view, and tables `system_cache` / `system_stats` (all unused by application code).

All active functions are defined in `database/01‑04` SQL files. Removed functions were dropped from both production and schema files for clarity.

---

## Triggers

- `on_auth_user_profile_sync` – After `auth.users` insert or update, calls `handle_user_profile_sync`.
- `update_profiles_updated_at` – Before insert/update on `profiles` to maintain timestamps.
- `on_message_change` – After insert/update/delete on `chat_messages`, calls `update_session_stats`.
- `on_session_updated` – Before update on `chat_sessions` to refresh timestamps.

Row level security is enabled on all main tables to ensure users only access their own data.
Admins may view/update any profile via dedicated RLS policies. Access to `model_sync_log` is restricted to admins using the `public.is_admin(auth.uid())` helper.

---

## Application Usage

### Authentication

When a user signs in through Google OAuth, Supabase inserts into `auth.users`. The `on_auth_user_profile_sync` trigger automatically creates or updates a row in `profiles`. No API call is required for this step.

### Chat APIs

The Next.js API routes under `src/app/api/chat` interact with chat tables:

- `sessions/route.ts` creates, lists and deletes rows in `chat_sessions`.
- `messages/route.ts` fetches and inserts rows in `chat_messages` and updates session statistics.
- `sync/route.ts` bulk upserts sessions and messages using client‑generated IDs (no Postgres sync function; done via Supabase client upserts).
- `clear-all/route.ts` removes all sessions and messages for the signed‑in user.

The triggers ensure `chat_sessions` remain up‑to‑date whenever these APIs modify `chat_messages`.

### Usage Analytics and Preferences

The server calls `track_user_usage` (indirectly via triggers) to record message counts and tokens. The former `update_user_preferences` function was removed; the application updates preference columns directly where needed.

### Maintenance

Phase 4 provides maintenance utilities such as `cleanup_old_data` and `analyze_database_health`. These can be run periodically to clean logs and gather metrics.

---

## Running the SQL

Execute the scripts in `/database` sequentially (01‑04) using the Supabase SQL editor. If you need a clean start, run `00-complete-reset.sql` first. After executing all phases your database will be ready for the API routes and future analytics tools.

### Table Details and RLS

#### `profiles`

- **id** UUID primary key referencing `auth.users`.
- **email**, **full_name**, **avatar_url** – basic account info synced from Google.
- **default_model**, **temperature**, **system_prompt** – model preferences.
- **subscription_tier**, **credits** – billing data.
- **ui_preferences**, **session_preferences**, **allowed_models** – added in phases 3–4.
- **usage_stats** JSONB keeps totals for messages, tokens and sessions.
- RLS: users may select/insert/update only the row where `id = auth.uid()`.

#### `user_activity_log`

- **id** UUID primary key.
- **user_id** references `profiles(id)`.
- **action**, **resource_type**, **resource_id**, **details** track audits.
- **timestamp**, **ip_address**, **user_agent** for context.
- RLS: users can `SELECT` only their own rows.

#### `chat_sessions`

- **id** TEXT primary key so the frontend can generate IDs.
- **user_id** references `profiles(id)`.
- **title**, **created_at**, **updated_at**, **last_activity**.
- **message_count**, **total_tokens**, **last_model** for stats.
- **last_message_preview**, **last_message_timestamp** for UI.
- RLS: users can `SELECT/INSERT/UPDATE/DELETE` only where `user_id = auth.uid()`.

#### `chat_messages`

- **id** TEXT primary key.
- **session_id** references `chat_sessions(id)`.
- **role** (`user`, `assistant`, `system`) and **content**.
- **model**, **total_tokens**, **content_type**, **elapsed_time**, **completion_id**.
- **message_timestamp**, **error_message**, **is_streaming**, **metadata** JSONB.
- RLS: tied to session ownership via `session_id` check.

#### `user_usage_daily`

- Tracks per-user statistics per date.
- Columns: **user_id**, **usage_date**, message counts, token counts, model usage,
  session counts and **estimated_cost**.
- RLS: users can read and modify only rows with their `user_id`.

#### `model_access`

- Defines which models are available per subscription tier.
- Includes cost and rate‑limit fields.
- RLS: read‑only for authenticated users.

#### (Removed) `system_cache` & `system_stats`

Removed in Sept 2025 cleanup. No longer created; references in earlier docs are historical only.

Advanced policies for moderation and rate limits are provided in
`database/policies/enhanced_security.sql`.

---

## Sign‑In Flow and Data Sync

1. The user clicks **Sign in with Google** which calls `signInWithGoogle` in
   `useAuthStore` and redirects to `/auth/callback`.
2. `auth/callback` exchanges the OAuth code for a Supabase session. Supabase then
   inserts or updates a row in `auth.users`.
3. The trigger **on_auth_user_profile_sync** runs `handle_user_profile_sync`
   to create or update the matching row in **profiles**.
4. When `useAuthStore` detects the session, it sets the authenticated user and
   the `useChatSync` hook runs.
5. `useChatSync` first migrates any local conversations to include the user ID
   and calls `POST /api/chat/sync` which upserts sessions and messages.
6. It then calls `GET /api/chat/sync` to fetch the latest conversations and
   messages. These are merged into `useChatStore` and rendered on the frontend.

## Saving Conversations

- While chatting, messages are stored locally in `useChatStore`.
- After each successful send or title update, `syncConversations` is triggered to
  POST updated conversations to `/api/chat/sync`.
- The sync endpoint uses Supabase upserts to `chat_sessions` and
  `chat_messages`. Triggers update statistics automatically.
- When signing out, `clear-all/route.ts` can remove all rows for the user.

The combination of triggers, RLS policies and sync endpoints ensures that users
always see their own chat history across devices while keeping the database
secure.
