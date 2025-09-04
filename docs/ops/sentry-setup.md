# Sentry Setup (Errors-Only, Server-Only)

This guide explains how to enable Sentry error capture in production while keeping tests and local dev quiet, and without sending sensitive data. It also covers model tagging for chat endpoints and how to verify in production.

## What gets sent

- Only exceptions explicitly captured from API error paths (`handleError`). Middleware short-circuits (e.g., 429 rate limits) intentionally bypass Sentry.
- No performance traces, replays, or breadcrumbs.
- Tags emitted:
  - `requestId` — request correlation id
  - `route` — API route where the error occurred
  - `model` — for chat endpoints only (`/api/chat`, `/api/chat/stream`)
- Sensitive fields are scrubbed in `beforeSend` (headers like `authorization`, `cookies`, tokens, prompt/response payloads, etc.).

## Enablement rules

- Enabled when BOTH are true:
  - `NODE_ENV=production` (or `SENTRY_ENABLE_DEV=true` for local opt-in)
  - `SENTRY_DSN` is set (project DSN string from Sentry)
- Tests: always disabled.

Notes:

- Client 4xx errors are generally noisy; by default we only capture on server-side error paths where `handleError` is invoked. You may optionally suppress 4xx capture globally in future if desired.

## Environment variables

Set these in your deployment provider (do not commit to git):

- `SENTRY_DSN` — required in production
- `SENTRY_ENV` — optional (defaults to `NODE_ENV`)
- `SENTRY_ENABLE_DEV` — optional; set to `true` to allow local/dev testing

On Vercel: Project → Settings → Environment Variables → add keys for Production (and Preview if desired). For other hosts, use the equivalent secrets/vars facility. Avoid committing `.env.production` containing DSN.

## Sentry project setup (on sentry.io)

1. Create a new Project (Platform: Next.js or Node/JavaScript)
2. Copy the DSN (Client Keys) and put it into `SENTRY_DSN` in your production environment
3. In Project Settings:
   - Environments: ensure `production` exists
   - Data Scrubbing: keep defaults and add rules for headers, tokens, and any app-specific keys if needed
   - Performance/Traces: keep disabled (we use `tracesSampleRate: 0`)

## How it works in code

- Wrapper: `lib/utils/sentry.ts`
  - Initializes Sentry only when enabled
  - Exposes `capture(error, { requestId, route, model })` to send exceptions
  - Scrubs sensitive data via `beforeSend`
- Central handler: `lib/utils/errors.ts`
  - Calls `capture()` and logs a single error with `{ requestId, route, model, eventId }`
  - Response returns headers when available:
    - `X-Request-ID`: for correlation in logs and Sentry
    - `X-Model`: for chat endpoints only (returned on both success and error)

## Verify in production

1. Deploy with `SENTRY_DSN` configured
2. Trigger a 500 from an API route (use the built-in debug route `/api/debug/error`)
3. Confirm a new event in Sentry with tags: `route`, `requestId`
4. Ensure sensitive fields are redacted
5. To validate model tagging specifically, trigger an error in `/api/chat` or `/api/chat/stream` (e.g., use an unavailable model or force an upstream error). The event should include a `model` tag (e.g., `openai/gpt-oss-12b:free`).

## Client-side capture (optional, future)

We currently initialize Sentry server-only to reduce surface area. If client capture is desired later, create a separate client wrapper and enable only with strict PII scrubbing and sampling.

## Production deployment checklist

1. In your hosting provider (e.g., Vercel), add environment variables:

- `SENTRY_DSN` (required)
- `SENTRY_ENV` (optional; defaults to `NODE_ENV`)
- `SENTRY_ENABLE_DEV` (optional; set `true` for local/dev opt-in)

2. Redeploy the application.
3. Verify:

- `/api/debug/error` produces an event with `route` and `requestId` tags.
- Errors from `/api/chat` or `/api/chat/stream` include `model` tag and responses contain `X-Model` header.

4. Confirm no PII appears in Sentry events; adjust scrubbing rules if needed.
