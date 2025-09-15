# Database Migrations Workflow (Local → Dev → Prod)

This document describes how we create, test, and promote database changes using the Supabase CLI.

## Principles

- Migrations are the source of truth: `supabase/migrations/*.sql`.
- Snapshots in `database/schema/` are for human review, not execution.
- Prefer idempotent SQL and safe ALTERs; avoid destructive changes unless required.
- Keep migrations pure SQL (no psql `\` meta-commands).

## Naming & ordering

- Use timestamp prefixes: `YYYYMMDDHHMMSS_descriptive_name.sql`.
- Files run in lexicographic order. Put dependencies in earlier files.

## Authoring changes

1. Create a migration file:
   - Empty: `supabase migration new <name>`
   - From diff (local DB): `supabase db diff -f supabase/migrations/<timestamp>_<name>.sql`
   - From diff (linked Dev): `supabase db diff --linked -f supabase/migrations/<timestamp>_<name>.sql`
2. Edit SQL. Make it idempotent where practical. Document intent in comments.

## Apply & test locally

- Non-destructive apply: `supabase db migrate up`
- Destructive clean slate: `supabase db reset` (re-applies all migrations; runs `supabase/seed.sql`)
- Verify behavior (e.g., triggers, RLS, RPCs) and run app tests.

## Promote to Dev

1. Ensure the CLI is linked to Dev: `supabase link --project-ref <DEV_PROJECT_REF>`
2. Apply: `supabase db push`
3. Verify in Dev (Studio SQL, app smoke tests). If issues, create a revert migration and `db push` again.

## Promote to Prod

1. Code freeze window; ensure Dev is healthy.
2. Link to Prod: `supabase link --project-ref <PROD_PROJECT_REF>`
3. Apply: `supabase db push`
4. Verify critical paths. Have a revert migration ready for rollback if needed.

## Data considerations

- `db migrate up` preserves data; destructive effects only occur if your SQL alters/drop data.
- `db reset` wipes local DB data only. Storage files may persist, but their DB references are reset.
- Dev/prod data persists; use ALTERs and `ON CONFLICT` patterns to avoid data loss.

## Dev bootstrap (optional)

Keep an idempotent dev seed you can run manually post-migrate to:

- Seed a minimal set of models or call `public.sync_openrouter_models` with a small JSON.
- Set selected models active with tier flags via `public.update_model_tier_access`.
- Promote your user to `account_type='admin'` by email.
- Optionally insert a demo chat session/messages.

## Verification checklist

- New/changed triggers exist (e.g., `on_auth_user_profile_sync`).
- RLS policies still allow intended access;
- RPCs return expected shapes; no SECURITY DEFINER/INVOKER regressions;
- App endpoints work under auth middleware + rate limiting.

## Rollback

- Create a reverting migration (e.g., `DROP TRIGGER ...`, `ALTER TABLE ...` restore).
- `db push` to apply revert in Dev/Prod. Avoid `db reset` on remote.
