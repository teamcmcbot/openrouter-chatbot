# Admin: Attachments Stats

Admin-only endpoint to fetch aggregate attachment metrics for dashboard.

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
    "totalBytesApprox": 1048576
  }
}
```

## Errors

- 401/403 if not admin
- 500 with `{ success: false, error }` on server errors

## Notes

- `totalBytesApprox` is a sum of `chat_attachments.size_bytes` as a convenient approximation.
- For exact bucket usage, consider querying `storage.objects` or provider-side metrics.
