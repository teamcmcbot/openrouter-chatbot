# Phase A1 Baseline Inventory – Admin Analytics Access Hardening

Date: 2025-09-10
Branch: feature/recharts-upgrade

Purpose: Capture the authoritative BEFORE state (grants, policies, view definitions, advisor raw snapshot references) prior to implementing Option A (service‑role mediated admin analytics) so that deltas are reviewable and reversible.

## 1. Target Views In Scope

| View                        | Purpose (brief)                      | Suspected Exposure              | Admin Only? (proposed) |
| --------------------------- | ------------------------------------ | ------------------------------- | ---------------------- |
| v_sync_stats                | Sync job latency & counts            | Admin analytics routes          | Yes                    |
| v_model_sync_activity_daily | Daily model sync aggregates          | Admin analytics routes          | Yes                    |
| user_model_costs_daily      | Per-user model token cost aggregates | BOTH admin + user usage route   | Split / Dual Use (TBD) |
| user_usage_daily_metrics    | (Legacy?) per-user usage metrics     | Possibly unused (confirm)       | Likely Yes or Drop     |
| v_model_counts_public       | Public model usage counts subset     | Possibly public landing metrics | Maybe (decision TBD)   |

Decision log to be finalized at end of A1 after confirming actual usage. Open questions recorded in `backlog/supabase-advisors.md` Section 15.

## 2. SQL Collection Queries (Run in psql or SQL editor)

-- List current grants on the five views

```sql
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'v_sync_stats',
    'v_model_sync_activity_daily',
    'user_model_costs_daily',
    'user_usage_daily_metrics',
    'v_model_counts_public'
  )
ORDER BY table_name, grantee, privilege_type;
```

```json
[
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "anon",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "authenticated",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "postgres",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_model_costs_daily",
    "grantee": "service_role",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "anon",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "authenticated",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "postgres",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "user_usage_daily_metrics",
    "grantee": "service_role",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "anon",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "authenticated",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "postgres",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_counts_public",
    "grantee": "service_role",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "anon",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "authenticated",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "postgres",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_model_sync_activity_daily",
    "grantee": "service_role",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "anon",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "authenticated",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "postgres",
    "privilege_type": "UPDATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "DELETE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "INSERT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "REFERENCES"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "SELECT"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "TRIGGER"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "TRUNCATE"
  },
  {
    "table_schema": "public",
    "table_name": "v_sync_stats",
    "grantee": "service_role",
    "privilege_type": "UPDATE"
  }
]
```

-- Show view definitions (NO security definer expected; advisor likely false positive)

```sql
SELECT c.relname AS view_name,
       pg_get_viewdef(c.oid, true) AS view_sql
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relkind='v'
  AND c.relname IN (
    'v_sync_stats',
    'v_model_sync_activity_daily',
    'user_model_costs_daily',
    'user_usage_daily_metrics',
    'v_model_counts_public'
  )
ORDER BY c.relname;
```

