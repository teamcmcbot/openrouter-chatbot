# Supabase Setup Guide (Database + Storage)

This guide gets your Supabase project ready for OpenRouter Chatbot: apply the canonical schema, create the storage bucket, expose the `storage` schema for REST access, and verify everything via the Admin UI.

Note: Legacy helpers `public.get_session_with_messages` and `public.sync_user_conversations` were removed from the canonical schema in Aug 2025. A drop patch exists in `database/patches/drop-orphaned-chat-functions/` for live cleanup if needed.

## Prerequisites

- A Supabase project (Org/Project created)
- Project URL and keys (anon/public and service role)
- Access to Dashboard → SQL Editor and Settings → API

## 1) Apply canonical schema

Canonical SQL lives in `database/schema/`. Run these files in order from the Supabase SQL Editor:

1. `01-users.sql`
2. `02-chat.sql`
3. `03-models.sql`
4. `04-system.sql`

What this creates (high level):

- Tables: `profiles`, `chat_sessions`, `chat_messages`, `model_access`, `user_activity_log`, `user_usage_daily`, `model_sync_log`, `admin_audit_log`, `system_cache`, `system_stats`
- Views: `api_user_summary`, `v_sync_stats`, `v_model_counts_public`, `v_model_recent_activity_admin`
- RLS: Enabled on user-facing tables with safe SECURITY DEFINER helpers
- Triggers: Profile sync from `auth.users`, chat session stats maintenance

## 2) Create storage bucket

Open Dashboard → Storage → Create Bucket:

- Bucket ID: `attachments-images`
- Public: Choose based on your needs (private is fine; app uses signed URLs where needed)

Optional policies (examples) — adjust to your security posture:

```
-- Read access (example: public read for a specific bucket)
create policy "Public read" on storage.objects
  for select using (bucket_id = 'attachments-images');

-- Allow authenticated users to upload into the bucket (example)
create policy "Authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments-images');
```

## 3) Expose `storage` schema for Data API

The Admin Attachments dashboard aggregates storage stats via PostgREST. You must expose the `storage` schema:

Dashboard → Settings → API → Data API (API Settings)

- Exposed schemas: add `storage` (keep `public`, `graphql_public` as appropriate)
- Save

Why: Without exposing `storage`, REST queries like `schema('storage').from('objects')` are rejected and stats show zeros.

## 4) Configure environment variables

Set these in your app environment (e.g., Vercel, .env.local):

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)

The Admin endpoints use the service role client for storage stats and maintenance actions.

## 5) Verify via Admin UI

In the running app, open Admin → Attachments:

- Storage live objects: non-zero after exposing `storage`
- Storage total bytes: computed from object metadata (size or Content-Length)
- Storage orphans: objects in storage without matching `chat_attachments.storage_path`

If bytes appear as 0 but live objects > 0, ensure uploads set size in `metadata` (or Content-Length). The app can also estimate via HEAD requests if needed.

## 6) Maintenance and patches

- Put incremental SQL under `database/patches/<issue_or_feature>/` with idempotent guards where practical.
- After approval, merge into `database/schema/` so a fresh clone applies everything in one pass.

## 7) Troubleshooting

- Storage stats all zero, logs mention: "The schema must be one of: public, graphql_public"

  - Fix: Add `storage` to Exposed schemas (Step 3)

- Error: `column objects.size does not exist`

  - Cause: Some deployments don’t expose a physical `size` column on `storage.objects`.
  - Fix: App derives bytes from `metadata.size` or `metadata["Content-Length"]`. Ensure uploads include size.

- Orphan purge doesn’t delete anything
  - Ensure bucket ID matches `attachments-images` and objects are older than the cutoff.
  - The purge uses the Storage API for deletes; DB-only deletes won’t remove underlying objects.

## 8) Object inventory (reference)

See `database/schema/*` for detailed DDL. Highlights:

- Main: `public.profiles`, `public.chat_sessions`, `public.chat_messages`, `public.model_access`
- Analytics/Audit: `public.user_activity_log`, `public.user_usage_daily`, `public.model_sync_log`, `public.admin_audit_log`
- System: `public.system_cache`, `public.system_stats`
- Views: `public.api_user_summary`, `public.v_sync_stats`, `public.v_model_counts_public`, `public.v_model_recent_activity_admin`

RLS and Triggers are defined inline in the schema files. SECURITY DEFINER functions are intended for server-side use.

## 9) Notes

- IDs for messages/sessions are TEXT to support client-generated IDs.
- Avoid exposing secrets; only the service role backend should call privileged functions.
- Indexes cover typical access patterns for performance.
