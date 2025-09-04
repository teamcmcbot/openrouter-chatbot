# Sentry Setup (Errors-Only, Server-Only)

This guide explains how to enable Sentry error capture in production while keeping tests and local dev quiet, and without sending sensitive data.

## What gets sent

- Only exceptions explicitly captured from API error paths (`handleError`).
- No performance traces, replays, or breadcrumbs.
- Minimal tags only: `requestId`, `route`.
- Sensitive fields are scrubbed in `beforeSend` (headers like `authorization`, `cookies`, tokens, prompt/response payloads, etc.).

## Enablement rules

- Enabled when BOTH are true:
  - `NODE_ENV=production` (or `SENTRY_ENABLE_DEV=true` for local opt-in)
  - `SENTRY_DSN` is set (project DSN string from Sentry)
- Tests: always disabled.

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
  - Exposes `capture(error, { requestId, route })` to send exceptions
  - Scrubs sensitive data via `beforeSend`
- Central handler: `lib/utils/errors.ts`
  - Calls `capture()` and logs a single error with `{ requestId, route, eventId }`
  - Response still returns `x-request-id` header when available

## Verify in production

1. Deploy with `SENTRY_DSN` configured
2. Trigger a 500 from an API route (e.g., hit an endpoint with invalid input)
3. Confirm a new event in Sentry with tags: `route`, `requestId`
4. Ensure sensitive fields are redacted

## Client-side capture (optional, future)

We currently initialize Sentry server-only to reduce surface area. If client capture is desired later, create a separate client wrapper and enable only with strict PII scrubbing and sampling.
