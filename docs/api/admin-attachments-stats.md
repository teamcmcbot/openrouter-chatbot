# Admin: Attachments Stats

Admin-only endpoint to fetch aggregate attachment metrics for dashboard. Includes storage-level metrics.

- Method: GET
- Path: `/api/admin/attachments/stats`
- Auth: Admin only (withAdminAuth)
- Caching: `no-store`

## Response (200)

```
{
  "success": true,
  "stats": {
    "totalAttachments": 123,
    "uploadedToday": 7,
    "unlinkedAll": 9,
    "unlinkedOlder24h": 4,
    "totalBytesApprox": 1048576,
    "storageLiveObjects": 31,
    "storageTotalBytes": 64512,
    "storageOrphans": { "count": 0, "totalBytes": 0 }
  }
}
```

## Errors

- 401/403 if not admin
- 500 with `{ success: false, error }` on server errors

## Notes

- `totalBytesApprox` is a sum of `chat_attachments.size_bytes` as a convenient approximation.
- Storage fields are included for convenience:
  - `storageLiveObjects`: exact count across candidate buckets (typically scanning those referenced by `chat_attachments`, default `attachments-images`).
  - `storageTotalBytes`: sum of object sizes from storage metadata.
  - `storageOrphans`: objects present in storage without matching `chat_attachments.storage_path` in the scanned set.
- For exact bucket usage, consider querying `storage.objects` or provider-side metrics. Ensure Supabase exposes the `storage` schema in the Data API when needed.
