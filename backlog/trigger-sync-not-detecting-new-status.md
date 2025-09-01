# Trigger sync: "New" status not detected in analytics

Observed: The Models tab in Admin Analytics shows New = 0 consistently, and the "Recent changes (30d)" table shows 0 in the New column across days, despite OpenRouter adding new models in the last two weeks. Trigger sync is working and inserts rows into `model_access` with `status = 'new'` initially, but the analytics-derived "modelsAdded" appears to remain 0.

## TL;DR hypothesis

- The analytics view counts final status among rows updated on a given day (by `updated_at`), not transitions or creations. If a model is inserted as `new` and then immediately updated to `active`/`disabled` in the same sync cycle (or later the same day), the final status on that day is not `new`, so the daily "New" count remains 0. Similarly, the top-level "New" metric we surface likely reflects current status counts, not "newly added" counts.
- In short: "modelsAdded" is measuring the wrong thing. It should count rows created that day (`created_at`), not rows whose final status that day equals `new`.

## Evidence and code pointers

- UI: `src/app/admin/AnalyticsPanel.tsx` → Models tab renders `ModelsResponse.recent` with columns New/Active/Inactive/Disabled/Total. Screenshot shows 0 for New across many days.
- API: `src/app/api/admin/analytics/models/route.ts` fetches 2 sources:
  - `v_model_counts_public` for aggregate counts.
  - `v_model_recent_activity_admin` for daily recent activity.
- DB views (schema): `database/schema/04-system.sql`
  - `v_model_counts_public`: counts current rows in `model_access` grouped by status.
  - `v_model_recent_activity_admin`: groups by `DATE_TRUNC('day', updated_at)` and counts by `status` using FILTER. This counts the final status of rows that were updated on each day.

Therefore:

- "New (30d)" in the daily table is not "models added that day"; it’s "rows whose current status is 'new' among those updated that day".
- If the sync job immediately changes status from `new` → `active`/`disabled` (e.g., when merging OpenRouter availability and our allowlist/flags), daily New will often be 0.
- Top-row New in the Models summary also reads from current status counts, which can be 0 even if many models were newly inserted recently.

## Repro/validation steps (SQL probes)

- Expected creations vs analytics daily "New":
  1. Compare created vs daily flagged_new for a specific date (replace $DAY):
     - Creations: `SELECT COUNT(*) FROM public.model_access WHERE created_at::date = $DAY;`
     - View: `SELECT flagged_new FROM v_model_recent_activity_admin WHERE day::date = $DAY;`
  2. If the first query is > 0 and the second is 0, that confirms the mismatch.
- Check if newly inserted rows quickly change status:
  - `SELECT model_id, status, created_at, updated_at FROM public.model_access WHERE created_at::date = $DAY ORDER BY updated_at DESC LIMIT 50;`
  - If many show `status IN ('active','disabled')` with `updated_at > created_at` (same day), that explains the zero "New".

## Likely root cause

- Metric semantics mismatch: we’re using `updated_at` and current `status = 'new'` to display "New" counts. That measures "final status on update day" rather than "added on day".
- Trigger sync behavior is fine (rows are inserted as `new`), but subsequent logic within the same sync/run flips many of those to `active` or `disabled`, erasing their visibility as `new` in the daily view.

## Proposed fixes (incremental)

1. Low-risk hotfix (semantics-correct for "added")

   - Adjust analytics to compute daily "New" as count of rows created that day, independent of current status.
   - Implementation options:
     - A) Modify `v_model_recent_activity_admin` so `flagged_new` uses `COUNT(*) FILTER (WHERE created_at::date = day::date)` by precomputing `day := DATE_TRUNC('day', created_at)` for "new"; keep the other columns grouped by `updated_at` or split into two subqueries joined on day.
     - B) Add a companion admin view `v_models_added_30d` grouped by `DATE_TRUNC('day', created_at)` and return it from the API as `recent_added`; keep existing view untouched for the other statuses. UI maps the "New" column from `recent_added` instead of the old `flagged_new`.
   - Pros: Correctly reflects "models added per day" with minimal schema change.
   - Cons: Different columns in the table come from different time bases (`created_at` vs `updated_at`). We should denote this in code/comments.

