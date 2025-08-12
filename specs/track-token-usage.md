# Token Cost & Usage Tracking Specification

Status: Phase 1 Implemented (Backfill skipped) – proceeding to Phase 2
Author: Copilot Agent
Last Updated: 2025-08-12

## Overview

Introduce per-assistant-message granular cost tracking derived from token usage and model pricing. Persist this for user-facing reporting and future billing/analytics. Implement in phased approach:

- Phase 1: Database schema, cost calculation function, trigger integration, aggregation view, (optional) backfill.
- Phase 2: Authenticated UI & API endpoints for per-user cost exploration (filters + pagination + summaries).
- Phase 3: Advanced analytics (charts, budgets/alerts, performance optimizations, admin dashboards, historical pricing, exports).

## Clarification Outcomes

1. Pricing units: `prompt_price` & `completion_price` are stored PER TOKEN (initial assumption of per‑million was corrected in Patch 003); `image_price` (future) assumed per image unit.
2. Update behavior: Single snapshot on INSERT only. No recalculation trigger needed (streaming not currently mutating rows mid-flight). Any future streaming feature can add an UPDATE path.
3. Backfill: Skipped (forward-only tracking beginning after deployment). No historical cost rows will be generated.
4. Currency precision: Use DECIMAL(12,6) USD with round half up at 6 decimal places.
5. Phase 2 UX: Quick presets (Today / 7D / 30D / Custom) + model filter; default page size = 50.

Open Decisions: None (backfill explicitly skipped; pricing unit correction applied).

## Adjusted Assumptions (Post Patch 003)

- Prices are stored as strings representing cost PER TOKEN (prompt & completion). Image pricing deferred.
- Cost formulas:
  - `prompt_cost = ROUND( (prompt_tokens * prompt_unit_price)::numeric, 6 )`
  - `completion_cost = ROUND( (completion_tokens * completion_unit_price)::numeric, 6 )`
  - `image_cost = ROUND( (image_units * image_unit_price)::numeric, 6 )` (currently image_units = 0)
  - `total_cost = prompt_cost + completion_cost + image_cost`
- Only successful assistant messages (role='assistant' AND (error_message IS NULL OR error_message='')) generate cost entries.
- Single snapshot on INSERT; no UPDATE recalculation.
- Cost contributes additively to `user_usage_daily.estimated_cost`.
- `pricing_source` JSONB captures original string fields including per-million/per-thousand context for audit.
- Backfill skipped; any future historical ingestion would be a new phase requiring pricing history design.

## Phase 1 – Database Layer

Goal: Persist cost per assistant message and integrate into daily usage summarization.

### Data Model

New table: `public.message_token_costs`
Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
- `session_id TEXT NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE`
- `assistant_message_id TEXT NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE`
- `user_message_id TEXT NULL` (logical reference; not FK enforced if optional)
- `completion_id VARCHAR(255)`
- `model_id VARCHAR(100)` (captured from `chat_messages.model`)
- `message_timestamp TIMESTAMPTZ NOT NULL` (from assistant message)
- `prompt_tokens INTEGER NOT NULL DEFAULT 0`
- `completion_tokens INTEGER NOT NULL DEFAULT 0`
- `total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED` (if allowed; else maintain in trigger)
- `prompt_unit_price DECIMAL(12,8)`
- `completion_unit_price DECIMAL(12,8)`
- `image_units INTEGER NOT NULL DEFAULT 0`
- `image_unit_price DECIMAL(12,8)`
- `prompt_cost DECIMAL(12,6)`
- `completion_cost DECIMAL(12,6)`
- `image_cost DECIMAL(12,6)`
- `total_cost DECIMAL(12,6)`
- `pricing_source JSONB NOT NULL DEFAULT '{}'::jsonb` (snapshot of relevant pricing fields from model_access)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- `idx_message_token_costs_user_time (user_id, message_timestamp DESC)`
- `idx_message_token_costs_session_time (session_id, message_timestamp)`
- `idx_message_token_costs_model (model_id)`
- Unique constraint on `assistant_message_id`.

RLS Policies:

- Enable RLS.
- Select: owner only (`user_id = auth.uid()`).
- Insert/Update: via server-side function only (no direct client insert needed).
- Admin read override using `public.is_admin(auth.uid())`.

### Functions & Triggers

