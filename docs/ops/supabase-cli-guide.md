# Supabase CLI Guide

This guide explains how we use the Supabase CLI for local development, migrations, and promoting changes to remote environments.

## Terms

- Local: Dockerized Supabase stack (`supabase start`) on your machine.
- Dev: Hosted Supabase project linked for shared development.
- Prod: Hosted Supabase production project.

## Install & init

- Install: https://supabase.com/docs/guides/cli
- Init (once): `supabase init` → creates `supabase/` (config.toml, migrations/)

## Link remote projects

- Find project ref in Studio → Settings → Project reference.
- Link to Dev: `supabase link --project-ref <DEV_PROJECT_REF>`
- Link to Prod: `supabase link --project-ref <PROD_PROJECT_REF>`

The CLI remembers the last linked project. Re-run `supabase link` to switch.

## Local stack commands

- Start: `supabase start`
- Stop: `supabase stop`
- Status: `supabase status`
- PSQL: `supabase db connect`

OAuth: Configure in `supabase/config.toml`; secrets in `supabase/.env` (gitignored).

## Migrations

- Folder: `supabase/migrations/*.sql`
- New empty migration: `supabase migration new <name>` (creates a file only; doesn’t run anything)
- Generate from diff:
  - Local DB → file: `supabase db diff -f supabase/migrations/<timestamp>_<name>.sql`
  - Linked remote → file: `supabase db diff --linked -f supabase/migrations/<timestamp>_<name>.sql`
- Apply locally (non-destructive): `supabase db migrate up`
- Apply to linked remote: `supabase db push`
- Reset local (destructive): `supabase db reset` (re-applies all migrations; runs `supabase/seed.sql` if present)

Notes:

- Execution order is lexicographic by filename (use YYYYMMDDHHMMSS prefixes).
- Use pure SQL in files (avoid psql backslash directives).
- `database/schema/` contains snapshots for humans; not executed by CLI.

## Seeds & dev bootstrap

- Automatic on reset: `supabase/seed.sql` (optional).
- Dev-only data: run manually via `supabase db connect` and `\i path/to/dev_seed.sql`.
- Suggested bootstrap after reset:
  1. Insert/sync a tiny model set (or call `public.sync_openrouter_models(jsonb)`).
  2. Set model status/flags via `public.update_model_tier_access`.
  3. Promote your user to admin by email (`UPDATE public.profiles SET account_type='admin' WHERE email=...`).
  4. Optionally seed a demo chat (session + a couple messages).

## Verification & rollback

- Check example trigger:

```sql
SELECT t.tgname, n.nspname, c.relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND t.tgname = 'on_auth_user_profile_sync';
```

- Revert by adding a new migration that drops/reverses the change (avoid resets on remote).

## Common flows

- Day-to-day: new/diff → edit SQL → `db migrate up` → test.
- Promote to Dev: `link --project-ref <DEV>` → `db push` → verify.
- Promote to Prod: `link --project-ref <PROD>` → `db push` during a release window.
