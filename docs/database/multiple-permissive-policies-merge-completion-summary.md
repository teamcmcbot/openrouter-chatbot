# Multiple Permissive Policies – Merge Completion Summary

Summary

- Objective: Eliminate Supabase Performance Advisor warnings for multiple_permissive_policies by consolidating overlapping permissive RLS policies into single OR-combined policies.
- Scope: public.profiles (SELECT, UPDATE) and public.message_token_costs (SELECT, INSERT).
- Outcome: Schema now encodes single policies per action; behavior preserved; local build/tests are green.

Changes

- Consolidated policies in schema (merged from the patch set in database/patches/multiple_permissive_policies/):
  - public.profiles
    - View profiles (SELECT): public.is_admin((select auth.uid())) OR (select auth.uid()) = id
    - Update profiles (UPDATE): same predicate for USING and WITH CHECK
    - Insert policy unchanged: Users can insert their own profile
  - public.message_token_costs
    - View message costs (SELECT): public.is_admin((select auth.uid())) OR (select auth.uid()) = user_id
    - Insert message costs (INSERT): same predicate for WITH CHECK

Verification

- Local quality gates:
  - Tests: 397/397 passed
  - Build: Next.js production build succeeded
  - Lint: No new errors (3 existing test warnings)
- Functional checks (recommended in Supabase SQL editor):
  1. SELECT on profiles/message_token_costs as admin and as the row owner should succeed.
  2. UPDATE on profiles as admin and as the owner should succeed; others should be denied.
  3. INSERT into message_token_costs as admin or owner should succeed; others should be denied.
- Advisor: Re-run Performance Advisor; the multiple_permissive_policies warnings for these tables should no longer appear.

Roll-forward and Rollback

- Live rollout: Run database/patches/multiple_permissive_policies/001_fix_multiple_permissive_policies.sql
- Rollback: Use 002_rollback_multiple_permissive_policies.sql to restore split policies if needed

Notes

- Prior performance fix (auth_rls_initplan) remains in effect across all RLS policies (wrapping auth.uid()/auth.role()/current_setting in scalar subqueries), including storage schemas. No further action needed here.
