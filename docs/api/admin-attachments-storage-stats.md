# Admin: Storage Stats

Admin-only endpoint to fetch storage-level metrics (live objects, total bytes, orphan summary).

- Method: GET
- Path: `/api/admin/attachments/storage/stats`
- Auth: Admin only (withAdminAuth)
- Rate limit: Tier B
- Cache: `no-store`

## Response (200)

```json
{
  "success": true,
  "stats": {
    "storageLiveObjects": 31,
    "storageTotalBytes": 64512,
    "storageOrphans": { "count": 0, "totalBytes": 0 }
  }
}
```

Field notes:
- `storageLiveObjects`: Exact count across candidate buckets (currently scans bucket ids referenced by `chat_attachments`, defaults to `attachments-images`).
- `storageTotalBytes`: Sum from object metadata (`size` or `Content-Length`). Some deployments do not expose a physical `objects.size` column.
- `storageOrphans`: Objects present in storage without a matching `chat_attachments.storage_path` among the scanned page.

## Errors

- 401/403: Not admin
- 429: Rate limit exceeded (Tier B)
- 500: `{ success: false, error }`

## Notes

- Requires Supabase Data API to expose the `storage` schema (Dashboard → Settings → API → Exposed schemas).
- Uses service-role Supabase client on the server.