2. Robust solution (true transition analytics)
   - Add a status-change audit log to capture transitions (old_status → new_status, changed_at). Example:
     ```sql
     CREATE TABLE public.model_status_history (
       model_id text NOT NULL,
       changed_at timestamptz NOT NULL DEFAULT now(),
       old_status text,
       new_status text NOT NULL,
       PRIMARY KEY (model_id, changed_at)
     );
     ```
   - Trigger on `public.model_access` BEFORE UPDATE to insert into history when `OLD.status IS DISTINCT FROM NEW.status`.
   - Build a view `v_model_status_transitions_30d` that aggregates transitions per day, including a distinct metric for `new` → `*` on `created_at` or explicit `NULL → new` insert events (captured via separate insert log or by deriving from `created_at`).
   - UI then displays true per-day transition counts for each status.
   - Pros: Accurate and extensible time-series analytics.
   - Cons: Requires forward-only schema change and migration; historical backfill needed for older events.

## Acceptance criteria

- For a day where N models were inserted (verified via `created_at`), the Models daily table shows New = N for that day.
- Top-row "New" clearly indicates what it represents:
  - Option 1: Current count of rows with status `new`. If we keep this, leave label as "New".
  - Option 2: Newly added in last 30 days (distinct by `created_at`). If we change semantics, label as "Added (30d)" to avoid confusion.
- Unit test or SQL assertion added to verify the new view logic (e.g., synthetic fixtures with an insert followed by status flip on the same day still count as New=1 for that day).

## Risks/Notes

- Mixing `created_at` vs `updated_at` time-basis in one table can confuse readers. If the quick fix is adopted, add a tooltip or note: "New counts are based on creation date; other columns reflect final status among rows updated that day."
- If we choose the history table approach, ensure RLS-safe admin-only exposure via views or `SECURITY DEFINER` functions.

## Plan (phased with checkboxes)

### Phase 1 — Confirm mismatch (diagnosis)

- [ ] Run the two SQL probes on the last 14 days and paste a small sample in the issue comments.
- [ ] Verify one day with inserts where daily `flagged_new` is 0 to confirm the hypothesis.
- [ ] User verification: confirm the observed mismatch aligns with product expectations (New should mean "added that day").

### Phase 2 — Hotfix: count New by created_at

- [ ] Add a new admin view `v_models_added_30d` grouped by `DATE_TRUNC('day', created_at)`.
- [ ] Update `/api/admin/analytics/models` to also return `recent_added`.
- [ ] Update UI to map the "New" column from `recent_added` while keeping the other columns from `v_model_recent_activity_admin`.
- [ ] Tests: add a small DB test or mock verifying insert→same-day status flip still shows New=1 for that day.
- [ ] Build passes and manual smoke test on Admin Analytics.
- [ ] User verification: confirm "New" shows non-zero on days with known additions.

### Phase 3 — Robust: status transition history (optional, recommended)

- [ ] Create `model_status_history` table and trigger on `model_access` for status changes.
- [ ] Create `v_model_status_transitions_30d` to aggregate transitions per day.
- [ ] API: return transition series; UI: optionally add a "Transitions" detail view or make daily table fully transition-based.
- [ ] Backfill (best-effort) using `created_at`/`updated_at` deltas if feasible.
- [ ] User verification: transition counts match expectations in a controlled test.

### Phase 4 — Docs and cleanup

- [ ] Document the metrics semantics in `/docs/admin/api/` and UI tooltips.
- [ ] If hotfix semantics were adopted, add a small note in the table header.
- [ ] Merge view changes into canonical schema after sign-off.

## Clarifying questions (please confirm)

1. Should "New" in the daily table represent "created that day" (recommended), or "current status is new among rows updated that day" (current behavior)?
2. For the top-level "New" metric card, should it be current `status='new'` count, or "Added in last 30 days"? If the latter, we’ll rename it to avoid confusion.
3. Is it acceptable to implement the Phase 2 hotfix first, and consider Phase 3 (history-based) later?
4. Do we want to expose a separate "Added" column (based on `created_at`) and keep "New" as current status, or simply redefine "New" to mean "Added"?
5. Are there any downstream consumers (dashboards/exports) relying on the current `v_model_recent_activity_admin.flagged_new` semantics?

## References

- UI: `src/app/admin/AnalyticsPanel.tsx` (Models tab rendering)
- API: `src/app/api/admin/analytics/models/route.ts`
- DB: `database/schema/04-system.sql` (views) and `database/schema/03-models.sql` (`model_access`)

---

Owner: TBD  
Priority: High (data correctness)  
Labels: analytics, db, admin, bug
