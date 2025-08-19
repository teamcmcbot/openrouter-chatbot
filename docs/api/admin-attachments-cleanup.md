# Admin: Attachments Cleanup

Admin-only endpoint to remove orphaned image uploads and soft-delete their DB rows.

- Method: POST
- Path: `/api/admin/attachments/cleanup`
- Query params:
  - `hours` (number, 1–168, default 24): age cutoff
  - `limit` (number, 1–2000, default 500): max rows to process
- Auth: Admin only (withAdminAuth)
- Caching: `no-store`

## Request

POST `/api/admin/attachments/cleanup?hours=24&limit=500`

Body: none

## Response (200)

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

## Errors

- 401/403 if not admin
- 500 with `{ success: false, error }` on server errors (e.g., missing env)

## Notes

- Uses service-role Supabase client. Requires `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` on the server.
- Orphan criteria: `session_id IS NULL`, `message_id IS NULL`, `status='ready'`, `created_at < cutoff`, `storage_path` present.
