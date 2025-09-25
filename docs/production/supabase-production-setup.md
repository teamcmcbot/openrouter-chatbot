# Supabase Production Setup

Follow this playbook to provision a new Supabase project for production and migrate the existing schema from the repository.

## 1. Create the Production Project

1. Sign in to [Supabase](https://supabase.com/dashboard) and click **New Project**.
2. Choose a dedicated production organization or workspace.
3. Select a region close to your target users (Supabase does not support region changes later).
4. Set a **strong database password** (store it in a password manager). This generates the `postgresql://` connection string.
5. Wait for the project to provision (typically ~2 minutes).

## 2. Configure Supabase CLI for Production

1. Install the CLI if not already available:

```bash
npm install -g supabase
```

2. Authenticate:

```bash
supabase login
```

3. Link the local project folder (`openrouter-chatbot`) to the new Supabase project ID:

```bash
cd /path/to/openrouter-chatbot
supabase link --project-ref <your-project-ref>
```

4. Set the remote database for migrations:

```bash
supabase db remote set postgres://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres
```

## 3. Apply Schema & Migrations

The repository contains canonical DDL under `database/schema/` and incremental patches under `database/patches/`. Additionally, Supabase-compatible migrations live in `/supabase/migrations/`.

1. Run the existing migrations against the remote database:

```bash
supabase db reset --use-migrations
```

This command:

- Drops and recreates the target database (safe for a fresh project).
- Applies every migration in `/supabase/migrations/`.
- Seeds data if `supabase/seed.sql` exists (create one if needed for initial models/features).

2. Verify the schema matches expectations:

   - Inspect tables in Supabase Studio → _Table Editor_ (e.g., `chat_sessions`, `chat_messages`, `model_access`, `user_profiles`).
   - Confirm Row Level Security (RLS) policies exist—Supabase Studio lists them under each table.
   - Check storage buckets (e.g., `attachments`) under _Storage_. Create buckets if they do not yet exist and enable public access rules consistent with dev.

3. If you maintain manual SQL patches in `database/patches/`, merge them into `/supabase/migrations/` before launch so `supabase db reset` stays canonical.

## 4. Configure Authentication (Google OAuth)

1. In Google Cloud Console, create a new OAuth 2.0 Client ID (type **Web Application**).
   - Authorized JavaScript origins: `https://<prod-domain>` and `https://<project>.vercel.app` (for fallback).
   - Authorized redirect URI: `https://<prod-domain>/auth/callback` (Supabase handles the callback).
2. Copy the **Client ID** and **Client Secret**.
3. In Supabase → _Authentication → Providers → Google_, enable the provider and paste the credentials.
4. Update the _Redirect URLs_ section in Supabase Auth settings to include the production domain and the Vercel preview domain if needed.
5. Optionally enforce email domain restrictions using Supabase Auth policies if only certain Google accounts should sign in.

## 5. Generate API Keys for Vercel

From the Supabase Project Settings → _API_ tab, record the following:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

Never expose the service role key client-side—store it only in Vercel’s server-side environment variables.

## 6. Database Backups & Monitoring

- Enable **Point-in-Time Recovery** (PITR) if your plan includes it (Supabase Pro+).
- Configure daily backups and set retention policies appropriate for compliance requirements.
- Review Supabase project logs: _Logs → API_ for RESTful calls, _Logs → Database_ for SQL activity.
- Set up [Alerts](https://supabase.com/docs/guides/platform/alerts) for error spikes or auth failures.

## 7. Initial Data Seeding

Consider seeding the following before launch:

- Default `model_access` rows that map OpenRouter models to tiers (extract from the dev database or include in migrations).
- Feature flag defaults in any supporting tables.
- Admin user records or allow upgrades via Stripe to populate automatically.

If you prefer to migrate from an existing dev database, export sanitized data:

```bash
supabase db dump --data-only --file seed.sql
```

Edit the dump to remove DEV user accounts or personal information before importing into prod.

## 8. Granting Team Access

- Invite teammates via _Project → Settings → Access_ with least-privilege roles.
- Enable MFA for all collaborators.
- Document who owns Supabase administration for on-call coverage.

## 9. Post-Setup Validation

- [ ] Run `npm run build` locally with production Supabase env vars to ensure no runtime errors.
- [ ] Sign in via Google on a staging deployment and confirm a user profile row is created.
- [ ] Create a chat session and verify messages persist to `chat_messages`.
- [ ] Test attachments upload and confirm objects appear in Supabase Storage.
- [ ] Ensure RLS blocks unauthorized access (log out and attempt to access `/api/chat/sessions`).

> ✅ Once Supabase is ready, proceed to the [Vercel Deployment Guide](./vercel-deployment-guide.md) to connect credentials and deploy the application.
