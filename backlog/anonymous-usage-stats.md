# Anonymous usage statistics

## Summary

Track usage for non-authenticated sessions without a user ID, safely and without PII, and optionally sync if user later authenticates.

## Current implementation snapshot

- Anonymous users are supported via `withEnhancedAuth`; not synced to DB currently.
- Sync flows exist for conversations when a user later signs in, but anonymous stats are missing.

## Approach (contract)

- Inputs: anonymous session id (uuid stored in localStorage), event types (message_sent, completion_received), token counts, model id, timestamps.
- Outputs: server-side aggregated records keyed by `anonymous_session_id`.
- Errors: rate limit abuse; ensure minimal data and no PII.

## Phases

- [ ] Phase 1 — Schema & API
  - [ ] Add table for anonymous usage aggregates (by day, session).
  - [ ] Endpoint to accept batched anonymous metrics with `withRateLimit` only (public).
  - [ ] User verification: records appear without user id.
- [ ] Phase 2 — Client emitters
  - [ ] Add lightweight client to emit metrics for anonymous sessions.
  - [ ] User verification: metrics sent only when not authenticated.
- [ ] Phase 3 — Link on auth (optional)
  - [ ] On signup/login, optionally link last N hours of anonymous metrics to the new user, or keep separate per policy.
  - [ ] User verification: linkage works as designed.
- [ ] Phase 4 — Docs
  - [ ] `/docs/analytics/anonymous-usage.md` + privacy statement.

## Clarifying questions

1. Do we want to ever link anonymous stats to a later account? If so, what window?
2. What exact metrics to collect for anonymous? Minimal set?
3. Retention period and deletion policy?

## Risks

- Privacy; ensure no content or PII is logged.
- Abuse; enforce rate limits and size caps.

## Success criteria

- Aggregated anonymous usage visible in admin dashboards without identifying users.
