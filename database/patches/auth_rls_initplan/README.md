# auth_rls_initplan hardening

Optimizes RLS policies by avoiding per-row re-evaluation of `auth.*` and `current_setting()`.

- What it does: Rewrites USING/WITH CHECK to wrap `auth.*()` and `current_setting()` calls with scalar subqueries.
- Why: The planner treats `(select ...)` as stable per-statement, avoiding initplan re-evaluation per row. This can materially improve performance on large tables.
- Impact: No behavior change; only evaluation strategy changes.

## Scope (from Performance Advisor)

public tables:

- profiles
- user_activity_log
- chat_sessions
- chat_messages
- user_usage_daily
- model_sync_log
- admin_audit_log
- message_token_costs
- chat_attachments
- chat_message_annotations
- cta_events
- anonymous_usage_daily
- anonymous_model_usage_daily
- anonymous_error_events
- moderation_actions

## Files

- `001_fix_auth_rls_initplan.sql` — applies the wrapping
- `002_rollback_auth_rls_initplan.sql` — removes the wrapping (optional rollback)

## Apply

Run `001_fix_auth_rls_initplan.sql` in Supabase SQL editor or your migration tooling.

## Verify

- Re-run the Performance Advisor; warnings with key `auth_rls_initplan_*` should clear.
- Optionally: run EXPLAIN on frequent queries to see improved plans.

## Rollback

Run `002_rollback_auth_rls_initplan.sql` if needed.
