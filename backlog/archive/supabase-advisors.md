# Supabase Advisors

## 1. Overview

Supabase "Advisors" output (database linter) surfaces structural, security, and performance issues. We ingested four advisor exports:

- `PerformanceAdvisor_Info.md` (INFO) – primarily unused indexes & one unindexed FK
- `PerformanceAdvisor_Warnings.md` (WARN) – RLS inefficiencies and duplicate permissive policies
- `SecurityAdvisor_Errors.md` (ERROR) – SECURITY DEFINER views
- `SecurityAdvisor_Warnings.md` (WARN) – mutable search_path functions, auth hardening & Postgres patch level

This document analyzes current findings, prioritizes remediation, and proposes an actionable phased plan.

---

## 2. Inventory Summary

| Category                            | Count                 | Severity Mix | Notes                                                        |
| ----------------------------------- | --------------------- | ------------ | ------------------------------------------------------------ |
| Unused indexes                      | 23                    | Low (INFO)   | Candidates for staged drop after observation window          |
| Unindexed foreign key               | 1                     | Medium       | FK on `moderation_actions.created_by` missing covering index |
| RLS initplan inefficiencies         | 34 policies           | Medium       | Excess `auth.*()` calls per row -> planner re-evals          |
| Multiple permissive policies (dup)  | 18 role/action combos | Medium       | Causes redundant policy eval & complexity                    |
| SECURITY DEFINER views              | 5                     | High         | Elevation risk; bypasses querying user RLS context           |
| Mutable function search_path        | 22 functions          | Medium       | Risk of search_path hijack if future SQL injection elsewhere |
| Leaked password protection disabled | 1                     | Medium       | Straightforward config toggle improvement                    |
| Outdated Postgres version           | 1                     | High         | Security & perf patches pending                              |

---

## 3. Key Findings & Impact

### 3.1 Security (Highest Priority)

1. SECURITY DEFINER Views (`user_usage_daily_metrics`, `v_model_counts_public`, `v_model_sync_activity_daily`, `user_model_costs_daily`, `v_sync_stats`).

   - Impact: Queries run with creator privileges, potentially exposing broader data if RLS or underlying permissions evolve.
   - Action: Replace with SECURITY INVOKER (default) views or convert to stable materialized views with controlled refresh job if privilege elevation was for performance.

2. Mutable `search_path` in 22 functions.

   - Impact: If any SQL injection vector existed, attacker could manipulate `search_path` to shadow objects. Defense-in-depth issue.
   - Action: Add `SET search_path = pg_catalog, public;` inside function body OR define functions with `SECURITY DEFINER` + fixed `search_path` only when privilege escalation is explicitly required (few should be).

3. Postgres version behind on security patches.

   - Action: Plan minor upgrade maintenance window. Validate extensions compatibility (check `pg_stat_statements`, any vector/FTS modules). Run pre-upgrade logical backup + smoke queries.

4. Leaked password protection disabled.
   - Action: Enable through Supabase Auth settings; low risk immediate win.

### 3.2 Performance & Maintainability

1. RLS initplan inefficiency (excess auth function calls per row).

   - Root Cause: Direct usage of `auth.uid()`, `current_setting()` etc. in policy expressions evaluated per-row.
   - Fix Pattern: Wrap once in sub-select: `(SELECT auth.uid())` or pre-bind via `SET LOCAL`. Reduces repeated expression evaluation & may enable better plan caching.

2. Multiple permissive policies for same (table, role, action).

   - Impact: N policies all evaluated; complexity & risk of divergence.
   - Fix Pattern: Consolidate with OR logic inside a single policy OR split into distinct restrictive/permissive design (prefer 1 permissive + optional restrictive). Document naming convention.

3. Unused indexes (23) & single unindexed FK.
   - Impact: Write amplification + memory bloat (shared buffers) + slower vacuum. Some may be newly created and not yet hit.
   - Validation Steps:
     - Collect 30-day usage window from `pg_stat_user_indexes`.
     - Tag candidate rows with `last_idx_scan IS NULL`.
     - For each candidate ensure no upcoming feature depends on them.
   - FK Index: Add a standard btree index on referencing column(s) (`moderation_actions.created_by`).

### 3.3 Governance & Observability Gaps

