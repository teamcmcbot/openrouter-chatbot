# Elapsed Time Precision Migration (Seconds -> Milliseconds)

## Objective

Improve accuracy of assistant response latency measurement by switching from server-side derivation using `openRouterResponse.created` (seconds precision, server-issued epoch) to a high-resolution wall-clock measurement captured client/server side (milliseconds) spanning the request lifecycle.

Current approach:

- Backend (`/api/chat`) computes `elapsed_time = now - openRouterResponse.created` (both in seconds). `openRouterResponse.created` is an integer epoch (seconds) returned by OpenRouter.
- Value stored in `chat_messages.elapsed_time` (INTEGER) via subsequent sync / insertion logic (assistant message rows contain seconds).
- Triggers: `update_session_stats()` passes `COALESCE(NEW.elapsed_time,0)` to `track_user_usage()` as `active_minutes` parameter (confusing naming: seconds interpreted as minutes). Ultimately increments `user_usage_daily.active_minutes` (INTEGER). Frontend UI displays `(Took X seconds)` for assistant messages.

Issues:

1. Precision: Only whole seconds; fast responses ( < 1s ) appear as 0 seconds.
2. Semantics mismatch: A field named `active_minutes` accumulates raw seconds (adds `elapsed_time` which is in seconds). UX strings like "Active time today: X minutes" may display inflated or misleading numbers unless converted.
3. Dependency chain risk: Changing unit (seconds -> milliseconds) without remediation will inflate downstream aggregates by factor 1000 if blindly summed.
4. Source of truth: Relying on provider timestamp introduces network and queue time uncertainty (model creation time may precede our request receipt depending on provider semantics). Measuring locally captures end-to-end latency (request send -> response received) which better reflects user-perceived latency.

## Proposed New Measurement Strategy

Capture timestamps bracketing the external API call:

- `t_start = performance.now()` (frontend) or `Date.now()` (backend) immediately before `fetch` to OpenRouter.
- `t_end = Date.now()` (backend) immediately after full response body parsed (or after first token if streaming—future extension).
- Compute `elapsed_ms = t_end - t_start` (integer milliseconds). Round to nearest integer.
- Persist milliseconds as primary unit.
- Provide derived seconds to legacy consumers (UI text) by formatting: `(Took (elapsed_ms/1000).toFixed(1)s)`.

## Scope of Impact

### Database Layer

Tables & functions:

- `chat_messages.elapsed_time INTEGER` currently stores seconds. Options:

  1. Replace column with `elapsed_ms INTEGER` (or BIGINT) and keep a backward-compatible generated column / view.
  2. Keep column name but redefine semantics to milliseconds (risk: silent change). Not recommended.
  3. Add new column `elapsed_ms INTEGER`, migrate historical seconds -> multiply by 1000, later deprecate old column.

- `update_session_stats()` trigger passes `COALESCE(NEW.elapsed_time,0)` to `track_user_usage()` representing `active_minutes`. If we add ms, we must decide what `active_minutes` intends to measure.
- `user_usage_daily.active_minutes INTEGER` currently aggregates sums of seconds. Name implies minutes but units are seconds. Need to resolve:
  - Rename column to `active_seconds` (preferred) + optional derived minutes in views.
  - Or convert to true minutes (e.g., sum elapsed_ms / 60000, rounded) which changes historical numbers.

Backward compatibility considerations:

- Analytics UI and any SQL queries expecting existing column names.
- Migration complexity vs clarity.

Recommendation:

1. Phase 1 (Additive):
   - Add `elapsed_ms INTEGER DEFAULT 0` to `chat_messages`.
   - Backfill: `UPDATE chat_messages SET elapsed_ms = elapsed_time * 1000 WHERE elapsed_ms = 0;`.
   - Update insertion paths to write both (`elapsed_ms` authoritative, compute `elapsed_time = floor(elapsed_ms/1000)` for now).
2. Phase 2 (Analytics Hygiene):
   - Add `active_ms BIGINT DEFAULT 0` to `user_usage_daily`.
   - Modify `track_user_usage(p_active_ms INTEGER DEFAULT 0)` (overload or parameter rename) capturing ms not seconds.
   - Continue populating legacy `active_minutes` while setting `active_ms += p_active_ms`.
   - Create view `user_usage_daily_view` exposing:
     - `active_seconds = active_ms / 1000`
     - `active_minutes = ROUND(active_ms / 60000.0,2)`
3. Phase 3 (Deprecation):
   - Update frontend to use new `active_seconds` / derive display.
   - After verification window, drop legacy columns or mark deprecated in schema comments.

Simpler short-term alternative (if rapid change required): reinterpret existing `elapsed_time` as milliseconds. Reject due to hidden multiplier risk in aggregated analytics (inflating by 1000x).

