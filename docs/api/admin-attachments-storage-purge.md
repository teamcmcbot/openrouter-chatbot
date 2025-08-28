# Admin: Storage Orphans Purge

Admin-only endpoint to list/purge storage-only orphans (files in storage without DB links).

- Methods: GET (dry-run), POST (dry-run by default unless dryRun=false)
- Path: `/api/admin/attachments/storage/purge`
- Auth: Admin only (withAdminAuth)
- Rate limit: Tier B

## Query Parameters

- `dryRun` (boolean, default true)
  - `true` (or any GET request): No deletion; returns prospective deletion list
  - `false` (POST only): Actually delete objects via Storage API
- `olderThanHours` (integer, default 24, min 1)
- `limit` (integer, default 500, min 1, max 2000)

## Responses

200 OK (dry-run example):

```json
{
  "success": true,
  "toDelete": ["path/a.png", "path/b.png"],
  "deleted": 0,
  "bytesFreed": 12345,
  "olderThanHours": 24,
  "limit": 500
}
```

200 OK (performing deletion):

```json
{
  "success": true,
  "toDelete": ["path/a.png"],
  "deleted": 1,
  "bytesFreed": 6789,
  "olderThanHours": 24,
  "limit": 100
}
```

Errors:

- 401/403: Not admin
- 429: Rate limit exceeded (Tier B)
- 500: `{ success: false, error }`

## Notes

- Deletion is performed via `supabase.storage.from(<bucket>).remove([...])` to ensure provider objects are actually removed.
- Bucket defaults to `attachments-images`.
- Objects are considered orphans if their `name` is not referenced by `chat_attachments.storage_path` and they are older than the cutoff.
- Requires Supabase Data API to expose the `storage` schema to list objects.
