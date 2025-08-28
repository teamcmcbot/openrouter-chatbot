-- ============================================================================
-- Orphan Attachments Cleanup (manual run in Supabase SQL editor)
-- ============================================================================
-- Purpose:
--   Delete Storage files for image attachments that were uploaded but never
--   linked to a message/session, then mark their DB rows deleted.
--
-- Safety & notes:
--   - Run with elevated privileges (SQL editor default, service role) so
--     RLS on storage.objects does not block deletion.
--   - Always dry-run first to confirm counts and age threshold.
--   - Default filter removes items older than 24 hours to avoid in-flight drafts.
--   - Bucket name: 'attachments-images' (adjust if your project differs).
--
-- Customize:
--   - Change the INTERVAL in the WHERE clause to widen/narrow cleanup window.
--   - Use batch LIMITs if you have very large volumes.

-- Age cutoff configuration (adjust hours/minutes as needed)
WITH cfg AS (
  SELECT now() - interval '24 hours' AS cutoff
), orphan AS (
  SELECT id, storage_path, size_bytes, created_at
  FROM public.chat_attachments
  WHERE session_id IS NULL
    AND message_id IS NULL
    AND status = 'ready'
    AND storage_path IS NOT NULL AND length(storage_path) > 0
    AND created_at < (SELECT cutoff FROM cfg)
    -- Alternatively, use: age(now(), created_at) > interval '24 hours'
)
SELECT
  COUNT(*)                        AS orphan_count,
  COALESCE(SUM(size_bytes), 0)   AS total_bytes,
  MIN(created_at)                AS oldest_created,
  MAX(created_at)                AS newest_created
FROM orphan;

-- ACTION: Generate deletion list (Storage bytes must be removed via service key)
-- IMPORTANT: Supabase does not expose a built-in Postgres function to remove
-- file bytes from Storage. Use the Node/Service script (see docs) to delete
-- objects in the `attachments-images` bucket by storage_path.
-- This block returns the list to delete and can be used as input for the script.

BEGIN;

WITH cfg AS (
  SELECT now() - interval '24 hours' AS cutoff
), orphan AS (
  SELECT id, storage_path
  FROM public.chat_attachments
  WHERE session_id IS NULL
    AND message_id IS NULL
    AND status = 'ready'
    AND storage_path IS NOT NULL AND length(storage_path) > 0
    AND created_at < (SELECT cutoff FROM cfg)
  -- Optional batching: uncomment next two lines
  -- ORDER BY created_at
  -- LIMIT 1000
)
-- Return the list for external deletion tooling
SELECT id, storage_path FROM orphan;

-- Optional: after Storage objects confirmed deleted, soft-delete DB rows
-- UPDATE public.chat_attachments a
-- SET status = 'deleted',
--     deleted_at = now()
-- WHERE a.id IN (SELECT id FROM orphan);

COMMIT;

-- ========================================
-- OPTIONAL: hard delete DB rows (use with care)
-- ========================================
-- This permanently removes DB rows after Storage objects are deleted.
-- Keep the same orphan filter; include status 'deleted' as well.
--
-- WITH orphan AS (
--   SELECT id, storage_path
--   FROM public.chat_attachments
--   WHERE session_id IS NULL
--     AND message_id IS NULL
--     AND status IN ('ready','deleted')
--     AND storage_path IS NOT NULL AND length(storage_path) > 0
--     AND created_at < now() - interval '24 hours'
-- ), del AS (
--   SELECT storage.delete_objects(
--            'attachments-images',
--            ARRAY(SELECT storage_path FROM orphan)
--          ) AS result
-- )
-- DELETE FROM public.chat_attachments a
-- WHERE a.id IN (SELECT id FROM orphan);

-- Number of files in storage
SELECT COUNT(*)
FROM storage.objects
WHERE bucket_id = 'attachments-images';



-- DB view (what the Admin stats use)
SELECT status, COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS bytes
FROM public.chat_attachments
GROUP BY status
ORDER BY status;

-- Actual bucket usage
SELECT COUNT(*) AS objects,
       COALESCE(SUM((metadata->>'size')::bigint),0) AS total_bytes
FROM storage.objects
WHERE bucket_id = 'attachments-images';

-- Which "deleted" rows still have a Storage object present
SELECT a.id, a.storage_path, a.deleted_at
FROM public.chat_attachments a
JOIN storage.objects o
  ON o.bucket_id = 'attachments-images'
 AND o.name = a.storage_path
WHERE a.status = 'deleted'
ORDER BY a.deleted_at NULLS LAST
LIMIT 200;

-- In both storage.objects AND chat_attachements
SELECT
  o.id              AS object_id,
  o.name            AS object_name,                 -- path/key in bucket
  (o.metadata->>'size')::bigint AS bytes,
  o.created_at      AS object_created_at,
  a.id              AS attachment_id,
  a.status          AS attachment_status,
  a.created_at      AS attachment_created_at
FROM storage.objects o
JOIN public.chat_attachments a
  ON a.storage_path = o.name
WHERE o.bucket_id = 'attachments-images'
  AND a.deleted_at IS NULL
ORDER BY o.created_at DESC
LIMIT 200;

-- ...existing code...

-- ==========================================================
-- STORAGE-ONLY ORPHANS (objects in bucket without DB record)
-- ==========================================================
-- Summary (counts only live, non-tombstoned objects)
SELECT
  COUNT(*) AS orphan_objects,
  COALESCE(SUM((o.metadata->>'size')::bigint), 0) AS total_bytes
FROM storage.objects o
LEFT JOIN public.chat_attachments a
  ON a.storage_path = o.name
WHERE o.bucket_id = 'attachments-images'
  AND a.deleted_at IS NULL
  AND a.id IS NULL;

-- Dry-run: list a sample set for manual review (older than 24h)
WITH cfg AS (
  SELECT now() - interval '24 hours' AS cutoff
)
SELECT
  o.name        AS storage_path,
  (o.metadata->>'size')::bigint AS bytes,
  o.created_at
FROM storage.objects o
LEFT JOIN public.chat_attachments a
  ON a.storage_path = o.name
WHERE o.bucket_id = 'attachments-images'
  AND a.deleted_at IS NULL
  AND a.id IS NULL
  AND o.created_at < (SELECT cutoff FROM cfg)
ORDER BY o.created_at ASC
LIMIT 200;