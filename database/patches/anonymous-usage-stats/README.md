# Anonymous Usage Stats — Phase 1 Patch

This patch creates a separate aggregate table for anonymous usage, adds a per-model daily aggregate for anonymous tokens, an ingestion RPC, an admin cost helper, and a retention helper. No PII; no user_id stored. Admin-only visibility.

## Files

- 001_anonymous_usage_schema.sql — tables, indexes, RLS, trigger, RPC `ingest_anonymous_usage(jsonb)`, admin cost helper `get_anonymous_model_costs(...)`, and `cleanup_anonymous_usage(days)`

## Objects Created

- Table: `public.anonymous_usage_daily`
  - Unique key: `(anonymous_session_id, usage_date)`
  - Columns: messages_sent, messages_received, input_tokens, output_tokens, models_used, generation_ms, timestamps
- Table: `public.anonymous_model_usage_daily`
  - Unique key: `(usage_date, model_id)`
  - Columns: prompt_tokens, completion_tokens, total_tokens (generated), assistant_messages, generation_ms,
    prompt_unit_price, completion_unit_price, estimated_cost (precomputed), timestamps
- Function (RPC): `public.ingest_anonymous_usage(p_payload jsonb)` SECURITY DEFINER
  - Validates minimal payload, caps events (<=50), aggregates into the daily row (upsert)
  - Grants EXECUTE to anon and authenticated
- Function (Admin): `public.get_anonymous_model_costs(p_start_date DATE, p_end_date DATE, p_granularity TEXT DEFAULT 'day')` SECURITY DEFINER
  - Admin-only aggregated token totals by model and period; estimated_cost is summed from stored values (no join at query time)
- Function: `public.cleanup_anonymous_usage(days_to_keep integer DEFAULT 30)` SECURITY DEFINER
  - Deletes rows older than N days; no schedule in this patch
- RLS Policies on `anonymous_usage_daily`
  - Admins can SELECT via `public.is_admin(auth.uid())`
  - Direct writes/updates/deletes are denied; only the RPC inserts/updates
- RLS Policies on `anonymous_model_usage_daily`
  - Admins can SELECT; direct writes/updates/deletes denied (ingestion via RPC only)

## Payload Contract (RPC)

Example payload:

```
{
  "anonymous_session_id": "uuid-or-random-text",
  "events": [
    { "timestamp": "2025-09-02T12:34:56Z", "type": "message_sent", "input_tokens": 120, "model": "gpt-4o-mini" },
    { "timestamp": "2025-09-02T12:35:12Z", "type": "completion_received", "output_tokens": 256, "elapsed_ms": 1100 }
  ]
}
```

- Max 50 events per call; aggregates to the day of the first event (UTC)
- Idempotent per (anonymous_session_id, usage_date) by additive upsert

## How to Run

1. Review SQL:

- `database/patches/anonymous-usage-stats/001_anonymous_usage_schema.sql`

2. Apply in your DB (example with psql):

- psql URL depends on your environment; ensure `extensions: pgcrypto` available for gen_random_uuid().

3. Verify objects:

- SELECT to_jsonb(t) FROM public.anonymous_usage_daily t LIMIT 1; (should exist, empty)
- CALL/SELECT the RPC:
  - SELECT public.ingest_anonymous_usage('{"anonymous_session_id":"local_1","events":[{"timestamp":"2025-09-02T00:00:00Z","type":"message_sent","input_tokens":10}]}'::jsonb);
- Confirm row upserted:
  - SELECT \* FROM public.anonymous_usage_daily WHERE anonymous_session_id='local_1';

4. Retention (optional):

- SELECT public.cleanup_anonymous_usage(30);

## Notes

- Admin-only SELECT aligns with v1 (admin dashboard inclusion). No user-facing changes in this patch.
- A later patch can add a scheduled job to call `cleanup_anonymous_usage(30)` daily if desired.

### Performance & pricing snapshot

- Costs are computed at ingestion time and stored in `anonymous_model_usage_daily.estimated_cost` along with unit price snapshots.
- The admin helper simply aggregates stored values over date ranges; it does not join `model_access` at query time.
- Historical rows retain the unit prices used at the time of ingestion, mirroring the approach in `message_token_costs`.

## Anonymous session ID generation

- When: Generated on the client the first time an anonymous user sends usage (before calling `/api/usage/anonymous`). Not generated on the server.
- How: Use a cryptographically strong random ID (prefer `crypto.randomUUID()`; fallback to `crypto.getRandomValues()`-based 128-bit hex). Example IDs like `anon_4f7c3b5e-...` are fine.
- Persist: Store in `localStorage` under a stable key (e.g., `anon_session_id`) with an optional `created_at` metadata.
- Rotate: Reset on authentication (sign-in) and optionally after 30 days to align with retention. Clearing browser data also resets it.
- Scope: Per-browser/profile and device; not shared across devices; not tied to IP or cookies.
- Validation: Server requires the field and treats it as opaque text. Keep it short (<= 64 chars) using URL-safe characters `[A-Za-z0-9_-]`. Payloads missing this field are rejected by the RPC (`invalid_payload_fields`).

Note: v1 does not attempt to back-link anonymous IDs to user accounts on sign-in; any future linking would be handled by a separate RPC and policy.

## One-to-one mapping with existing schema

| New (Anonymous) object                                    | Purpose                                                                                    | Existing (Authenticated) equivalent                    | Purpose                                                                                 | Key differences                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `public.anonymous_usage_daily`                            | Per-session daily aggregates for anonymous activity (messages/tokens/models/generation_ms) | `public.user_usage_daily`                              | Per-user daily aggregates for authenticated users (includes estimated_cost maintenance) | Anonymous table has no `user_id` or `estimated_cost`; admin-only read; idempotent upserts via RPC                  |
| `public.anonymous_model_usage_daily`                      | Per-model daily token aggregates for anonymous activity                                    | `public.user_model_costs_daily` (VIEW)                 | Per-user per-model daily aggregates derived from `message_token_costs`                  | Anonymous is a persisted table without user dimension; used to compute estimated cost for anonymous usage          |
| `public.ingest_anonymous_usage(jsonb)`                    | Validates payload and upserts anonymous daily/session and per-model aggregates             | `public.track_user_usage(...)` (called by triggers)    | Updates/inserts user daily aggregates after chat activity                               | Anonymous RPC is callable by anon/auth roles and does not touch user tables                                        |
| `public.get_anonymous_model_costs(start,end,granularity)` | Admin-only: returns model/day/week/month totals and estimated_cost for anonymous usage     | `public.get_global_model_costs(start,end,granularity)` | Admin-only: aggregates costs for authenticated usage from `message_token_costs`         | Anonymous function estimates costs from token totals and `model_access` pricing; no per-message costs              |
| `public.cleanup_anonymous_usage(days)`                    | Deletes old anonymous daily rows (retention)                                               | `public.cleanup_old_data(days)`                        | Cleans user usage and other system tables                                               | Anonymous retention is scoped to anonymous tables; no schedule included here                                       |
| — (intentionally omitted in v1)                           | —                                                                                          | `public.message_token_costs`                           | Per-assistant-message pricing snapshot and audit                                        | No anonymous equivalent by design in v1 (privacy/scope). Costs for anonymous are estimated from daily model tokens |
