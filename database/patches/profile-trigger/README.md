# Profile Trigger Patch

This patch ensures user profiles are provisioned and kept in sync with `auth.users`:

- Creates an idempotent trigger `trg_sync_profile_on_auth_users` on `auth.users` that calls `public.handle_user_profile_sync()` on INSERT/UPDATE.
- Backfills missing `public.profiles` rows for any existing users.

Why: First-time sign-in was failing with 406/500 because a profile row might not exist yet when `/api/user/data` runs. The trigger guarantees a profile exists immediately after auth.

Verification

1. Apply to local: `supabase db reset` or re-run migrations.
2. Sign in with a new user.
3. Confirm a `profiles` row is created and `/api/user/data` responds 200.
4. Update email in `auth.users` (simulate), verify profile email syncs and an activity log is written.

Rollback

- Drop trigger if needed:
  `DROP TRIGGER IF EXISTS trg_sync_profile_on_auth_users ON auth.users;`

Notes

- The trigger relies on existing `public.handle_user_profile_sync()` function.
- Patch is idempotent and safe to re-run.
