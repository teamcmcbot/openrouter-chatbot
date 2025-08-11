# Fix: update_user_tier boolean vs integer comparison

This patch fixes a Postgres error when calling the `public.update_user_tier(user_uuid, new_tier)` function via the admin endpoint:

> operator does not exist: boolean = integer

## Root cause

The function declared `tier_updated BOOLEAN := false;` and then used `GET DIAGNOSTICS tier_updated = ROW_COUNT;`, followed by `IF tier_updated = 0 THEN ...`. In Postgres, `ROW_COUNT` is an integer. Assigning it to a boolean and comparing against `0` causes the error above.

## Fix

- Replace the boolean with `updated_count INTEGER`.
- Compare `updated_count = 0` for the not-found branch.
- Keep the function signature and return JSON contract the same.
- Additionally, we fetch `old_tier` before the update to ensure accurate audit logging.

## Files

- `001_fix_update_user_tier.sql` – redefines the function safely (idempotent `CREATE OR REPLACE`).

## How to apply

Run this SQL in your Supabase project's SQL editor or via `psql` connected to your database. Example (psql):

```sql
\i database/patches/fix-update-user-tier-bool-compare/001_fix_update_user_tier.sql
```

## Verification steps

1. As an admin, call the API to set a user's tier to `pro`:
   - Request: `PATCH /api/admin/users` with body `{"updates":[{"id":"<uuid>","subscription_tier":"pro"}]}`
   - Expect 200/207 status and `success: true` for that id.
2. Verify DB state:
   ```sql
   select id, subscription_tier from public.profiles where id = '<uuid>';
   ```
   - Should show `subscription_tier = 'pro'`.
3. Ensure audit logs present in your `user_activity_log` (if you expose it) with action `tier_updated`.

## Rollback

If you need to revert, you can re-run the previous definition from `database/schema/01-users.sql` or restore from backup.
