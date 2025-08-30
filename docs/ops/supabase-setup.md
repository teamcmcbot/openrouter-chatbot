# Supabase Setup (Database, Storage, Data API)

This guide walks you through preparing a Supabase project for OpenRouter Chatbot.

## Prerequisites

- Supabase project created
- Project URL + keys (anon and service role)
- Dashboard access to SQL Editor and Settings → API

## 1) Apply canonical schema

Run the four schema files from the repo in this order (Dashboard → SQL Editor):

1. `database/schema/01-users.sql`
2. `database/schema/02-chat.sql`
3. `database/schema/03-models.sql`
4. `database/schema/04-system.sql`

What you get:

- Tables: profiles, chat_sessions, chat_messages, model_access, user_activity_log, user_usage_daily, model_sync_log, admin_audit_log, system_cache, system_stats
- Views: api_user_summary, v_sync_stats, v_model_counts_public, v_model_recent_activity_admin
- RLS policies + triggers

## 2) Create the storage bucket

Dashboard → Storage → Create bucket

- Bucket ID: `attachments-images`
- Public: choose per your needs (private + signed URLs is OK)

Example policies (optional, adjust to your posture):

```sql
-- Public read for this bucket
create policy "Public read" on storage.objects
  for select using (bucket_id = 'attachments-images');

-- Allow authenticated users to upload
create policy "Authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments-images');
```

## 3) Expose `storage` schema in Data API

Dashboard → Settings → API → Data API (API Settings)

- Add `storage` to "Exposed schemas"
- Save

Why: The Admin Attachments dashboard uses PostgREST to read `storage.objects`. Without exposing `storage`, you will see zero stats and errors like "The schema must be one of the following: public, graphql_public".

## 4) Configure environment variables

Set in your deployment (e.g., Vercel) or `.env.local` for dev:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

## 5) Verify in the app

Open Admin → Attachments panel:

- Storage live objects shows a non-zero count
- Storage total bytes displays from `metadata.size` or `metadata["Content-Length"]`
- Orphans count shows storage-only files without DB links

If total bytes stays zero while objects > 0, ensure your uploads include `metadata.size` (or Content-Length). The app avoids direct `objects.size` to support deployments without that column.

## 6) Purge storage-only orphans (optional)

Use the Admin UI Dry Run to preview, then Purge to delete via Storage API. This removes underlying objects; deleting DB rows alone won’t delete files.

## 7) Troubleshooting

- Zero storage stats after setup

  - Ensure `storage` is listed under Exposed schemas.

- `column objects.size does not exist`

  - The app computes bytes from metadata fields; ensure uploads set size.

- Permission errors reading storage
  - Verify your service role key is configured and server routes use it.

## 8) Change management

- Add new SQL under `database/patches/<issue_or_feature>/` (idempotent where practical)
- After approval, merge into `database/schema/` so a fresh project applies once.

## Notes

- Legacy functions removed Aug 2025: `public.get_session_with_messages`, `public.sync_user_conversations` (cleanup patch available).
- SECURITY DEFINER routines are server-only entrypoints.
