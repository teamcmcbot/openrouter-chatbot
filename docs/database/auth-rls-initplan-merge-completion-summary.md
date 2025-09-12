# RLS initplan optimization merged into schema

Date: 2025-09-12

Summary

- Merged the live DB patch (database/patches/auth_rls_initplan) into canonical schema files so new environments inherit the performance fix.
- Wrapped auth.uid() and auth.role() calls in RLS USING / WITH CHECK expressions with scalar subqueries to avoid per-row initplan re-evaluation.
- No behavior changes; only performance hardening. Verified earlier in live DB (Advisor warnings cleared).

Files updated

- database/schema/01-users.sql
- database/schema/02-chat.sql
- database/schema/03-models.sql
- database/schema/04-system.sql (dynamic policy EXECUTEs)
- database/schema/05-storage.sql (Supabase Storage policies)
- database/schema/06-anonymous.sql (dynamic policy EXECUTEs)

What changed (pattern)

- auth.uid() -> (select auth.uid())
- auth.role() -> (select auth.role())
- public.is_admin(auth.uid()) -> public.is_admin((select auth.uid()))

How to verify

- Deploy schema or run the Advisors against a fresh environment; auth_rls_initplan warnings should be 0.
- Smoke test CRUD under normal roles:
  - Authenticated user can read/write own rows for profiles, chat\*, message_token_costs.
  - Admin can read admin-only tables (model*sync_log, admin_audit_log, anonymous*\*).
  - Supabase Storage bucket attachments-images policies behave unchanged for owner.

Notes

- No change to function bodies or privileges besides the wrapper in policy expressions.
- Optional future work: consolidate duplicate permissive policies where practical.
