# Elapsed Time Precision Migration (Seconds -> Milliseconds) – Final Implemented Spec

## Objective

Improve accuracy of assistant response latency measurement by switching from server-side derivation using `openRouterResponse.created` (seconds precision, server-issued epoch) to a high-resolution wall-clock measurement captured client/server side (milliseconds) spanning the request lifecycle.

Legacy approach (now removed): server diff of `now - openRouterResponse.created` in whole seconds stored as `elapsed_time` and aggregated through a misnamed `active_minutes` chain.

Problems solved:

1. Whole‑second truncation obscured sub‑second latencies.
2. Misnamed `active_minutes` actually summed raw seconds causing misleading analytics.
3. Provider timestamp was an unreliable proxy for user‑perceived latency.
4. Risk of accidental 1000× inflation during any partial migration.

## Implemented Measurement Strategy

Capture timestamps bracketing the external API call:

Backend wraps the external completion call with `Date.now()` start/end and returns `elapsed_ms` (integer). UI formats `(Took X.Ys)` with one decimal. No legacy seconds field is retained.

## Scope of Impact

### Database Layer (Final)

Replaced `chat_messages.elapsed_time` with `elapsed_ms` (INTEGER). Removed `active_minutes`; introduced `generation_ms` (BIGINT) in `user_usage_daily` plus updated functions (`track_user_usage`, `update_session_stats`, `track_session_creation`, `get_user_complete_profile`). Added a derived metrics view for seconds/minutes formatting. Wiped prior dev data per directive.

### Backend (API)

`/api/chat` now returns `elapsed_ms` only. Hooks and components updated. Sync and message CRUD endpoints write/read `elapsed_ms`.

Types updated: removed `elapsed_time`, added `elapsed_ms`.

`lib/utils/openrouter.ts`:

- No longer needed: `openRouterResponse.created` for latency (retain for logging). Remove or keep debug output.

Usage tracking:

- When saving assistant message to DB (wherever insertion code is), include `elapsed_ms`.
- Modify server insertion logic to compute `active_ms` argument to new usage function once implemented (Phase 2).

### Frontend

Message list shows `(Took X.Ys)` from `elapsed_ms`. One decimal precision; omitted if zero/undefined.

User Settings / Analytics components (`UserSettings.tsx` etc.):

- If they reference `active_minutes`, confirm conversion logic. Presently appears to directly use integer value -> label "Active time today: x minutes" could be inaccurate. Need to audit formatting logic.
- Post-migration: Use derived minutes = `Math.round(active_ms / 60000)` or `active_seconds / 60` as appropriate.

### Tests

Updated component test expects `Took 7.2s` from `elapsed_ms=7200`.

### Data Migration

Direct destructive migration performed (dev environment). Dropped legacy columns, added new ones, reset usage stats, no backfill required per user decision.

### Potential Edge Cases & Considerations

- Clock Skew: Using local server times for start/end is acceptable; if multiple servers handle request lifecycle, ensure elapsed measurement occurs on a single instance (current architecture likely single process for chat endpoint call).
- Retries inside `getOpenRouterCompletion`: Our elapsed measurement should wrap the entire function call (including internal retries). Decide if we prefer first-attempt latency vs total user-perceived latency; choose total (wrap full call).
- Streaming (future): For streamed responses, should measure until stream completion; may introduce separate metrics (TTFT vs total generation time).
- Analytics Inflation: Avoid adding ms totals into second-based fields before schema change completed.
- Null / Failed Messages: Do not record latency for failed assistant messages with `error_message` set (or record `NULL`/0 but exclude from usage accumulation).

### Decisions (Resolved)

1. Metric renamed to generation time: `generation_ms` (assistant-only sum).
2. No deprecation window; legacy columns removed immediately.
3. UI precision: one decimal second.
4. Historical data discarded (dev only) instead of backfill.
5. Cost tracking table extended to include `elapsed_ms` for future TPS calculations (app layer to populate next).

## Follow-Up

Populate `elapsed_ms` in `message_token_costs` rows (DB column present) and add analytics using this for throughput metrics.

---

Please review Open Questions and confirm Phase 1 scope before implementation patches.
