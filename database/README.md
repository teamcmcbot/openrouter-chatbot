## Functions and triggers (high level)

Note: Legacy helpers `public.get_session_with_messages` and `public.sync_user_conversations` were removed from the canonical schema in August 2025 and are no longer used by the application. A drop patch exists under `database/patches/drop-orphaned-chat-functions/` for live DB cleanup.

# 🗃️ Database Setup Guide

## Overview

Canonical SQL lives in database/schema and should be applied in order (01-users.sql → 04-system.sql). It defines:

- Main tables: profiles, chat_sessions, chat_messages, model_access
- Analytics/audit tables: user_activity_log, user_usage_daily, model_sync_log, admin_audit_log
- System tables: system_cache, system_stats
- Views: api_user_summary, v_sync_stats, v_model_counts_public, v_model_recent_activity_admin

RLS is enabled across all user-facing tables with admin-only exceptions where needed. Triggers keep profiles synced from auth.users and maintain chat session statistics/usage automatically. SECURITY DEFINER functions provide safe, privileged operations invoked by backend code. Incremental changes belong in database/patches and are merged back into database/schema after review.

## 🚀 Quick Setup

Execute these SQL files **in order** in your Supabase SQL Editor:

## Database Schema Guide

This directory contains the canonical Supabase/Postgres schema for OpenRouter Chatbot. The authoritative CREATE statements live in database/schema and should be executed in order. Incremental changes belong in database/patches; after approval they are merged back into schema.

Apply order (via Supabase SQL Editor):

- 01-users.sql
- 02-chat.sql
- 03-models.sql
- 04-system.sql

## Object inventory (by category)

Main tables

- public.profiles — User profile, preferences, tier, credits, and usage_stats
- public.chat_sessions — Conversation metadata and per-session stats
- public.chat_messages — Individual chat messages and token metrics
- public.model_access — Catalog of available AI models and tier flags

Analytics and audit tables

- public.user_activity_log — Per-action audit trail per user
- public.user_usage_daily — Daily usage aggregates per user
- public.model_sync_log — Runs and results of model sync jobs
- public.admin_audit_log — Admin/system actions (insert only via function)

System tables

- public.system_cache — Small cache for computed data with TTL
- public.system_stats — Daily platform statistics/health snapshot

Views

- public.api_user_summary — Profile + today’s usage + total sessions
- public.v_sync_stats — Admin sync KPIs (last success, success rate, durations, 24h counts)
- public.v_model_counts_public — Public aggregate counts of models by status
- public.v_model_recent_activity_admin — Daily counts of model status changes (30d)

## Row Level Security (RLS) summary

- profiles: enabled; users can read/update/insert their own; admins can read/update any
- user_activity_log: enabled; users can read their own
- user_usage_daily: enabled; users can read/insert/update their own
- chat_sessions: enabled; users can CRUD their own sessions
- chat_messages: enabled; access via owning session
- model_access: enabled + forced; all users can SELECT
- model_sync_log: enabled + forced; admins only (SELECT/INSERT/UPDATE)
- system_cache, system_stats: enabled; authenticated can SELECT; admin-only modify
- admin_audit_log: enabled + forced; admin-only SELECT; direct INSERT denied (use write_admin_audit)

## Functions and triggers

Legend

- Reads/Writes/Deletes: tables touched
- Invoked by: trigger or typical code path

User and profile functions (01-users.sql)

- jsonb_deep_merge(a jsonb, b jsonb)

  - Purpose: Pure helper to deep-merge JSONB objects
  - Reads/Writes/Deletes: none (pure)
  - Invoked by: update_user_preferences

- public.update_updated_at_column() RETURNS trigger

  - Purpose: Maintain updated_at; initialize usage_stats.last_reset on INSERT
  - Writes: profiles (NEW row before write)
  - Invoked by: BEFORE INSERT OR UPDATE ON public.profiles (trigger update_profiles_updated_at)

- public.log_user_activity(p_user_id, p_action, p_resource_type, p_resource_id, p_details) RETURNS uuid SECURITY DEFINER

  - Purpose: Append a record to user_activity_log
  - Writes: user_activity_log (INSERT)
  - Invoked by: various functions (profile sync, tier/preference updates)

- public.is_admin(p_user_id uuid) RETURNS boolean SECURITY DEFINER STABLE

  - Purpose: Check admin status based on profiles.account_type
  - Reads: profiles
  - Invoked by: RLS policies and admin-only views/functions

- public.handle_user_profile_sync() RETURNS trigger SECURITY DEFINER

  - Purpose: Upsert profile from auth.users data; dedupe frequent syncs; log profile_created/profile_synced
  - Reads: profiles, user_activity_log; source: auth.users (trigger row)
  - Writes: profiles (INSERT/UPDATE), user_activity_log (via log_user_activity)
  - Invoked by: AFTER INSERT OR UPDATE ON auth.users (trigger on_auth_user_profile_sync)

- public.sync_profile_from_auth(user_uuid) RETURNS jsonb SECURITY DEFINER

  - Purpose: Manually sync a profile from auth.users; create if missing; log action
  - Reads: auth.users, profiles
  - Writes: profiles (INSERT/UPDATE), user_activity_log (via log_user_activity)
  - Invoked by: NONE

