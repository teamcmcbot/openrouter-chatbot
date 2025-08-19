# Attachments Cleanup (Admin)

Admin-only tool to remove orphaned image uploads from Supabase Storage and soft-delete their database rows.

## Overview

- Location: `/admin` → Attachments tab → "Run Orphan Cleanup"
- Purpose: Free storage by deleting images that were uploaded but never linked to a message/session.
- Safety: Uses a cutoff window (default 24h) to avoid deleting in-flight drafts.
- DB effect: Sets `chat_attachments.status = 'deleted'`, `deleted_at = now()`.
- Storage: Removes objects from the `attachments-images` bucket by their `storage_path`.

## Requirements

Server environment variables (server-only, do not expose to the client):

- `SUPABASE_URL` (prefer this for server use; falls back to `NEXT_PUBLIC_SUPABASE_URL` if missing)
- `SUPABASE_SERVICE_ROLE_KEY` (required)

Client variables (already present for the browser Supabase client):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## How to run (Dashboard)

1. Sign in as an admin.
2. Open `/admin` → Attachments.
3. Choose options:
   - Cutoff hours (1–168), default 24
   - Limit (1–2000), default 500
4. Click "Run Orphan Cleanup".
5. Review the results summary:
   - `scanned`: orphan rows considered
   - `deletedStorage`: storage objects deleted
   - `softDeletedRows`: DB rows soft-deleted
   - `sampleIds`: sample of affected IDs

## API

- Route: `POST /api/admin/attachments/cleanup?hours=24&limit=500`
- Auth: Admin-only (wrapped by `withAdminAuth`)
- Response:

```
{
  "success": true,
  "hours": 24,
  "limit": 500,
  "result": {
    "scanned": 12,
    "deletedStorage": 12,
    "softDeletedRows": 12,
    "sampleIds": ["..."]
  }
}
```

## How it works

- Service-role Supabase client (`lib/supabase/service.ts`) performs privileged operations.
- Orphan criteria (`lib/services/attachmentsCleanup.ts`):
  - `session_id IS NULL` and `message_id IS NULL`
  - `status = 'ready'`
  - `created_at` older than the cutoff
  - `storage_path` present
- Deletes storage objects first (best-effort), then soft-deletes DB rows.
- Continues even if some storage deletions fail; records errors and still soft-deletes.

## Manual SQL (optional)

For auditing or dry-run analysis, see `database/maintenance/cleanup-orphan-attachments.sql`. It:

- Calculates counts/size and returns candidate rows.
- Notes that Storage bytes must be removed via service role (no built-in SQL delete for Storage).
- Provides optional soft-delete/hard-delete examples.

## Troubleshooting

- 500 error "Missing SUPABASE_SERVICE_ROLE_KEY": Add the server env var and redeploy/restart.
- 500 error "Missing SUPABASE_URL": Add `SUPABASE_URL` (or ensure `NEXT_PUBLIC_SUPABASE_URL` exists as a fallback).
- No orphans found: Reduce `hours` or check if files are already linked/deleted.
- Storage delete partially fails: The job continues; verify bucket name and object paths; rerun.

## Security notes

- The service role key bypasses RLS. Never expose it to the browser or logs.
- Endpoint is admin-protected by standardized middleware.

## Next steps (optional)

- Add audit logging of cleanup runs (admin id, counts, parameters).
- Add a scheduled retention job for stale linked attachments per tier.
- Extend to other buckets if you support non-image attachments.
