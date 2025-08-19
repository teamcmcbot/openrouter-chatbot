# Supabase Attachments Bucket Setup

This guide sets up a private Storage bucket for image attachments and aligns it with the `chat_attachments` table and RLS policies.

## 1) Create the bucket

- Name: `attachments-images`
- Access: Private (no public reads)
- File size limit: optional (e.g., 10 MB)
- Allowed types: image/png, image/jpeg, image/webp

## 2) Path conventions

Use stable, non-guessable paths:

- `user_id/session_id/draft_id/<uuid>.<ext>` for pre-linked uploads
- `user_id/session_id/message_id/<uuid>.<ext>` after linking

The DB enforces uniqueness on `(storage_bucket, storage_path)`.

## 3) CORS (if needed)

If uploading directly from the browser, add your app origin to CORS:

- Origin: https://<your-app-domain>
- Methods: GET, PUT, POST
- Headers: Authorization, Content-Type
- Max Age: 3600

Prefer server-signed upload URLs when possible.

## 4) RLS policies for Storage

Enable RLS on `storage.objects` and add policies scoped to the bucket. Minimal pattern:

```sql
-- View own files in attachments-images
create policy if not exists "attachments-images: read own"
  on storage.objects for select
  using (
    bucket_id = 'attachments-images'
    and owner = auth.uid()
  );

-- Insert own files into attachments-images
create policy if not exists "attachments-images: insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments-images'
    and owner = auth.uid()
  );

-- Delete own files
create policy if not exists "attachments-images: delete own"
  on storage.objects for delete
  using (
    bucket_id = 'attachments-images'
    and owner = auth.uid()
  );
```

Notes:

- Ensure your upload flow sets `owner` to the user’s id.
- Alternatively, key path-based ownership (prefix starts with `auth.uid()`), then adapt policies to `left(name, 36) = auth.uid()::text` (if you embed the UUID at the start of the path).

## 5) Signed URL policy

- Do not make the bucket public.
- Generate signed URLs with ~5 minutes TTL for read access only when needed.
- Never store signed URLs in DB; store `storage_bucket` + `storage_path` and derive signed URL on demand.

## 6) Linkage with `chat_attachments`

- DB table: `public.chat_attachments` has `storage_bucket` and `storage_path`.
- Insert a row after upload begins (with `draft_id`) or after upload completes.
- When a user message is sent, move from `draft_id` to `message_id` and set `status = 'ready'`.
- The table enforces per-message max (3) via `chat_messages.attachment_count` check.

## 7) Retention & orphan cleanup

- Orphan files: in bucket but not referenced by any `chat_attachments` row (or rows with `deleted` status) for >24 hours.
- Retention: delete storage objects and mark rows `deleted` after 30 days (tier-specific overrides optional).
- Implement via a scheduled job (cron/Edge Function) that:
  - Scans `chat_attachments` and `storage.objects` for orphans.
  - Deletes storage objects via service key.
  - Soft-deletes DB rows (sets `status = 'deleted', deleted_at = now()`).

## 8) Security practices

- Validate MIME type and file magic on upload.
- Consider anti-virus scanning if accepting user uploads.
- Enforce pixel dimension caps and count checks client-side and server-side.
- Rate limit upload endpoints.

## 9) Operational metrics (optional)

- Track counts and bytes uploaded per user/day.
- Monitor signed URL generation volume and errors.
- Record per-model image usage for cost analysis.

## 10) Troubleshooting

- 403 on signed URL: expired TTL or wrong path.
- 401 on upload: check auth cookie/header.
- Missing image in UI: ensure path matches DB row exactly and the object exists.