- public.track_user_usage(p_user_id, …) RETURNS void SECURITY DEFINER

  - Purpose: Upsert today’s user_usage_daily; increment profile usage_stats; track model usage counts
  - Reads: user_usage_daily (models_used for today)
  - Writes: user_usage_daily (INSERT ON CONFLICT UPDATE), profiles (UPDATE)
  - Invoked by: update_session_stats (on message changes) and track_session_creation (on new session)

- public.update_user_tier(user_uuid, new_tier) RETURNS jsonb SECURITY DEFINER

  - Purpose: Change subscription_tier; log tier_updated
  - Writes: profiles (UPDATE), user_activity_log (via log_user_activity)
  - Invoked by: admin/backend code

- public.update_user_preferences(user_uuid, preference_type, preferences) RETURNS jsonb SECURITY DEFINER

  - Purpose: Patch UI/session/model preferences; log preferences_updated
  - Writes: profiles (UPDATE)
  - Invoked by: NONE

- public.get_user_complete_profile(user_uuid) RETURNS jsonb SECURITY DEFINER

  - Purpose: Return full profile with preferences, available models, and usage (today + last 7 days)
  - Reads: profiles, user_usage_daily; calls public.get_user_allowed_models
  - Invoked by: application/API

- public.export_user_data(user_uuid) RETURNS jsonb SECURITY DEFINER
  - Purpose: GDPR export (profile, sessions+messages, activity, usage)
  - Reads: profiles, chat_sessions, chat_messages, user_activity_log, user_usage_daily
  - Invoked by: NONE

Chat functions (02-chat.sql)

- public.update_session_stats() RETURNS trigger

  - Purpose: Recompute session counters, last preview, last model; track usage for successful messages
  - Reads: chat_messages (for the session)
  - Writes: chat_sessions (UPDATE); calls public.track_user_usage which writes user_usage_daily and profiles
  - Invoked by: AFTER INSERT/UPDATE/DELETE ON public.chat_messages (trigger on_message_change)

- public.update_session_timestamp() RETURNS trigger

  - Purpose: Touch updated_at and last_activity on session updates
  - Writes: chat_sessions (NEW row before write)
  - Invoked by: BEFORE UPDATE ON public.chat_sessions (trigger on_session_updated)

- public.get_user_recent_sessions(user_uuid, session_limit) RETURNS SETOF … SECURITY DEFINER

  - Purpose: List recent sessions for a user
  - Reads: chat_sessions
  - Invoked by: NONE

- public.get_session_with_messages(session_text_id, requesting_user_uuid) RETURNS SETOF … SECURITY DEFINER

  - Purpose: Return one session and its messages after ownership check
  - Reads: chat_sessions, chat_messages
  - Invoked by: NONE

- public.sync_user_conversations(user_uuid, conversations_data jsonb) RETURNS jsonb SECURITY DEFINER

  - Purpose: Bulk upsert sessions and messages from client data
  - Writes: chat_sessions (INSERT/UPDATE), chat_messages (INSERT/UPDATE)
  - Invoked by: sync endpoint in application/backend

- public.track_session_creation() RETURNS trigger
  - Purpose: Increment usage stats when a new session is created
  - Writes: user_usage_daily, profiles (via public.track_user_usage)
  - Invoked by: AFTER INSERT ON public.chat_sessions (trigger on_session_created)

Model functions (03-models.sql)

- public.get_user_allowed_models(user_uuid) RETURNS SETOF … SECURITY DEFINER

  - Purpose: Models available to the user based on subscription tier and status
  - Reads: profiles (tier), model_access (active models and tier flags)
  - Invoked by: application/API; also used by get_user_complete_profile

- public.can_user_use_model(user_uuid, model_to_check) RETURNS boolean SECURITY DEFINER

  - Purpose: Yes/No check for a specific model id
  - Reads: profiles, model_access
  - Invoked by: NONE

- public.sync_openrouter_models(models_data jsonb, p_added_by_user_id uuid) RETURNS jsonb SECURITY DEFINER

  - Purpose: Ingest OpenRouter model list; upsert model_access; mark missing as inactive; log run
  - Writes: model_sync_log (INSERT/UPDATE), model_access (INSERT/UPDATE, bulk INACTIVE step)
  - Invoked by: admin job/endpoint

- public.update_model_tier_access(p_model_id, flags…, p_status) RETURNS jsonb SECURITY DEFINER
  - Purpose: Admin update of model tier flags and/or status
  - Writes: model_access (UPDATE)
  - Invoked by: admin UI/endpoint

System functions and admin audit (04-system.sql)

- public.cleanup_old_data(days_to_keep integer = 90) RETURNS jsonb SECURITY DEFINER

  - Purpose: Maintenance cleanup and daily stats refresh
  - Deletes: user_activity_log (older than cutoff), user_usage_daily (older than cutoff), system_cache (expired)
  - Writes: system_stats (INSERT ON CONFLICT UPDATE)
  - Invoked by: scheduled job/cron

