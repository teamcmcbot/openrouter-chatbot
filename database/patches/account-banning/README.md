# Account Banning Patch

This patch introduces ban fields on `public.profiles`, an admin-only `public.moderation_actions` audit table, helper functions, and protections.

Files:

- 001-ban-schema.sql — schema changes and functions

What it adds

- profiles columns: `is_banned boolean not null default false`, `banned_at timestamptz`, `banned_until timestamptz`, `ban_reason text`, `violation_strikes integer not null default 0`
- indexes to accelerate admin queries
- table `public.moderation_actions` with RLS restricted to admins
- functions (SECURITY DEFINER):
  - `public.is_banned(user_uuid uuid) returns boolean`
  - `public.ban_user(user_uuid uuid, until timestamptz default null, reason text default null) returns jsonb`
  - `public.unban_user(user_uuid uuid, reason text default null) returns jsonb`
- trigger to prevent non-admins from editing ban fields directly on `public.profiles`
- grants: execute `is_banned` for PUBLIC, `ban_user`/`unban_user` for `authenticated`

Dependencies

- `public.is_admin(uuid)` must exist (already defined in schema/01-users.sql).
- `public.log_user_activity(...)` must exist (already in schema/01-users.sql).
- `gen_random_uuid()` via `pgcrypto` extension (present in base schema).

Idempotency

- Uses `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE POLICY` guards, and `CREATE OR REPLACE FUNCTION`.
- Trigger created only if not exists.

Manual test steps (psql)

```sql
-- 1) Prepare a test user id
SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1; -- copy an id

-- 2) Ban permanently
SELECT public.ban_user('<uuid>'::uuid, NULL, 'manual test - abuse');
SELECT public.is_banned('<uuid>'::uuid); -- should be true

-- 3) Ban temporarily for 10 minutes (overwrites fields)
SELECT public.ban_user('<uuid>'::uuid, now() + interval '10 minutes', 'temp ban for test');

-- 4) Unban
SELECT public.unban_user('<uuid>'::uuid, 'manual unban after test');
SELECT public.is_banned('<uuid>'::uuid); -- should be false

-- 5) RLS: non-admin cannot update ban fields directly
-- (Run as regular user session) UPDATE public.profiles SET is_banned = false WHERE id = '<uuid>'::uuid; -- should fail

-- 6) Admin reads moderation actions
SELECT * FROM public.moderation_actions WHERE user_id = '<uuid>'::uuid ORDER BY created_at DESC;
```

Roll-forward plan

- After sign-off and verification, merge changes into `database/schema/01-users.sql` and `04-system.sql` if needed.
- Wire middleware enforcement and admin endpoints per backlog plan.
