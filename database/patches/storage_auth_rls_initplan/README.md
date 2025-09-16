# storage_auth_rls_initplan – Optimize RLS on storage.objects

This patch mirrors the `auth_rls_initplan` optimization for the `storage.objects` table. It rewrites RLS policies to avoid per-row re-evaluation (initplans) of `auth.uid()`, `auth.role()`, and `current_setting(...)` by wrapping them in scalar subqueries.

## Why

Postgres/Supabase can evaluate `auth.*` and `current_setting(...)` as initplans repeatedly per row when used directly in RLS policy expressions. Wrapping them as `(select auth.uid())`, `(select auth.role())`, `(select current_setting(...))` makes them stable expressions evaluated once.

Behavior is unchanged; performance improves and Supabase Performance Advisor warnings clear.

## Files

- `001_fix_storage_auth_rls_initplan.sql` – Apply the optimization on all `storage.objects` policies
- `002_rollback_storage_auth_rls_initplan.sql` – Revert to direct calls if needed

Both scripts are idempotent and perform textual transforms only.

## Apply

1. Ensure you are connected to the target database.
2. Run `001_fix_storage_auth_rls_initplan.sql`.
3. Verify that policies on `storage.objects` now reference `(select auth.uid())` / `(select auth.role())` in USING / WITH CHECK.

## Verify

- Re-run Supabase Performance Advisor; `auth_rls_initplan` should be clear for storage.
- Optional: Inspect policies directly:

```sql
select polname, pg_get_expr(polqual, polrelid) as using, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='storage' and c.relname='objects'
order by polname;
```

You should see `(select auth.uid())`/`(select auth.role())` or `(select current_setting(...))` inside expressions where previously there were direct calls.

## Rollback

- Run `002_rollback_storage_auth_rls_initplan.sql` to unwrap the wrappers back to direct calls.

## Notes

- Our schema already includes these wrappers in `database/schema/05-storage.sql`. This patch aligns the live database with the committed schema.
- The transform also handles `current_setting(...)` variants that may appear in storage policies.
