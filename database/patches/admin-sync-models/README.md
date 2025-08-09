# Admin Sync Models – Attribution & Policies Patch

This patch updates the sync function to capture the triggering admin user id and adds RLS policies so admins can write to `model_sync_log`.

Apply order

- 001_sync_log_attribution.sql

What it does

- Adds parameter `p_added_by_user_id UUID` to `public.sync_openrouter_models(models_data JSONB, p_added_by_user_id UUID DEFAULT NULL)`
- Inserts into `model_sync_log` with `added_by_user_id`
- Adds RLS policies so admins can INSERT/UPDATE `model_sync_log`

Post-apply checks

- Ensure your admin profile(s) exist with profiles.account_type = 'admin'
- Trigger a sync via POST /api/admin/sync-models
- Verify a new row in `model_sync_log` with the correct `added_by_user_id`

Rollback

- Recreate the function without the parameter if necessary
- Drop policies `Admins can insert sync logs` and `Admins can update sync logs` if you want to revert