1. `public.calculate_and_record_message_cost()`

   - Input: NEW row from `chat_messages` (assistant only)
   - Steps:
     - Guard: role='assistant' AND (error_message IS NULL OR empty)
     - Acquire `user_id` via `chat_sessions.session_id = NEW.session_id`.
     - Lookup model pricing from `model_access` by `NEW.model`; fallback zeros if not found.
     - Parse unit prices to numeric.
     - Compute costs using per-token (and future per-image) formulas defined above.
     - Insert into `message_token_costs` with pricing snapshot.
     - Increment `user_usage_daily.estimated_cost` for that `user_id` & current date.
     - On conflict (assistant_message_id) either DO NOTHING or UPDATE if token counts changed (depends on update policy).

2. (Deferred unless needed) Backfill function `public.backfill_message_costs(p_days INT DEFAULT NULL)` — pending decision (#3).

3. Trigger:

   - `after_assistant_message_cost` AFTER INSERT ON `public.chat_messages` FOR EACH ROW WHEN (NEW.role='assistant') EXECUTE FUNCTION `calculate_and_record_message_cost()`.

4. Per-Model Daily View: `public.user_model_costs_daily` (replaces prior aggregated view concept)

   - Columns: user_id, usage_date (DATE), model_id, prompt_tokens, completion_tokens, total_tokens, total_cost, assistant_messages.
   - Purpose: fine-grained per-model breakdown leveraging base table RLS (users only see their own rows; admins see all via base policy).

5. Admin Global Aggregation Function: `public.get_global_model_costs(p_start_date DATE, p_end_date DATE, p_granularity TEXT)`

   - Returns: usage_period (DATE), model_id, prompt_tokens, completion_tokens, total_tokens, total_cost, assistant_messages, distinct_users.
   - Granularity: day | week | month (default day) via date_trunc.
   - SECURITY DEFINER with admin check `public.is_admin(auth.uid())`.

6. Backfill (skipped): No historical population; view and function operate only on forward-collected data.

### Edge Cases & Error Handling

- Missing pricing: costs set to 0; `pricing_source` includes `{ "missing_pricing": true }`.
- Division or scaling errors: function returns early with zeroed cost and logs via RAISE NOTICE (non-fatal).
- Re-entrant insert: uniqueness prevents duplicates.
- Rounding: apply standard rounding (to 6 decimal places) at cost computation.

### Testing Plan (SQL Manual)

1. Insert test model_access row with non-zero prices.
2. Insert session & messages (user then assistant with token counts).
3. Verify row in `message_token_costs` and `user_usage_daily.estimated_cost` increment.
4. Update assistant message tokens (if update trigger enabled) and verify recalculation.
5. Query aggregated view.

### Phase 1 Task Checklist

- [x] Clarifications incorporated (backfill skipped)
- [x] Patch directory `database/patches/token-cost-tracking/`
- [x] Table `message_token_costs`
- [x] RLS policies
- [x] Function `calculate_and_record_message_cost()`
- [x] INSERT trigger
- [x] Per-model daily view `user_model_costs_daily`
- [x] Admin aggregation function `get_global_model_costs`
- [x] Documentation updates (this spec + dedicated database doc)
- [x] Manual SQL test script (in `docs/database/token-cost-tracking.md`)
- [x] User verification checkpoint (awaiting user sign-off)

### Phase 1 Verification Checklist

- [x] Costs correctly computed for new assistant messages (per-token scaling)
- [x] No duplicate cost rows (unique assistant_message_id)
- [x] `user_usage_daily.estimated_cost` increment matches sum of inserted cost row(s)
- [x] Per-model daily view returns expected breakdown for a test user
- [x] Admin function returns multi-user aggregated data (admin session) while blocking non-admin
- [x] RLS prevents cross-user access via direct selects on base table

## Phase 2 – API & UI Layer

Goal: Provide authenticated users with a costs page (filters, pagination, summary).

### API Endpoints

1. `GET /api/usage/costs`
   - Auth: protected
   - Query Params: `range` (today|7d|30d|custom), `start`, `end`, `model_id`, `page`, `page_size`
   - Response: `{ items: [...], pagination: { page, page_size, total, total_pages }, summary: { total_cost, total_tokens, prompt_tokens, completion_tokens, cost_per_1k (if meaningful), top_models: [...] } }`
2. `GET /api/usage/costs/daily`
   - Auth: protected
   - Params: same date range + optional model
   - Response: daily series for charts.

### Frontend Page `/app/usage/costs` (proposed)

Components:

- DateRangeFilter (presets + custom) & ModelSelect
- SummaryCards (Cost, Tokens, Avg Cost / 1K, Top Model)
- CostTable (paginated)
- (Phase 3 placeholder) ChartArea

### Phase 2 Task Checklist

- [x] Confirm route & UX decisions (range presets today/7d/30d, model filter, pagination size selector)
- [x] Implement API endpoints with middleware (`/api/usage/costs`, `/api/usage/costs/daily` using `withProtectedAuth`)
- [x] Add SQL query builder (pagination + filters) server-side (Supabase range + count + aggregation loop)
- [x] Add page & components leveraging existing UI system (`src/app/usage/costs/page.tsx` – summary cards, tables, filters)
- [x] Integrate fetch pattern (simple manual fetch; SWR enhancement optional)
- [~] Add unit tests (utilities covered; API handler tests deferred due to Next.js Request polyfill complexity in current Jest env) → see "Test Coverage Notes" below
- [x] Update docs `/docs/components/usage-costs.md` (completed initial documentation)
- [x] User verification checkpoint (manual QA completed by user)

### Phase 2 Verification Checklist

- [x] Filters return expected subsets (verified manually)
- [x] Pagination metadata accurate (manual QA)
- [x] Summary matches aggregation of current filter (manual QA)
- [x] RLS / auth enforced (endpoints wrapped with `withProtectedAuth`)
- [x] Performance acceptable (<300ms typical dev dataset – observed manually; future automated perf test optional)

### Test Coverage Notes

Current automated tests:

- Utility layer: date range parsing, top model aggregation, rounding, query parsing (`tests/lib/usageCosts.test.ts`).

Deferred:

- Direct API handler tests blocked by Next.js `Request` polyfill mismatch in existing Jest configuration; would require additional environment shims or using Next test utilities. Given manual verification completed and low complexity of handlers, deferring until Phase 3 if deeper regression protection needed.

Risk Mitigation:

- Core logic (aggregation, date range, top models) already isolated & tested.
- RLS and auth rely on shared middleware previously covered elsewhere.

## Phase 3 – Advanced Analytics (Menu of Options)

Prioritize after user feedback.

### Candidate Features

1. Charts & Trends: line (daily cost), stacked per-model area, cost vs output token efficiency scatter.
2. Budgets & Alerts: user-set monthly budget, notification at threshold (80%, 100%).
3. Session Drilldown: costs integrated into session list & per-session cost breakdown.
4. Performance Optimization: materialized views for rolling 30-day metrics; scheduled refresh.
5. Real-Time Estimates: streaming accumulation of estimated cost during assistant generation.
6. Admin Dashboard: global cost usage, top users, per-model revenue, anomaly detection.
7. Historical Pricing Archive: pricing snapshot table to preserve day-over-day changes & retroactive comparisons.
8. Export & Billing Prep: CSV export & Stripe reconciliation placeholders.
9. Efficiency Metrics: cost per 1k output tokens; prompt to completion token ratio anomaly flags.

### Phase 3 Task Skeleton (To Be Selected)

- [ ] Select subset of features
- [ ] Design pricing snapshot table (if chosen)
- [ ] Implement chosen charts/components
- [ ] Add materialized views / refresh job (if needed)
- [ ] Document enhancements
- [ ] User verification checkpoint

## Security & Compliance Considerations

- RLS strictly ties cost rows to user_id.
- API must use existing `withProtectedAuth` middleware—no inline auth logic.
- Pricing snapshot prevents retroactive distortion after model price changes.
- Potential PII: minimal (user_id only); no content stored here beyond message references.

## Performance Considerations

- Assistant message volume could be high; indexing ensures per-user queries efficient.
- Aggregated view reduces recomputation in UI endpoints.
- Optional future materialized views for large-scale reporting.

## Failure & Edge Case Handling

- Missing model pricing → zero cost row logged; future admin report could highlight.
- Token counts zero → cost zero; if recalculation strategy accepted, update later.
- Backfill prevents double-charging via unique constraint.
- Rounding: consistent central function ensures deterministic totals.

## Open Decisions Recap (Post-Clarification)

- Backfill scope & timing (only remaining open item)

Resolved:

- Pricing unit correction (now confirmed per-token)
- Immutable snapshot approach
- Currency precision & rounding
- UX filter pattern & default page size

## Next Steps

Backfill decision → then proceed with Phase 1 patch creation.

---

Please respond with clarifications or adjustments; I will then mark Phase 1 planning as approved and start implementation.