- public.analyze_database_health() RETURNS jsonb SECURITY DEFINER

  - Purpose: Summarize database size and table sizes with key counts
  - Reads: pg_catalog (pg_tables, database size), profiles, chat_sessions, chat_messages, user_activity_log
  - Invoked by: admin diagnostics

- public.write_admin_audit(p_actor_user_id, p_action, p_target, p_payload) RETURNS void SECURITY DEFINER
  - Purpose: Append an admin/system action to admin_audit_log (bypasses direct INSERT RLS)
  - Writes: admin_audit_log (INSERT)
  - Invoked by: admin/system backend code

Triggers

- update_profiles_updated_at — BEFORE INSERT/UPDATE ON profiles → public.update_updated_at_column
- on_auth_user_profile_sync — AFTER INSERT/UPDATE ON auth.users → public.handle_user_profile_sync
- on_message_change — AFTER INSERT/UPDATE/DELETE ON chat_messages → public.update_session_stats
- on_session_updated — BEFORE UPDATE ON chat_sessions → public.update_session_timestamp
- on_session_created — AFTER INSERT ON chat_sessions → public.track_session_creation

## Execution and verification

Run the four schema files in order. Afterward, you should see the tables: profiles, user_activity_log, user_usage_daily, chat_sessions, chat_messages, model_access, model_sync_log, system_cache, system_stats, admin_audit_log; and the views: api_user_summary, v_sync_stats, v_model_counts_public, v_model_recent_activity_admin.

## Change management

- Propose changes as SQL in database/patches/<issue_or_feature>/
- Keep patches idempotent where practical
- After review/approval, merge changes back into database/schema to keep a single-pass setup current

## Notes

- Message and session IDs are TEXT to support client-generated IDs
- SECURITY DEFINER functions should be called from trusted backend contexts (service role) due to RLS
- Indexes are created for common access patterns across profiles, chat tables, and model tables for performance

## Maintenance functions (optional, currently unused)

These database functions are available but not wired into the app yet. They’re safe to run on demand and are good candidates for admin-only endpoints or scheduled jobs.

- public.cleanup_old_data(days_to_keep integer = 90)

  - Purpose: Maintenance cleanup and daily stats refresh.
  - Deletes: user_activity_log (older than cutoff), user_usage_daily (older than cutoff), system_cache (expired).
  - Writes: system_stats (upsert for today with total users/conversations/messages).
  - Typical use: Nightly/weekly job during off-peak hours.
  - Integration options:
    - Manual run from Supabase SQL editor when needed.
    - Admin-only API endpoint that calls RPC('cleanup_old_data') with a safe default window, protected via standard middleware.
    - Scheduled job (Edge Function or external scheduler) invoking the RPC periodically.

- public.analyze_database_health()
  - Purpose: Read-only health snapshot (db size, per-table sizes, key counts, 7‑day active users).
  - Reads: pg_catalog (table sizes), profiles, chat_sessions, chat_messages, user_activity_log.
  - Typical use: On-demand diagnostics for admins or a lightweight admin dashboard widget.
  - Integration options:
    - Manual run in SQL editor to inspect JSON output.
    - Admin-only API endpoint that returns RPC('analyze_database_health') JSON.
    - Optional future: persist snapshots daily to a new table for trend analysis.

Security note: If exposing these via HTTP, use the standardized middleware (withProtectedAuth) and enforce admin checks before calling RPC.

```

```

## Other unused functions (future feature candidates)

These functions aren’t currently called by triggers, other DB functions, or application code. They’re suitable for future enhancements:

- public.sync_profile_from_auth(user_uuid)

  - Purpose: Force-sync a user’s profile from auth.users; creates profile if missing and logs the action.
  - Integrate: Admin-only API action to repair mismatched profiles; bulk maintenance tool for migrations.

- public.update_user_preferences(user_uuid, preference_type, preferences)

  - Purpose: Safely patch UI/session/model preferences with deep-merge semantics.
  - Integrate: User Settings API to save preferences; ensure call is under the authenticated user context.

- public.export_user_data(user_uuid)

  - Purpose: GDPR export of profile, sessions + messages, activity log, and usage history.
  - Integrate: Self-serve download endpoint or admin export; stream JSON to client; consider rate limiting.

- public.get_user_recent_sessions(user_uuid, session_limit)

  - Purpose: Efficient recent sessions list for dashboards/sidebars.
  - Integrate: `/api/user/recent-sessions` endpoint used by the chat sidebar.

- public.get_session_with_messages(session_text_id, requesting_user_uuid)

  - Purpose: Ownership-checked retrieval of a session and its messages in one query.
  - Integrate: Conversation detail API for server-rendered pages or export tools.

- public.sync_user_conversations(user_uuid, conversations_data)

  - Purpose: Bulk upsert client conversations/messages (offline → online sync).
  - Integrate: Sync endpoint that forwards a batched payload; add dedupe/rate-limit guards in app layer.

- public.can_user_use_model(user_uuid, model_to_check)
  - Purpose: Quick tier-based access check for a specific model.
  - Integrate: Server-side guard before initiating a model completion; useful for admin tools/tests.
