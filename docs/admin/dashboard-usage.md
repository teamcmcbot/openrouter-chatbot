# Admin Dashboard Usage Guide

This guide explains how to access and use the Admin Dashboard features safely.

## Access

- Path: `/admin`
- Requirement: `profiles.account_type = 'admin'`
- Server-side guard blocks non-admins; client shows minimal guard for UX only

## Features

- Models Management
  - Filter by status: new/active/disabled
  - Search and sort
  - Bulk edit: status and flags (is_free / is_pro / is_enterprise)
  - View details: pricing, context length, last_synced, metadata
  - Trigger manual sync (calls `/api/admin/sync-models`)
- Users Management (scoped)
  - List users with account_type and subscription_tier
  - Promote/demote admin; edit subscription_tier; adjust credits (scoped operations)
- Sync Controls
  - View current sync status
  - Manually trigger a sync (admin only)
- Attachments Cleanup
  - Remove orphaned image uploads (older than cutoff) from Storage and soft-delete rows
  - Run via the Attachments tab; see [Attachments Cleanup](./attachments-cleanup.md) for setup and details
  - Can also be scheduled via internal endpoint; see [Internal Attachments Cleanup](../api/internal-attachments-cleanup.md)

## Expected Outcomes

- Manual sync returns `X-Sync-Log-ID` header and updates `public.model_sync_log`
- Models table reflects new/updated/inactive transitions after sync
- User changes are immediately visible in their profile data

## Safety & Permissions

- Admin-only routes are protected with `withAdminAuth`
- Internal scheduled sync uses `/api/internal/sync-models` (HMAC or Bearer), not cookies
- No user message content is exposed in the dashboard

## Verification Steps

- Visit `/admin` as admin: page loads; as non-admin: access denied
- Click "Trigger Sync": success toast; check DB: latest row in `model_sync_log`
- Apply a bulk model status update: verify counts and flags change as expected

## Troubleshooting

- If sync is blocked: you may see a 409 due to an existing run; wait and retry
- If admin access fails: confirm `profiles.account_type = 'admin'`
- For internal sync testing: see `docs/api/internal-sync-models.md`
