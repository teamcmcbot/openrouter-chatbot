# Admin Attachments Overview

Quick links and usage notes for admin attachments operations.

## Endpoints

- DB Stats: [`GET /api/admin/attachments/stats`](./admin-attachments-stats.md)
  // Storage metrics are included in [`GET /api/admin/attachments/stats`](./admin-attachments-stats.md)
- Storage Purge Orphans: [`GET|POST /api/admin/attachments/storage/purge`](./admin-attachments-storage-purge.md)

## Auth & Rate Limits

- All endpoints require admin auth (`withAdminAuth`).
- Tiered rate limiting applies (Tier B for storage endpoints).

## Operational Tips

- Expose the `storage` schema under Settings → API → Exposed schemas; otherwise storage stats return zeros.
- Bytes are computed from object metadata (`size` or `Content-Length`). Ensure uploads set these.
- Use `GET /storage/purge` for Dry Run; switch to `POST` with `dryRun=false` to delete.
- Default bucket: `attachments-images`. Ensure your app writes `storage_bucket` and `storage_path` in `chat_attachments`.

## Troubleshooting

- Zero storage stats → Add `storage` to Exposed schemas.
- Purge deletes none → Lower `olderThanHours`, raise `limit`, verify bucket and paths.
- Permission errors → Confirm service role key is configured on server.
