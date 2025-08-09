# Admin role & scheduler patch

This patch introduces:

- profiles.account_type ('user'|'admin') with default 'user'
- Helper function public.is_admin(uuid)
- RLS policy updates to use account_type for admin-only access to model_sync_log
- Optional attribution column on model_sync_log.added_by_user_id
- update_user_tier() tightened to exclude 'admin' as a subscription tier

Apply order: single file, idempotent.

Post-apply checks:

- Verify profiles has account_type NOT NULL default 'user'
- Ensure model_sync_log policy works for admin and denies regular users
- Confirm update_user_tier rejects 'admin' and accepts ('free','pro','enterprise')

Follow-ups (separate patches):

- Add withAdminAuth middleware and update API routes to use account_type
- Create internal scheduled sync endpoint (HMAC/service token)
- Consider admin-specific RLS for model_access updates or use service role
