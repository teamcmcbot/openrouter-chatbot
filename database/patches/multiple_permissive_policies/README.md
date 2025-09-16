# multiple_permissive_policies – Consolidate duplicate permissive RLS policies

This patch collapses pairs of permissive policies into a single policy per action to reduce evaluation overhead while keeping behavior identical.

## Why

Postgres applies permissive RLS policies with OR semantics for the same role+action. Having multiple permissive policies (e.g., “Admins can …” and “Users can …”) forces multiple evaluations and is flagged by Supabase’s Performance Advisor.

Consolidation into one policy per action with an OR of conditions is faster and clearer.

## Scope

- public.message_token_costs
  - SELECT: combines “Admins can view all …” OR “Users can view their own …”
  - INSERT: combines “Admins can insert any …” OR “Users can insert their own …”
- public.profiles
  - SELECT: combines “Admins can view any …” OR “Users can view their own …”
  - UPDATE: combines “Admins can update any …” OR “Users can update their own …”

The patch preserves (select auth.uid()) wrappers to keep initplan optimization.

## Files

- 001_fix_multiple_permissive_policies.sql – create consolidated policies and drop the redundant ones
- 002_rollback_multiple_permissive_policies.sql – restore original split policies

## Apply

1. Connect to your database.
2. Run 001_fix_multiple_permissive_policies.sql.
3. Verify one policy per action remains for the listed tables.

## Verify

- Performance Advisor should stop reporting multiple_permissive_policies for these tables.
- Inspect policies:

```sql
select n.nspname as schema, c.relname as table, p.polname, p.polcmd as action,
       pg_get_expr(p.polqual, p.polrelid) as using,
       pg_get_expr(p.polwithcheck, p.polrelid) as with_check
from pg_policy p
join pg_class c on c.oid=p.polrelid
join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('message_token_costs','profiles'))
order by schema, table, action, polname;
```

You should see:

- public.message_token_costs: “View message costs” (SELECT) and “Insert message costs” (INSERT)
- public.profiles: “View profiles” (SELECT) and “Update profiles” (UPDATE)

## Rollback

Run 002_rollback_multiple_permissive_policies.sql to restore the original split policies.

## Notes

- Behavior is unchanged; conditions are simply OR-combined within one policy.
- If your environment uses TO clauses for role scoping, you can alternatively keep separate policies with non-overlapping roles instead of consolidation.
