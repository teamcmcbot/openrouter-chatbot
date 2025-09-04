# Sentry Troubleshooting

Use this guide to validate Sentry setup and debug missing events or noisy signals.

## Quick sanity checks

- Is `SENTRY_DSN` set in the deployed environment? (Production and Preview as needed)
- Is `NODE_ENV=production`? If not, set `SENTRY_ENABLE_DEV=true` locally to opt in.
- Are tests running? Tests always disable Sentry.
- Is the error path going through `handleError`? Middleware short-circuits (e.g., 429) intentionally bypass Sentry.

## Validating tags

- `route`: Should appear for all captured server errors.
- `requestId`: Every captured error includes the correlation id.
- `model`: Only for chat endpoints (`/api/chat`, `/api/chat/stream`). If missing:
  - Ensure the handler extracts the model early and passes `{ model }` to `handleError`.
  - Confirm the event happened on a chat endpoint and not middleware.

## Debug endpoints

- `/api/debug/error`: Forces a server error for verification without affecting user data.

## Common “why no events?” causes

1. DSN missing or invalid in the environment.
2. Build/deploy succeeded before env vars were added; redeploy after setting.
3. Error handled entirely in middleware or early return path (not using `handleError`).
4. Client-only error (we don’t capture client errors yet by design).
5. Local dev without `SENTRY_ENABLE_DEV=true`.

## Reducing noise

- We currently capture only server-side errors via `handleError`. If you still see too many 4xx errors, consider gating captures to `status >= 500` within `handleError`.

## Security checklist

- Ensure no prompts, responses, auth headers, tokens, or user identifiers are in Sentry payloads.
- Review Sentry Project → Security & Data Privacy → Data Scrubbing (add custom rules if needed).

## Headers for on-call correlation

- `X-Request-ID`: Returned on error responses and visible in logs. Search this in Sentry to correlate.
- `X-Model`: Returned by chat endpoints on both success and error.
