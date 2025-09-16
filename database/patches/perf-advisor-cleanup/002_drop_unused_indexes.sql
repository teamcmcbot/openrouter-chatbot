-- Drop candidate unused indexes flagged by Performance Advisor.
-- IMPORTANT: Run only after verifying zero usage in production over a representative window
-- (e.g., 7–30 days) using pg_stat_user_indexes.idx_scan = 0 and confirming access paths.

-- Chat messages optional flags
DROP INDEX IF EXISTS public.idx_chat_messages_has_websearch_true;  -- optional, flagged unused
DROP INDEX IF EXISTS public.idx_chat_messages_websearch_count;     -- optional, flagged unused
DROP INDEX IF EXISTS public.idx_chat_messages_has_attachments_true; -- optional, flagged unused

-- DROP INDEX IF EXISTS public.idx_chat_sessions_updated_at; -- redundant vs idx_chat_sessions_user_updated (defer)

-- Profiles: keep for now (possible admin lookups). Drop only with strong evidence of long-term zero scans.
-- DROP INDEX IF EXISTS public.idx_profiles_email;
-- DROP INDEX IF EXISTS public.idx_profiles_last_active;
-- DROP INDEX IF EXISTS public.idx_profiles_is_banned_true;
-- DROP INDEX IF EXISTS public.idx_profiles_banned_until;

-- Model access recency
-- Keep for now; admin sync UIs may sort by recency.
-- DROP INDEX IF EXISTS public.idx_model_access_last_synced;

-- Anonymous analytics
-- Keep for now; admin analytics read paths benefit from these indexes.
-- DROP INDEX IF EXISTS public.idx_anonymous_model_usage_daily_model;
-- DROP INDEX IF EXISTS public.idx_anonymous_usage_daily_date;
-- DROP INDEX IF EXISTS public.idx_anonymous_usage_daily_session;
-- DROP INDEX IF EXISTS public.idx_anon_errors_time;
-- DROP INDEX IF EXISTS public.idx_anon_errors_model_time;
-- DROP INDEX IF EXISTS public.idx_anon_errors_hash_time;

-- CTA events
-- Keep for now; analytics queries may filter by page/cta or user.
-- DROP INDEX IF EXISTS public.idx_cta_events_page_cta;
-- DROP INDEX IF EXISTS public.idx_cta_events_user;

-- Admin audit log
-- Keep for now; useful when filtering by actor or action in admin tools.
-- DROP INDEX IF EXISTS public.idx_admin_audit_log_actor;
-- DROP INDEX IF EXISTS public.idx_admin_audit_log_action;

-- Message token costs (websearch cost-specific index)
-- DROP INDEX IF EXISTS public.idx_message_token_costs_websearch_cost; -- flagged unused; keep pending verification (reporting)

-- Moderation actions
-- Keep for now; commonly used for per-user timeline views.
-- DROP INDEX IF EXISTS public.idx_moderation_actions_user_date;
