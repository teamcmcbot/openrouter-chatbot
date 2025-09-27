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

- Start full local stack (Studio + Postgres + Auth + Storage): `supabase start`
- Start only the database container (no Studio URL printed): `supabase db start`
- Stop: `supabase stop`
- Status (prints connection details and local Studio URL if running): `supabase status`
- PSQL: `supabase db connect`

Notes:

- `supabase start` brings up the entire stack and, on first run or when containers were stopped, prints URLs similar to:
  - Studio: http://localhost:54323
  - API: http://localhost:54321
  - Auth: http://localhost:54322
- If you run `supabase db start` and Postgres is already running, the CLI will often only say "Postgres database is already running" and will not re-print URLs. Use `supabase status` to retrieve the current endpoints, including the Studio URL, without restarting services.

FAQ:

- There is no `supabase db stop` subcommand. To stop the local stack, run `supabase stop` (this stops DB, Auth, API, Storage, etc.). If you truly need to stop only the DB container, use Docker directly, for example:

  - List containers and find the DB name:
    - `docker ps --format "{{.ID}} {{.Names}}" | grep supabase`
  - Stop just the DB container:
    - `docker stop <container_id_or_name>`

  Tip: Prefer `supabase stop` to keep the CLI-managed services in a consistent state.

OAuth: Configure in `supabase/config.toml`; secrets in `supabase/.env` (gitignored).

## Migrations

- Folder: `supabase/migrations/*.sql`
- New empty migration: `supabase migration new <name>` (creates a file only; doesn’t run anything)
- Generate from diff:
  - Local DB → file: `supabase db diff -f supabase/migrations/<timestamp>_<name>.sql`
  - Linked remote → file: `supabase db diff --linked -f supabase/migrations/<timestamp>_<name>.sql`
- Apply locally (non-destructive): `supabase migration up`
- Apply to linked remote: `supabase migration deploy`
- Reset local (destructive): `supabase db reset` (re-applies all migrations; runs `supabase/seed.sql` if present)

Notes:

- Execution order is lexicographic by filename (use YYYYMMDDHHMMSS prefixes).
- Use pure SQL in files (avoid psql backslash directives).
- `database/schema/` contains snapshots for humans; not executed by CLI.
- `supabase migration list` (or `supabase migration status`) compares local files to the currently linked remote.
- Avoid `supabase db push` unless you explicitly intend to replace the remote schema with your local database state (it bypasses the migration history).

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

- Day-to-day: new/diff → edit SQL → `supabase migration up` → test.
- Promote to Dev: `link --project-ref <DEV>` → `supabase migration deploy` → verify with `supabase migration list`.
- Promote to Prod: `link --project-ref <PROD>` → `supabase migration deploy` during a release window.

### Promotion flow (local → dev → prod)

1. **Prepare locally**

- Edit/create migration SQL in `supabase/migrations/`.
- Run `supabase migration up` to apply the new file(s) against the local Docker database.
- Execute automated tests or manual smoke checks as needed.

2. **Deploy to shared dev**

- `supabase link --project-ref <DEV_PROJECT_REF>` (switches the CLI to dev).
- Confirm pending work with `supabase migration list`.
- Apply the new migration on dev: `supabase db push`.
- Verify success (`supabase migration list`, targeted SQL checks, or app smoke test).

3. **Promote to production**

- `supabase link --project-ref <PROD_PROJECT_REF>`.
- Repeat the `supabase migration list` → `supabase db push` → verification steps during an approved release window.
- Keep a rollback script or inverse migration ready if production validation fails.

Tip: after finishing prod deploys, consider relinking back to dev (`supabase link --project-ref <DEV_PROJECT_REF>`) so subsequent status commands point at the shared environment by default.