No current snapshot diffing pipeline; manual review only. Lack of structured metadata (age of each finding, owner, remediation status). Policies & functions lack consistent header comments stating rationale.

---

## 4. Prioritization Matrix

| Priority | Finding                                   | Rationale                                    |
| -------- | ----------------------------------------- | -------------------------------------------- |
| P0       | SECURITY DEFINER views removal            | Direct privilege escalation vector           |
| P0       | Postgres version upgrade plan             | Security patches pending                     |
| P1       | search_path hardening in functions        | Defense-in-depth, batchable                  |
| P1       | RLS initplan fixes                        | Reduces per-row overhead & latency tail      |
| P1       | Duplicate permissive policy consolidation | Simplifies security review                   |
| P2       | Add missing FK index                      | Low effort, protects from seq scans on joins |
| P2       | Unused index validation (observe)         | Need data to safely drop                     |
| P3       | Automation & reporting pipeline           | Enhances future velocity                     |

---

## 5. Recommended Remediation Plan (Phased)

### Phase 1 – Immediate Security Hardening (P0)

- Convert or recreate the 5 SECURITY DEFINER views as SECURITY INVOKER.
- If elevated rights truly needed, replace with parameterized functions with explicit grants; avoid view-based privilege escalation.
- Enable leaked password protection in Auth settings.
- Draft Postgres upgrade runbook (dry-run in staging + extension compatibility check).

### Phase 2 – Function & Policy Optimization (P1)

- Add explicit `SET search_path` at top of each affected function or recreate with `SECURITY INVOKER` and a fixed search_path clause.
- Refactor RLS policies: replace `auth.uid()` repeated calls with `(SELECT auth.uid())` pattern.
- Consolidate duplicate permissive policies per table/role/action into one; adopt naming: `app_<action>_<role>[_admin_override]`.
- Add regression tests ensuring policy logic unchanged (simulate roles with `SET ROLE`).

### Phase 3 – Index Hygiene (P2)

- Capture baseline: snapshot `pg_stat_user_indexes` now (T0) and again at T0+14d.
- Mark persistent unused indexes; script generates `DROP INDEX CONCURRENTLY` statements gated behind safety checklist.
- Create index on `moderation_actions(created_by)` concurrently.
- Monitor write throughput & buffer hit ratio pre/post.

### Phase 4 – Automation & Documentation (P3)

- Scheduled weekly job (SQL + pg_cron or external script) to export advisor results into a table `meta_advisor_findings` with hash of detail -> allow diffing.
- GitHub action to fail PR if new HIGH (security) findings introduced.
- Add README section: RLS policy patterns & function template with search_path guard.

---

## 6. Detailed Remediation Patterns

### 6.1 Replace SECURITY DEFINER Views

```sql
-- Recreate as invoker-safe
CREATE OR REPLACE VIEW public.user_usage_daily_metrics AS
SELECT ...
-- Ensure underlying tables have correct RLS; do not rely on definer privileges.
```

If materialization desired:

```sql
CREATE MATERIALIZED VIEW public.user_usage_daily_metrics_mv AS
SELECT ...;
-- Refresh via cron job with elevated role; grant SELECT to app roles.
```

### 6.2 Harden Functions

```sql
CREATE OR REPLACE FUNCTION public.track_user_usage(...) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- body
END;
$$;
```

### 6.3 RLS Initplan Optimization

Current (inefficient):

```sql
USING (auth.uid() = user_id)
```

Optimized:

```sql
USING ((SELECT auth.uid()) = user_id)
```

Or pre-store in a stable function `current_app_user_id()` that caches.

### 6.4 Consolidate Duplicate Permissive Policies

From two policies:

```sql
USING (user_id = (SELECT auth.uid()))
USING (is_admin())
```

To single policy:

```sql
USING (is_admin() OR user_id = (SELECT auth.uid()))
```

### 6.5 Unused Index Drop Playbook

1. Observation window >= 14 days (30 preferred) during normal traffic.
2. Confirm `idx_scan = 0` and `idx_tup_read = 0`.
3. Check no pending feature branch introduces new query needing it.
4. Drop concurrently:

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_messages_websearch_count;
```

5. Record in `meta_index_retire_log` (index name, reason, timestamp).

### 6.6 Add Missing FK Index

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_actions_created_by
  ON public.moderation_actions (created_by);
```