### Backend (API)

`src/app/api/chat/route.ts`:

- Replace current epoch-based diff with local measurement.
  - Record `const start = Date.now();` before `getOpenRouterCompletion` call.
  - After response: `const elapsedMs = Date.now() - start;`
  - For now, provide both: `elapsed_time` (seconds = Math.max(1, Math.round(elapsedMs/1000))) for display, and `elapsed_ms` raw passed forward (extend `ChatResponse`).
- Adjust `ChatResponse` type and subsequent persistence pipeline (where assistant messages get stored) to include ms.
- Ensure streaming path (if added later) sets `elapsed_ms` when final token completes; interim partials could remain undefined.

`lib/types/chat.ts`:

- Add optional `elapsed_ms?: number` to `ChatMessage` & `ChatResponse`.
- Eventually mark `elapsed_time` as deprecated.

`lib/utils/openrouter.ts`:

- No longer needed: `openRouterResponse.created` for latency (retain for logging). Remove or keep debug output.

Usage tracking:

- When saving assistant message to DB (wherever insertion code is), include `elapsed_ms`.
- Modify server insertion logic to compute `active_ms` argument to new usage function once implemented (Phase 2).

### Frontend

`components/chat/MessageList.tsx`:

- Display formatted seconds with one decimal place from `elapsed_ms` if available:
  - If `elapsed_ms < 1000`, show `(<1s)` or `(< 1.0s)`; else `(${(elapsed_ms/1000).toFixed(1)}s)`.
- Maintain legacy fallback to `elapsed_time` (integer seconds) during transition.

User Settings / Analytics components (`UserSettings.tsx` etc.):

- If they reference `active_minutes`, confirm conversion logic. Presently appears to directly use integer value -> label "Active time today: x minutes" could be inaccurate. Need to audit formatting logic.
- Post-migration: Use derived minutes = `Math.round(active_ms / 60000)` or `active_seconds / 60` as appropriate.

### Tests

- Update `tests/components/MessageList.test.tsx` mocking both `elapsed_time` and `elapsed_ms`.
- Add test for sub-second latency display.

### Data Migration Strategy

1. Create patch file: `/database/patches/elapsed-time-ms/001-add-elapsed-ms.sql`:
   - `ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER DEFAULT 0;`
   - Backfill existing records.
2. Optional: Add patch for `user_usage_daily.active_ms` later.
3. Provide idempotent checks.

### Potential Edge Cases & Considerations

- Clock Skew: Using local server times for start/end is acceptable; if multiple servers handle request lifecycle, ensure elapsed measurement occurs on a single instance (current architecture likely single process for chat endpoint call).
- Retries inside `getOpenRouterCompletion`: Our elapsed measurement should wrap the entire function call (including internal retries). Decide if we prefer first-attempt latency vs total user-perceived latency; choose total (wrap full call).
- Streaming (future): For streamed responses, should measure until stream completion; may introduce separate metrics (TTFT vs total generation time).
- Analytics Inflation: Avoid adding ms totals into second-based fields before schema change completed.
- Null / Failed Messages: Do not record latency for failed assistant messages with `error_message` set (or record `NULL`/0 but exclude from usage accumulation).

### Open Questions (Need Clarification Before Implementation)

1. Should `active_minutes` truly represent engagement time (wall time) or model generation time only? Rename suggestion: `generation_ms` / `active_ms`.
2. Is it acceptable to add new columns & keep legacy columns for a deprecation window?
3. Required precision for UI: integer milliseconds, one decimal second, or full ms? (recommend 0.1s resolution).
4. Historical data migration: Do we want to preserve current values as seconds (multiply by 1000) or treat them as low-precision approximations? (plan: multiply for continuity).
5. Any downstream external exports / BI tools expecting current field names?

## Summary of Required Changes (Phase 1 Minimal)

- DB: Add `chat_messages.elapsed_ms` + backfill.
- Backend: Measure elapsed locally in ms; populate both `elapsed_ms` & legacy `elapsed_time` (seconds rounded) in responses & inserts.
- Types: Extend `ChatMessage`, `ChatResponse`.
- Frontend: Prefer `elapsed_ms` for display with improved formatting.
- Tests: Update & add precision test.
- Docs: New spec (this file) + update any analytics docs referencing elapsed_time seconds.

## Follow-Up (Phase 2+)

- Introduce `user_usage_daily.active_ms` & migrate/rename `active_minutes`.
- Adjust triggers and `track_user_usage` signature.
- Update analytics UI and docs to show min/sec formatting.

---

Please review Open Questions and confirm Phase 1 scope before implementation patches.