```json
[
  {
    "view_name": "user_model_costs_daily",
    "view_sql": " SELECT user_id,\n    (message_timestamp AT TIME ZONE 'UTC'::text)::date AS usage_date,\n    model_id,\n    sum(prompt_tokens) AS prompt_tokens,\n    sum(completion_tokens) AS completion_tokens,\n    sum(total_tokens) AS total_tokens,\n    round(sum(total_cost), 6) AS total_cost,\n    count(*) AS assistant_messages\n   FROM message_token_costs\n  GROUP BY user_id, ((message_timestamp AT TIME ZONE 'UTC'::text)::date), model_id;"
  },
  {
    "view_name": "user_usage_daily_metrics",
    "view_sql": " SELECT user_id,\n    usage_date,\n    generation_ms,\n    round(generation_ms::numeric / 1000.0, 3) AS generation_seconds,\n    round(generation_ms::numeric / 60000.0, 3) AS generation_minutes,\n    messages_sent,\n    messages_received,\n    total_tokens,\n    input_tokens,\n    output_tokens,\n    sessions_created,\n    models_used,\n    estimated_cost,\n    updated_at\n   FROM user_usage_daily;"
  },
  {
    "view_name": "v_model_counts_public",
    "view_sql": " SELECT count(*) FILTER (WHERE status::text = 'new'::text) AS new_count,\n    count(*) FILTER (WHERE status::text = 'active'::text) AS active_count,\n    count(*) FILTER (WHERE status::text = 'inactive'::text) AS inactive_count,\n    count(*) FILTER (WHERE status::text = 'disabled'::text) AS disabled_count,\n    count(*) AS total_count\n   FROM model_access;"
  },
  {
    "view_name": "v_model_sync_activity_daily",
    "view_sql": " SELECT date_trunc('day'::text, COALESCE(sync_completed_at, sync_started_at)) AS day,\n    sum(models_added) AS models_added,\n    sum(models_marked_inactive) AS models_marked_inactive,\n    sum(models_reactivated) AS models_reactivated,\n    count(*) AS runs\n   FROM model_sync_log\n  WHERE sync_status::text = 'completed'::text AND COALESCE(sync_completed_at, sync_started_at) >= (now() - '30 days'::interval)\n  GROUP BY (date_trunc('day'::text, COALESCE(sync_completed_at, sync_started_at)))\n  ORDER BY (date_trunc('day'::text, COALESCE(sync_completed_at, sync_started_at))) DESC;"
  },
  {
    "view_name": "v_sync_stats",
    "view_sql": " SELECT ( SELECT model_sync_log.id\n           FROM model_sync_log\n          WHERE model_sync_log.sync_status::text = 'completed'::text\n          ORDER BY model_sync_log.sync_completed_at DESC NULLS LAST\n         LIMIT 1) AS last_success_id,\n    ( SELECT model_sync_log.sync_completed_at\n           FROM model_sync_log\n          WHERE model_sync_log.sync_status::text = 'completed'::text\n          ORDER BY model_sync_log.sync_completed_at DESC NULLS LAST\n         LIMIT 1) AS last_success_at,\n    ( SELECT\n                CASE\n                    WHEN count(*) = 0 THEN 0::numeric\n                    ELSE round(sum(\n                    CASE\n                        WHEN model_sync_log.sync_status::text = 'completed'::text THEN 1\n                        ELSE 0\n                    END)::numeric * 100::numeric / count(*)::numeric, 2)\n                END AS round\n           FROM model_sync_log\n          WHERE model_sync_log.sync_started_at >= (now() - '30 days'::interval)) AS success_rate_30d,\n    ( SELECT round(avg(model_sync_log.duration_ms), 2) AS round\n           FROM model_sync_log\n          WHERE model_sync_log.sync_status::text = 'completed'::text AND model_sync_log.sync_started_at >= (now() - '30 days'::interval)) AS avg_duration_ms_30d,\n    ( SELECT count(*) AS count\n           FROM model_sync_log\n          WHERE model_sync_log.sync_started_at >= (now() - '24:00:00'::interval)) AS runs_24h,\n    ( SELECT count(*) AS count\n           FROM model_sync_log\n          WHERE model_sync_log.sync_status::text = 'failed'::text AND model_sync_log.sync_started_at >= (now() - '24:00:00'::interval)) AS failures_24h;"
  }
]
```

-- RLS policies on underlying key tables (adjust list if needed)

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'message_token_costs',
    'chat_messages',
    'profiles'
  )
ORDER BY tablename, policyname;
```

```json
[
  {
    "schemaname": "public",
    "tablename": "chat_messages",
    "policyname": "Users can create messages in their sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(session_id IN ( SELECT chat_sessions.id\n   FROM chat_sessions\n  WHERE (chat_sessions.user_id = auth.uid())))"
  },
  {
    "schemaname": "public",
    "tablename": "chat_messages",
    "policyname": "Users can delete messages in their sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "DELETE",
    "qual": "(session_id IN ( SELECT chat_sessions.id\n   FROM chat_sessions\n  WHERE (chat_sessions.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "chat_messages",
    "policyname": "Users can update messages in their sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(session_id IN ( SELECT chat_sessions.id\n   FROM chat_sessions\n  WHERE (chat_sessions.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "chat_messages",
    "policyname": "Users can view messages from their sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(session_id IN ( SELECT chat_sessions.id\n   FROM chat_sessions\n  WHERE (chat_sessions.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "message_token_costs",
    "policyname": "Admins can insert any message costs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "message_token_costs",
    "policyname": "Admins can view all message costs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "is_admin(auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "message_token_costs",
    "policyname": "Users can insert their own message costs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(auth.uid() = user_id)"
  },
  {
    "schemaname": "public",
    "tablename": "message_token_costs",
    "policyname": "Users can view their own message costs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(auth.uid() = user_id)",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "Admins can update any profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "is_admin(auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "Admins can view any profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "is_admin(auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "Users can insert their own profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(auth.uid() = id)"
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "Users can update their own profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(auth.uid() = id)",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "Users can view their own profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(auth.uid() = id)",
    "with_check": null
  }
]
```

-- Functions referenced by the views (dependency graph)

```sql
SELECT DISTINCT v.relname AS view_name,
       p.proname AS function_name,
       p.prosecdef AS security_definer
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class v ON v.oid = r.ev_class AND v.relkind='v'
JOIN pg_proc p ON p.oid = d.refobjid
JOIN pg_namespace nv ON nv.oid = v.relnamespace
JOIN pg_namespace np ON np.oid = p.pronamespace
WHERE nv.nspname='public'
  AND v.relname IN (
    'v_sync_stats',
    'v_model_sync_activity_daily',
    'user_model_costs_daily',
    'user_usage_daily_metrics',
    'v_model_counts_public'
  )
  AND p.prokind='f'
ORDER BY v.relname, p.pron
```