---

## 7. Risk & Mitigation

| Risk                                                     | Mitigation                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Policy consolidation changes effective access            | Snapshot before/after row counts accessible per role in staging; add test harness                |
| Dropping index needed by rare query                      | Extended observation + query log sampling (pg_stat_statements top N)                             |
| View privilege regression                                | Pre-compare dataset returned to various roles before switch                                      |
| Function search_path change introduces resolution errors | Run regression suite; explicitly schema-qualify all object references                            |
| Postgres upgrade downtime                                | Use zero-downtime plan (logical replication or in-place minor upgrade during maintenance window) |

---

## 8. Automation & Observability Enhancements

- Create table `meta_advisor_findings(id uuid, category text, object_type text, object_name text, severity text, first_seen timestamptz, last_seen timestamptz, hash text, status text default 'open')`.
- Ingest advisor markdown via lightweight parsing script (`scripts/ingest_advisors.ts`).
- Diff job flags disappeared findings -> auto-close, new findings -> open.
- Dashboard panel (Grafana / Supabase Dashboard) for open HIGH findings count (alert if >0 for >24h).

---

## 9. Suggested Timeline (Indicative)

| Week | Focus                                                    |
| ---- | -------------------------------------------------------- |
| 1    | Phase 1 security (views, auth feature, upgrade prep)     |
| 2    | Phase 2 (search_path + start RLS consolidation)          |
| 3    | Finish RLS + begin index observation window              |
| 4    | Phase 3 index decisions + implement automation (Phase 4) |

---

## 10. Acceptance Criteria

- All SECURITY DEFINER views removed or justified with documented rationale.
- 0 functions without explicit fixed `search_path` (or justified exceptions listed).
- No duplicate permissive policies per table/role/action.
- RLS policies referencing auth helpers use sub-select pattern.
- Missing FK index created.
- Unused index list shrinks with logged decisions (kept vs dropped).
- Advisor ingestion automation deployed; dashboard metric available.

---

## 11. Quick Wins Checklist

- [ ] Enable leaked password protection
- [ ] Add FK index on `moderation_actions.created_by`
- [ ] Recreate `v_model_counts_public` as SECURITY INVOKER
- [ ] Add explicit search_path to `track_user_usage`
- [ ] Consolidate duplicate policies on `profiles`

---

## 12. Next Steps

1. Obtain approval on phased plan.
2. Open issues for each phase with scoped task lists.
3. Implement Phase 1; capture before/after advisor snapshot.
4. Proceed sequentially; update this document upon phase completion.

---

## 13. Appendix – Raw Advisor Sources

Source markdown files retained in `database/advisors/` for traceability.

---

## 14. Summary

Primary risks center on privilege model clarity (definer views) and policy performance. Addressing security items first reduces blast radius; subsequent optimizations improve query efficiency and governance. Automation ensures drift detection going forward.

---

## 15. Implementation Plan – Option A (Service‑Role Mediated Admin Analytics)

Goal: Restrict sensitive analytics views so only server code (service role) can read them after an app‑level `is_admin` check. End users (even authenticated) never receive direct grants to admin-only views.

### Guiding Principles

- Principle of Least Privilege: Only `service_role` has SQL-level access to admin analytics views.
- Application Enforcement: API layer validates `is_admin` (derived from `profiles.account_type` or equivalent) before issuing service-role queries.
- Defense in Depth: Base tables keep RLS; views remain simple aggregates (no SECURITY DEFINER functions).
- Auditability: All changes captured in patch SQL under `database/patches/phaseX-admin-analytics/`.

### Phase A1 – Baseline & Inventory

(Status: In Progress – baseline snapshot captured)

Baseline inventory file created: `database/patches/admin-analytics-access-hardening/00_A1_baseline_inventory.md`

Subtasks:

- [x] List current grants on target views (SQL template prepared in baseline file – pending execution & paste of results)
- [x] Capture current advisor snapshot reference (see Section 3 of baseline file)
- [x] Confirm which views are admin-only vs safe-public (decision still pending; table scaffolded)
- [ ] User Verification: Provide baseline grants table for approval (awaiting executed query results)

