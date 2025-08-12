-- Development Reset Script
-- Purpose: Clean all conversational & related analytic tables for a fresh dev environment.
-- WARNING: Irreversible data deletion. Do NOT run in production.
-- Suggested usage: psql -f dev_reset_conversations.sql (ensure correct database)

BEGIN;

-- Order matters due to FK dependencies.
-- 1. Cost table (depends on messages/sessions)
TRUNCATE TABLE public.message_token_costs RESTART IDENTITY CASCADE;

-- 2. Chat messages & sessions
TRUNCATE TABLE public.chat_messages RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.chat_sessions RESTART IDENTITY CASCADE;

-- 3. Daily usage (token/message aggregates)
TRUNCATE TABLE public.user_usage_daily RESTART IDENTITY CASCADE;

-- 4. Activity logs (optional - comment out if you want to keep audit trail)
-- TRUNCATE TABLE public.user_activity_log RESTART IDENTITY CASCADE;

-- 5. (Optional) Model sync logs only if you want a pristine model state (keep model_access rows)
-- TRUNCATE TABLE public.model_sync_log RESTART IDENTITY CASCADE;

COMMIT;

-- Post-run: Consider re-syncing models if sync log truncated.
