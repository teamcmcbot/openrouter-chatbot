# DB Dump Analysis – Trigger Coverage

## Summary

- Scanned every SQL file under `database/schema/` for `CREATE TRIGGER` statements.
- Cross-checked each trigger name against the checked-in Supabase migrations under `supabase/migrations/`.
- Identified which triggers are represented in migrations and which require manual backfill.

## Trigger Inventory

| Trigger name                           | Target table / schema                | Defined in schema file                   | Present in Supabase migrations?                                           |
| -------------------------------------- | ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| `update_profiles_updated_at`           | `public.profiles`                    | `database/schema/01-users.sql`           | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `on_auth_user_profile_sync`            | `auth.users`                         | `database/schema/01-users.sql`           | ✅ `supabase/migrations/20250927103000_add_auth_profile_sync_trigger.sql` |
| `trg_protect_ban_columns`              | `public.profiles`                    | `database/schema/01-users.sql`           | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `on_message_change`                    | `public.chat_messages`               | `database/schema/02-chat.sql`            | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `on_session_updated`                   | `public.chat_sessions`               | `database/schema/02-chat.sql`            | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `on_session_created`                   | `public.chat_sessions`               | `database/schema/02-chat.sql`            | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `after_assistant_message_cost`         | `public.chat_messages`               | `database/schema/02-chat.sql`            | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `after_attachment_link_recompute_cost` | `public.chat_attachments`            | `database/schema/02-chat.sql`            | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `on_anonymous_usage_update`            | `public.anonymous_usage_daily`       | `database/schema/06-anonymous.sql`       | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `on_anonymous_model_usage_update`      | `public.anonymous_model_usage_daily` | `database/schema/06-anonymous.sql`       | ✅ `supabase/migrations/20250912161250_remote_schema.sql`                 |
| `trg_subscriptions_updated_at`         | `public.subscriptions`               | `database/schema/07-stripe-payments.sql` | ✅ `supabase/migrations/20250920093000_stripe_payments.sql`               |

> **Note:** `database/schema/000_baseline.sql` duplicates most trigger definitions from the module-specific schema files, but the authoritative locations are listed above. Only `on_auth_user_profile_sync` failed to make it into the generated migration snapshot.

## Gaps & Next Steps

- [x] Create a migration that adds `on_auth_user_profile_sync` (plus its `handle_user_profile_sync` dependencies if needed) to ensure dev/prod stay consistent. (See `supabase/migrations/20250927103000_add_auth_profile_sync_trigger.sql`; deploy to apply.)
- [ ] After deploying that migration, merge the patch back into `database/schema/000_baseline.sql` if you keep it as canonical reference.
- [ ] Consider scripting the trigger/function extraction workflow so future changes to managed schemas (like `auth`) are less error-prone.