### Phase A2 – SQL Grant Hardening

- [ ] Create patch script: revoke ALL from `PUBLIC`, `anon`, `authenticated` for admin-only views.
- [ ] Grant SELECT only to `service_role` for admin-only views.
- [ ] (If any view intentionally public, explicitly grant minimal SELECT to `anon` / `authenticated` and document rationale.)
- [ ] Add COMMENT to each view noting access model & false-positive advisor context.
- [ ] User Verification: Run `information_schema.role_table_grants` diff pre/post and confirm expected reduction.

### Phase A3 – API Route Refactor

- [ ] Identify all routes calling affected views (overview, models, usage, etc.).
- [ ] Replace any user-session Supabase client usage with imported `service` client for those specific admin analytics queries only.
- [ ] Insert explicit admin guard early (`if (!ctx.profile?.is_admin) return 403`).
- [ ] Ensure no leakage of raw user-level records beyond aggregates the route is supposed to return.
- [ ] User Verification: Manual test hitting admin endpoints as admin vs non-admin (expect 403 for non-admin).

### Phase A4 – Policy & Schema Hygiene (Supportive)

- [ ] Consolidate duplicate permissive RLS policies on underlying tables (`message_token_costs`, etc.) – single permissive SELECT policy plus admin override OR logic.
- [ ] Ensure no policy now grants broader access that makes service-role indirection moot.
- [ ] User Verification: Provide updated policy list with before/after summary; run sample SELECT as non-admin (expect restricted rows) vs admin (expect full aggregates via service).

### Phase A5 – Testing & Validation

- [ ] Add unit tests for admin analytics API routes (mock: admin vs non-admin profile) ensuring service client path taken.
- [ ] Add regression test ensuring 403 for non-admin when attempting to access analytics routes.
- [ ] Add snapshot test verifying shape of analytics response unchanged (fields, types).
- [ ] User Verification: Test results (all green) & summarized coverage report.

### Phase A6 – Observability & Logging

- [ ] Add structured log on each admin analytics request: `{ route, requestId, isAdmin, durationMs }` (exclude sensitive metrics details).
- [ ] Add optional sampling for high-frequency endpoints.
- [ ] User Verification: Provide sample log lines and confirm no PII.

### Phase A7 – Advisor Re-run & Documentation

- [ ] Re-run Supabase Advisors; capture new snapshot.
- [ ] Annotate false-positive rationale for `security_definer_view` findings if still present.
- [ ] Update `docs/architecture/` with “Admin Analytics Access Model (Option A)” explaining flow & threat model.
- [ ] User Verification: Approve updated docs & advisor snapshot diff.

### Phase A8 – Rollout & Cleanup

- [ ] Deploy patch to staging; soak test (24h) watching logs & error rate.
- [ ] Deploy to production during low-traffic window.
- [ ] Remove any obsolete public grants / unused views (e.g., drop `user_usage_daily_metrics` if still unused).
- [ ] Final advisor scan; ensure no new HIGH findings.
- [ ] User Verification: Sign off final checklist; close related issue(s).

### Deliverables

- Patch SQL files (A2, optional A4).
- Updated API route code using service client.
- New / updated tests.
- Documentation page & inline view comments.
- Advisor baseline & post-change snapshots.

### Rollback Plan

If unexpected access failures:

1. Temporarily grant SELECT back to `authenticated` on impacted view.
2. Re-run failing route test to confirm recovery.
3. Investigate service-role env/config; revert grants once fixed.

### Success Metrics

- 0 direct end-user (non-admin) successful SELECTs on admin-only views (confirmed via query log sampling if enabled).
- All admin analytics routes return same or improved latency (service-role should not degrade performance).
- Advisor HIGH severity count does not increase; false-positive entries documented.

### Open Questions (to confirm before execution)

- Is `user_model_costs_daily` intended for any non-admin path? (Currently used in both user & admin routes.) If yes, split into two views or parameterize via RLS rather than restricting entirely.
- Should `v_model_counts_public` remain broadly accessible for non-auth landing metrics? If so, keep GRANT for `anon` & document as deliberate exposure.

### User Review Gate

Execution will begin only after you check off: “Approved Option A plan”.
