# Supabase Setup (Database, Storage, Data API)

This guide walks you through preparing a Supabase project for OpenRouter ## 2) Apply canonical schema

Run the four schema files from the repo in th## 7) Pu## 8) Troubleshooting

- Zero storage stats after setup

  - Ensure `storage` is listed under Exposed schemas.

- `column objects.size does not exist`

  - The app computes bytes from metadata fields; ensure uploads set size.

- Permission errors reading storage
  - Verify your service role key is configured and server routes use it.

## 9) Change managemently orphans (optional)

Use the Admin UI Dry Run to preview, then Purge to delete via Storage API. This removes underlying objects; deleting DB rows alone won't delete files.

## 8) Troubleshootingder (Dashboard → SQL Editor):

1. `database/schema/01-users.sql`
2. `database/schema/02-chat.sql`
3. `database/schema/03-models.sql`
4. `database/schema/04-system.sql`

What you get:

- Tables: profiles, chat_sessions, chat_messages, model_access, user_activity_log, user_usage_daily, model_sync_log, admin_audit_log, system_cache, system_stats
- Views: api_user_summary, v_sync_stats, v_model_counts_public, v_model_sync_activity_daily
- RLS policies + triggers

## 3) Create the storage bucketrequisites

- Supabase project created
- Project URL + keys (anon and service role)
- Dashboard access to SQL Editor and Settings → API
- Google Cloud Console account (for OAuth setup)

## 1) Configure Google OAuth Authentication

### A) Google Cloud Console Setup

1. **Create or Select a Project**

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google+ API (legacy) or People API for user profile access

2. **Configure OAuth Consent Screen**

   - Navigate to: APIs & Services → OAuth consent screen
   - Choose "External" user type (unless using Google Workspace)
   - Fill required fields:
     - **App name**: Your application name (e.g., "OpenRouter Chatbot")
     - **User support email**: Your support email
     - **Developer contact**: Your email address
   - Add authorized domains if deploying to production (e.g., `yourdomain.com`)
   - **Scopes**: Add `email` and `profile` scopes (these are usually pre-selected)
   - **Test users**: Add your email and any test accounts during development

3. **Create OAuth Credentials**
   - Navigate to: APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - **Name**: Descriptive name (e.g., "OpenRouter Chatbot Web Client")
   - **Authorized JavaScript origins**:
     - Development: `http://localhost:3000`
     - Production: `https://yourdomain.com`
   - **Authorized redirect URIs**:
     - Development: `http://localhost:3000/auth/callback`
     - Production: `https://yourdomain.com/auth/callback`
     - **Supabase callback**: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Save and copy the **Client ID** and **Client Secret**

### B) Supabase Authentication Setup

1. **Configure Google Provider**

   - Go to Supabase Dashboard → Authentication → Providers
   - Find "Google" and click to configure
   - **Enable Google provider**: Toggle ON
   - **Client ID**: Paste your Google OAuth Client ID
   - **Client Secret**: Paste your Google OAuth Client Secret
   - **Redirect URL**: Copy the provided URL (format: `https://your-project-ref.supabase.co/auth/v1/callback`)

2. **Update Site URL and Redirect URLs**

   - Go to Authentication → URL Configuration
   - **Site URL**: Set your application URL
     - Development: `http://localhost:3000`
     - Production: `https://yourdomain.com`
   - **Redirect URLs**: Add allowed redirect URLs
     - `http://localhost:3000/**` (for development)
     - `https://yourdomain.com/**` (for production)

3. **Configure Additional Settings**
   - **Enable email confirmations**: Usually disabled for OAuth
   - **Enable phone confirmations**: Not needed for Google OAuth
   - **Session timeout**: Configure as needed (default: 3600 seconds)

### C) Application Configuration

Add these environment variables to your `.env.local` (development) or deployment platform:

```env
# Supabase Configuration (required for Google OAuth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth (optional - handled by Supabase)
# These are configured in Supabase Dashboard, not as env vars
```

### D) Testing Google Authentication

1. **Development Testing**

   - Start your Next.js app: `npm run dev`
   - Navigate to the login page
   - Click "Sign in with Google"
   - Complete OAuth flow with a test Google account
   - Verify user profile is created in Supabase → Authentication → Users

2. **Production Deployment**
   - Ensure all redirect URLs match your production domain
   - Update Google Cloud Console with production URLs
   - Test with real users (remove from test users list in Google Console)

### E) Troubleshooting Google OAuth

**Common Issues:**

- **"redirect_uri_mismatch" error**

  - Verify redirect URIs in Google Console match exactly (including http/https)
  - Check Supabase Site URL configuration
  - Ensure trailing slashes are consistent

- **"invalid_client" error**

  - Double-check Client ID and Secret in Supabase
  - Verify OAuth consent screen is properly configured
  - Ensure Google+ API or People API is enabled

- **Users can't sign in after OAuth**

  - Check Supabase RLS policies allow authenticated users
  - Verify user profiles are being created (see Authentication → Users)
  - Check browser console for JavaScript errors

- **Development vs Production issues**
  - Use different OAuth clients for dev/prod environments
  - Ensure domain verification in Google Console for production
  - Check CORS settings and allowed origins

## 2) Apply canonical schema

Run all six schema files from the repo in this order (Dashboard → SQL Editor):

1. `database/schema/01-users.sql`
2. `database/schema/02-chat.sql`
3. `database/schema/03-models.sql`
4. `database/schema/04-system.sql`
5. `database/schema/05-storage.sql`
6. `database/schema/06-anonymous.sql`

What you get:

- **Core Tables**: profiles, chat_sessions, chat_messages, model_access, user_activity_log, user_usage_daily, model_sync_log, admin_audit_log, system_cache, system_stats
- **Anonymous Analytics**: anonymous_usage_daily, anonymous_error_events (for usage tracking without accounts)
- **Views**: api_user_summary, v_sync_stats, v_model_counts_public, v_model_sync_activity_daily
- **Storage Policies**: RLS policies for attachments-images bucket (read own, insert own, delete own)
- **Functions & Triggers**: User profile management, session handling, analytics aggregation
- **Row Level Security**: Comprehensive RLS policies for all tables

## 3) Create the storage bucket

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

## 4) Expose `storage` schema in Data API

Dashboard → Settings → API → Data API (API Settings)

- Add `storage` to "Exposed schemas"
- Save

Why: The Admin Attachments dashboard uses PostgREST to read `storage.objects`. Without exposing `storage`, you will see zero stats and errors like "The schema must be one of the following: public, graphql_public".

## 5) Configure environment variables

Set in your deployment (e.g., Vercel) or `.env.local` for dev:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

## 6) Verify in the app

Open Admin → Attachments panel:

- Storage live objects shows a non-zero count
- Storage total bytes displays from `metadata.size` or `metadata["Content-Length"]`
- Orphans count shows storage-only files without DB links

If total bytes stays zero while objects > 0, ensure your uploads include `metadata.size` (or Content-Length). The app avoids direct `objects.size` to support deployments without that column.

## 7) Purge storage-only orphans (optional)

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
