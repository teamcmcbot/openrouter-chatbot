# Anonymous Usage Stats — Phase 1 Patch

This patch creates separate aggregate tables for anonymous usage, adds a per-model daily aggregate for anonymous tokens, ingestion RPCs (success + error), admin helpers (costs + errors), and retention helpers. No PII; no user_id stored. Admin-only visibility. Storage uses anon_hash (HMAC of client anonymous_session_id) — raw IDs are never stored.

## Files

- 001_anonymous_usage_schema.sql — tables, indexes, RLS, RPC `ingest_anonymous_usage(jsonb)`, admin cost helper `get_anonymous_model_costs(...)`, retention helper `cleanup_anonymous_usage(days)`, and error tracking objects (`anonymous_error_events`, `ingest_anonymous_error(jsonb)`, `get_anonymous_errors(...)`, `cleanup_anonymous_errors(days)`).

## Objects Created

- Table: `public.anonymous_usage_daily`
  - Unique key: `(anon_hash, usage_date)`
  - Columns: messages_sent, messages_received, input_tokens, output_tokens, generation_ms, timestamps
- Table: `public.anonymous_model_usage_daily`
  - Unique key: `(usage_date, model_id)`
  - Columns: prompt_tokens, completion_tokens, total_tokens (generated), assistant_messages, generation_ms,
    prompt_unit_price, completion_unit_price, estimated_cost (precomputed), timestamps
- Table: `public.anonymous_error_events`
  - Primary key: id uuid default gen_random_uuid()
  - Columns: anon_hash TEXT, event_timestamp timestamptz, model VARCHAR(100), http_status INT NULL, error_code TEXT NULL, error_message TEXT NULL (sanitized+truncated), provider TEXT NULL, provider_request_id TEXT NULL, completion_id TEXT NULL, metadata JSONB NULL, created_at timestamptz
- Function (RPC): `public.ingest_anonymous_usage(p_payload jsonb)` SECURITY DEFINER
  - Validates minimal payload, caps events (<=50), aggregates into the daily row (upsert)
  - Grants EXECUTE to anon and authenticated
- Function (RPC): `public.ingest_anonymous_error(p_payload jsonb)` SECURITY DEFINER
  - Validates minimal error payload, sanitizes and truncates `error_message` (e.g., LEFT(..., 300)), strips secrets and caps `metadata` (e.g., 2 KB)
  - Inserts into `anonymous_error_events`; Grants EXECUTE to anon and authenticated
- Function (Admin): `public.get_anonymous_model_costs(p_start_date DATE, p_end_date DATE, p_granularity TEXT DEFAULT 'day')` SECURITY DEFINER
  - Admin-only aggregated token totals by model and period; estimated_cost is summed from stored values (no join at query time)
- Function (Admin): `public.get_anonymous_errors(p_start_date DATE, p_end_date DATE, p_limit INT DEFAULT 100, p_model TEXT DEFAULT NULL)` SECURITY DEFINER
  - Admin-only: returns recent error events (sanitized), optionally filtered by model, ordered by time desc
- Function: `public.cleanup_anonymous_usage(days_to_keep integer DEFAULT 30)` SECURITY DEFINER
  - Deletes rows older than N days; no schedule in this patch
- Function: `public.cleanup_anonymous_errors(days_to_keep integer DEFAULT 30)` SECURITY DEFINER
  - Deletes error events older than N days
- RLS Policies on `anonymous_usage_daily`
  - Admins can SELECT via `public.is_admin(auth.uid())`
  - Direct writes/updates/deletes are denied; only the RPC inserts/updates
- RLS Policies on `anonymous_model_usage_daily`
  - Admins can SELECT; direct writes/updates/deletes denied (ingestion via RPC only)
- RLS Policies on `anonymous_error_events`
  - Admins can SELECT; INSERT restricted to SECURITY DEFINER RPC only

## Payload Contract (RPC)

Example payload (success):

```
{
  "anon_hash": "hmac-sha256-base64-or-hex",
  "events": [
    { "timestamp": "2025-09-02T12:34:56Z", "type": "message_sent", "input_tokens": 120, "model": "gpt-4o-mini" },
    { "timestamp": "2025-09-02T12:35:12Z", "type": "completion_received", "output_tokens": 256, "elapsed_ms": 1100 }
  ]
}
```

- Max 50 events per call; aggregates to the day of the first event (UTC)
- Idempotent per (anon_hash, usage_date) by additive upsert

Example payload (error):

```
{
  "anon_hash": "hmac-sha256-base64-or-hex",
  "model": "gpt-4o-mini",
  "timestamp": "2025-09-02T12:35:12Z",
  "http_status": 500,
  "error_code": "PROVIDER_TIMEOUT",
  "error_message": "Timeout waiting for upstream (truncated…)",
  "provider": "openrouter",
  "provider_request_id": "req_123",
  "completion_id": null,
  "metadata": { "upstream": { "timeout_ms": 30000 } }
}
```

## How to Run

1. Review SQL:

- `database/patches/anonymous-usage-stats/001_anonymous_usage_schema.sql`

2. Apply in your DB (example with psql):

- psql URL depends on your environment; ensure `extensions: pgcrypto` available for gen_random_uuid().

3. Verify objects:

- SELECT to_jsonb(t) FROM public.anonymous_usage_daily t LIMIT 1; (should exist, empty)
- CALL/SELECT the RPC:
  - SELECT public.ingest_anonymous_usage('{"anon_hash":"hmac_local_1","events":[{"timestamp":"2025-09-02T00:00:00Z","type":"message_sent","input_tokens":10}]}'::jsonb);
- Confirm row upserted:
  - SELECT \* FROM public.anonymous_usage_daily WHERE anon_hash='hmac_local_1';

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
- Validation (API): The public API accepts `anonymous_session_id`, derives `anon_hash` server-side, and calls the RPC. The RPC expects `anon_hash` only and never receives raw IDs.

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
