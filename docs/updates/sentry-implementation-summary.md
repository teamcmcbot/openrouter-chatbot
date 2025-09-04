# Sentry Implementation Summary

This document summarizes the server-only Sentry integration and recent enhancements for actionable error triage.

## Scope

- Server-only errors via centralized `handleError()`.
- No performance tracing or replays.
- Strict data scrubbing.

## Key changes

- Introduced `lib/utils/sentry.ts` wrapper around `@sentry/node` with:
  - Lazy, gated initialization (`SENTRY_DSN` + prod or `SENTRY_ENABLE_DEV=true`).
  - `beforeSend` scrubbing for PII and large payloads.
- Updated `lib/utils/errors.ts` to call `capture()` with tags:
  - `requestId` and `route` across all API routes that use `handleError`.
  - `model` for chat endpoints (`/api/chat`, `/api/chat/stream`).
- Response headers:
  - `X-Request-ID` for all error responses (when available).
  - `X-Model` for chat endpoints on both success and error.

## Operational notes

- Middleware short-circuits (e.g., rate limit 429) intentionally bypass Sentry.
- Tests never emit Sentry events.
- Local dev is opt-in via `SENTRY_ENABLE_DEV=true`.

## Verification

- Build and lint: green.
- Manual smoke: `/api/debug/error` emits event with `route` and `requestId` tags.
- Chat error emits `model` tag (e.g., `openai/gpt-oss-12b:free`).

## Next steps (optional)

- Consider suppressing 4xx captures globally to further reduce noise.
- Add minimal client capture later, guarded by strict scrubbing and sampling.
