# Orphan Attachments Cleanup

This guide describes how to remove unlinked image attachments from Supabase Storage and soft-delete their database rows.

Why: Users may upload images that never get linked to a message. This script removes those Storage objects to reclaim space, then marks the DB rows as deleted.

## Prerequisites

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (service key)
- Node.js 18+

## Dry-run first

Run a summary query in the Supabase SQL editor to estimate impact (older than 24 hours by default):

```sql
WITH cfg AS (SELECT now() - interval '24 hours' AS cutoff), orphan AS (
  SELECT id, storage_path, size_bytes, created_at
  FROM public.chat_attachments
  WHERE session_id IS NULL
    AND message_id IS NULL
    AND status = 'ready'
    AND storage_path IS NOT NULL AND length(storage_path) > 0
    AND created_at < (SELECT cutoff FROM cfg)
)
SELECT COUNT(*) AS orphan_count, COALESCE(SUM(size_bytes),0) AS total_bytes,
       MIN(created_at) AS oldest_created, MAX(created_at) AS newest_created
FROM orphan;
```

## Delete from Storage (service script)

Use the Node script to remove files from the `attachments-images` bucket, then soft-delete rows.

```bash
export SUPABASE_URL=your-url
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Dry-run
node scripts/cleanup-orphan-attachments.mjs --hours 24 --dry-run

# Execute
node scripts/cleanup-orphan-attachments.mjs --hours 24
```

Options:

- `--hours <n>` cutoff age in hours (default 24)
- `--limit <n>` max rows per batch (default 1000)
- `--dry-run` print actions only

## Notes

- The SQL script `database/maintenance/cleanup-orphan-attachments.sql` now only generates the deletion list; it does not remove Storage bytes because Supabase does not expose such a function in Postgres.
- Adjust the bucket name if your project differs (default `attachments-images`).
- Consider scheduling via a secure CI/cron with service role credentials stored in your secret manager.
