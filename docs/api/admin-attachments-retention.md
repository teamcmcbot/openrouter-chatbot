# Admin: Attachments Retention Trigger

Admin endpoint to manually trigger a tier-based retention batch for image attachments.

## Routes

- Methods: GET, POST
- Path: `/api/admin/attachments/retention`
- Auth: Admin-only (withProtectedAuth + admin check via middleware)
- Caching: `Cache-Control: no-store`

## Query Parameters

- `freeDays` (number) – optional; default 30
- `proDays` (number) – optional; default 60
- `enterpriseDays` (number) – optional; default 90
- `limit` (number) – optional; default 1000; max 5000
- `dryRun` (boolean) – optional; default false

Example (GET):

```
/api/admin/attachments/retention?freeDays=30&proDays=60&enterpriseDays=90&limit=500&dryRun=true
```

## Response

```
{
  "success": true,
  "params": {
    "daysByTier": { "free": 30, "pro": 60, "enterprise": 90 },
    "limit": 500,
    "dryRun": true
  },
  "result": { /* service summary */ }
}
```

## Notes

- This is intended for manual runs from the admin console. Use the internal endpoint for scheduled jobs.
- The service will soft-delete DB rows (set `deleted_at`) and attempt storage deletions; missing storage objects aren’t treated as fatal.
