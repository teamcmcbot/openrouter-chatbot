## Production logs cleanup and strategy (Vercel)

This document identifies redundant logs to remove, clarifies how logs work on Vercel in production, and proposes a minimal, safe strategy for structured logging going forward.

### TL;DR actions

- Remove UI/React render-time and happy-path console logs in components and stores.
- Convert server/API debug prints to the existing `logger` with proper levels; keep WARN/ERROR, sample INFO.
- Gate streaming/tokens verbosity behind a debug flag and drop by default in prod.
- Add ESLint rule to block stray `console.*` in app code (allow in tests/scripts).
- Keep errors structured and include a `requestId` where possible.

---

## How prod logging works on Vercel

- Source of truth: anything written to stdout/stderr by serverless or edge runtimes shows up in Vercel Logs.
  - Node.js Serverless/ISR logs → Function Logs
  - Edge Runtime (middleware/edge routes) logs → Edge Logs
- Where to view:
  - Vercel Dashboard → Project → Deployments → Logs
  - CLI: `vercel logs <deployment-url>`
- Retention: per Vercel plan; logs are ephemeral. Use a drain for long-term storage/analysis.
- Log drains (recommended): forward JSON logs to providers (Datadog, Better Stack/Logtail, New Relic, Sumo, Axiom, Grafana Loki, Elastic, etc.).
- Error tracking: integrate Sentry (or similar) for stack traces, sampling, and PII scrubbing; continue to emit a single structured ERROR line per failure.

Implications:

- Prefer structured, single-line JSON for prod (easy to parse, cheap to store).
- Avoid logging sensitive content (PII, message text, headers, tokens). Redact and cap sizes.
- Use levels and sampling to control volume.

---

## Current logging footprint (snapshot)

High-noise areas detected in repository scans:

- API routes

  - `src/app/api/chat/route.ts`: multiple `console.log` lines printing request shape, counts, model, and config on happy path (lines ~179–223). Safe to remove or convert to `logger.debug` with sampling.
  - `src/app/api/chat/messages/route.ts`: `console.error` on update failure (keep; migrate to `logger.error` with context).
  - `src/app/api/chat/stream/route.ts`: many commented-out `console.log` debug lines; keep disabled or replace with `streamDebug()` helper only when flag is on.

- Token utilities

  - `lib/utils/tokens.ts` and `lib/utils/tokens.server.ts`: numerous `console.log` calls for estimation and strategy calculations. These flood logs in prod; convert to `logger.debug` or remove, keep 1–2 INFO summaries when materially helpful.

- Env and error utils

  - `lib/utils/env.ts`: `console.info` for optional vars and cache TTL. Keep a single INFO per cold start. Consider converting to `logger.info`.
  - `lib/utils/errors.ts`: `console.error('[API_ERROR]', error)`; convert to `logger.error` with `{ requestId, route }` context.

- Rate limiting

  - `lib/utils/redis-rate-limiter.ts`, `lib/utils/database-rate-limiter.ts`: `console.error` on operational errors (keep; convert to `logger.error` with minimal context). Avoid logging full keys or user identifiers.

- Stores and UI

  - `stores/storeUtils.ts`, `stores/useAuthStore.ts`, `components/auth/*`, `components/ui/*`, `components/auth/AuthButton.tsx`, `components/auth/SignInModal.tsx`: many `console.log` for UI actions, renders, and state changes. Remove in app code; these provide little prod value and can leak UI internals.
  - `components/ui/TierBadge.tsx`, `components/auth/SimpleAuthButton.tsx`: WARN/ERROR on failures are fine; keep as `logger.warn/error` instead of raw console.

- Streaming debug

  - `lib/utils/streamDebug.ts` already gates on a flag; prefer that over ad-hoc prints. Default off in prod.

- Tests and scripts
  - `tests/**` and `scripts/**` contain many `console.log` by design. Keep unchanged; they do not affect production deployments.

---

## Delete vs keep vs convert

Delete outright (low-value/noisy):

- All UI render-time logs and interaction breadcrumbs in `components/**` (e.g., “render…”, “button clicked”).
- Routine happy-path logs in stores (`stores/**`) like “Starting sign-in…”, “Sign out completed”, “Store action…”.
- Commented-out `console.log` lines in API code.

Convert to `logger.debug` (behind level/flag):

- Token strategy details in `lib/utils/tokens*.ts` (estimates, budget decisions).
- Verbose request-shape prints in `src/app/api/chat/route.ts` (message counts, flags). Optionally sample 1–5%.
- Sync lifecycle traces in `lib/utils/syncManager.ts` (start, complete) → either DEBUG or a single INFO with duration.

Keep as WARN/ERROR (structured):

- Operational errors: Redis/DB rate limiter errors, failed updates in `chat/messages`, component action failures that impact UX (copy/share failures).
- Environment validation warnings (missing optional vars) on cold start → INFO once.

---

## Minimal logging strategy (reuse existing logger)

We already have `lib/utils/logger.ts`. Suggested adjustments and usage:

1. Levels and gating

   - Default in prod: log WARN and ERROR. Allow INFO/DEBUG via `LOG_LEVEL=info|debug` for transient debugging.
   - Ensure `logger` emits JSON to stdout for all levels ≥ current threshold.

2. Structure

   - Fields: `ts`, `level`, `msg`, `requestId`, `route`, and a small `ctx` object (redacted and size-capped).
   - Redact message content and user identifiers; prefer hashed or boolean flags.

3. Request correlation

   - In route handlers, generate a `requestId` (UUID) once per request and pass to logger calls.
   - Consider adding it to response headers for cross-correlation during incident review.

4. Streaming and tokens

   - Use `streamDebug()` helper for streaming step-by-step traces, enabled only via `NEXT_PUBLIC_DEBUG_STREAMING` or localStorage flag.
   - Collapse token logs to a single INFO summary per request (model, durationMs, inputTokens, outputTokens) with redacted content.

5. Sampling (optional)
   - For INFO summaries on very hot paths, sample at 1–5% in prod to control cost.

---

## Vercel production options

- Built-in Logs: Use Vercel dashboard or CLI to inspect stdout/stderr from functions and edge.
- Log Drains (recommended): Configure a drain to your log backend to retain and query logs long-term.
- Error Tracking: Sentry integration for stack traces, releases, and alerting.
- Observability Partners: Datadog, New Relic, Better Stack/Logtail, Axiom, etc., to search/graph JSON logs.

Minimal setup suggestion:

1. Keep logs JSON-structured from the `logger`.
2. Set a Vercel Log Drain to Better Stack (fast setup) or Datadog (if already used).
3. Add Sentry for error monitoring; keep ERROR logs in both logger and Sentry with deduplication.

---

## Free-friendly minimal stack: setup

This config works on Vercel Hobby without paid Log Drains and keeps costs low.

1. Logger (app-wide)

- Behavior: WARN/ERROR in prod by default; enable INFO/DEBUG via `LOG_LEVEL`.
- Ensure `lib/utils/logger.ts` respects an env var:
  - `LOG_LEVEL=error|warn|info|debug` (default: `warn` in prod, `debug` in dev)
  - Emit single-line JSON in prod for levels ≥ current threshold.
- Include small, redacted context and a `requestId` when available.

2. Sentry (errors only)

- Create a free Sentry project and get `SENTRY_DSN`.
- Add SDK for Next.js and initialize (server and client configs). Set:
  - `SENTRY_DSN` (Vercel Project → Settings → Environment Variables)
  - `SENTRY_ENVIRONMENT` (e.g., `production`, `preview`, `development`)
  - Sampling: disable traces or keep very low (e.g., `tracesSampleRate=0`).
- In API handlers, rely on automatic error capture or call `captureException(e)`; still emit one structured ERROR via `logger.error`.

3. Built-in Vercel logs

- No setup required. View Deployment → Logs or use CLI.
- Treat as ad-hoc debugging and for correlating `requestId` from your logger/Sentry.

4. Optional HTTP “drain” without paid Log Drains

- Many providers (Axiom, Better Stack/Logtail, Grafana Cloud) offer free HTTPS ingestion.
- Add two env vars (disabled by default):
  - `LOG_HTTP_DRAIN_URL` (provider endpoint)
  - `LOG_HTTP_DRAIN_TOKEN` (if required)
- In `logger`, POST sampled JSON logs on server only, never from the browser. Keep rate tiny (e.g., ≤1% INFO; always send ERROR).

Environment variables summary

- `LOG_LEVEL` → error|warn|info|debug
- `NEXT_PUBLIC_DEBUG_STREAMING` → 0/1 to enable client streaming debug
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT` → Sentry config (optional)
- `LOG_HTTP_DRAIN_URL`, `LOG_HTTP_DRAIN_TOKEN` → optional HTTPS drain (server-only)

---

## Local development and testing logs

Development (local)

- Default to verbose: `LOG_LEVEL=debug` (or no env if logger already defaults to debug in dev).
- Streaming debug: set `localStorage.DEBUG_STREAMING = '1'` or `NEXT_PUBLIC_DEBUG_STREAMING=1` to enable `streamDebug()` noise when you need it.
- Avoid dumping large payloads; prefer summaries to keep the console readable.

Unit/integration tests

- Keep test and scripts logging as-is (verbose is fine); restrict only app code.
- For quieter CI, set `NODE_ENV=test` and `LOG_LEVEL=error` to minimize noise.
- Optionally mock the `logger` in specific test files to silence output.

Verification checklist

- Run the app locally and confirm:
  - Changing `LOG_LEVEL` alters output volume.
  - `NEXT_PUBLIC_DEBUG_STREAMING=1` surfaces streaming debug lines only when enabled.
  - Errors appear once as structured JSON and (if configured) in Sentry.

---

## Concrete cleanup checklist (by area)

API routes

- [x] `src/app/api/chat/route.ts`: remove lines printing request format, counts, model/token strategy on happy path; replace with a single `logger.info('chat.request.end', { requestId, model, durationMs, tokens })` (sampled) and keep errors as `logger.error`.
- [x] `src/app/api/chat/stream/route.ts`: delete commented `console.log` lines; use `streamDebug()` only.
- [x] `src/app/api/chat/messages/route.ts`: replace `console.error` with `logger.error('chat.stats.update_failed', err, { requestId, conversationId })`.

Utilities

- [x] `lib/utils/tokens.ts` and `.server.ts`: change all `console.log` to `logger.debug`; keep at most one INFO summary per invocation; remove purely narrative prints.
- [x] `lib/utils/env.ts`: convert `console.info` to `logger.info` and ensure it runs once per cold start.
- [x] `lib/utils/errors.ts`: switch to `logger.error` with structured context.
- [x] `lib/utils/redis-rate-limiter.ts` and `lib/utils/database-rate-limiter.ts`: keep errors via `logger.error` and add a minimal context (`keyPrefix`, `tier`, `requestId`).

Stores/UI

- [x] Remove UI interaction and render logs in `components/auth/*`, `components/ui/*`, `components/chat/*`, `stores/**` (except WARN/ERROR on user-visible failures).
- [x] Replace any remaining non-critical `console.warn/error` with `logger.warn/error` for consistency.

Tooling

- [x] ESLint: enforce `no-console` for app code with overrides to allow in `tests/**` and `scripts/**`.
- [x] CI: fail on new `console.*` in app code.

---

## ESLint rule (proposed)

Disallow `console.*` in app code; allow in tests/scripts.

```json
{
  "rules": {
    "no-console": ["error", { "allow": [] }]
  },
  "overrides": [
    { "files": ["tests/**", "scripts/**"], "rules": { "no-console": "off" } }
  ]
}
```

---

## Rollout plan

1. Introduce ESLint rule and fix violations in the areas listed above.
2. Migrate server/API logs to `logger` with levels and add a `requestId` per request.
3. Switch token/stream logs to DEBUG with `streamDebug()` gating; keep only a single INFO summary per request (optionally sampled).
4. Configure a Vercel Log Drain to your chosen backend; keep logs JSON-structured.
5. Add Sentry (or chosen APM) for errors with PII scrubbing and release tags.

---

## Useful grep for auditing

- Find console usage across app code:
  - Regex: `console\.(log|debug|info|warn|error|trace|time(?:End)?|count|table)\(`
  - Include: `src/**, components/**, lib/**, hooks/**, stores/**, src/app/**`

---

## Notes

- Tests and scripts are intentionally verbose; leave them as-is.
- Be mindful of the cost and privacy implications of logging LLM prompts/responses; prefer metrics over content.
- Keep prod logs terse, structured, and actionable.

---

## Sentry integration guide (Next.js + Vercel)

Goal: capture exceptions with stack traces in production, keep volume/cost low, and avoid leaking sensitive data. Use Sentry alongside our structured logger; emit one JSON ERROR log and one Sentry event per failure (no verbose info logs).

What you get on the free tier

- Error events with stack traces and environment tags. Limited monthly quota.
- Optional performance traces exist but we recommend disabling to keep it free.

Setup steps

1. Install SDK (local dev)

   - Add dependency: `@sentry/nextjs`
   - Optionally use Sentry Wizard to scaffold configs. Manual steps below are minimal and privacy-safe.

2. Environment variables (Vercel → Project → Settings → Environment Variables)

   - `SENTRY_DSN` → from Sentry project settings
   - `SENTRY_ENVIRONMENT` → `production` (and optionally `preview`, `development`)
   - Optional for source maps upload (only if you choose to enable uploads): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

3. Minimal config files

- `sentry.server.config.ts` (errors only, no traces)

  ```ts
  import * as Sentry from "@sentry/nextjs";

  Sentry.init({
    dsn: process.env.SENTRY_DSN || "",
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    // Disable performance to control costs on free tier
    tracesSampleRate: 0,
    // Don’t send PII by default
    sendDefaultPii: false,
    // Scrub sensitive payloads
    beforeSend(event) {
      // Remove request bodies/headers and any custom data that might contain content
      if (event.request) {
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
        }
      }
      if (event.extra) {
        // Redact known fields
        delete (event.extra as Record<string, unknown>).messages;
        delete (event.extra as Record<string, unknown>).prompt;
        delete (event.extra as Record<string, unknown>).response;
      }
      return event;
    },
  });
  ```

- `sentry.client.config.ts` (optional; client error capture, keep lean)

  ```ts
  import * as Sentry from "@sentry/nextjs";

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "",
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Never send console logs or user content from the browser automatically
      if (event.request) {
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
  });
  ```

4. Hook Sentry into Next.js

- The `@sentry/nextjs` SDK auto-wraps API routes and (App Router) handlers. Ensure the two config files above are placed at repo root (or as documented by Sentry) so they load early.
- For Edge runtime routes, Sentry is supported by the SDK; keep usage limited to errors.

5. Use with our logger

- In catch blocks:
  ```ts
  import * as Sentry from '@sentry/nextjs';
  // ...
  } catch (err) {
    const eventId = Sentry.captureException(err);
    logger.error('chat.request.fail', err, { requestId, route: '/api/chat', eventId });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  ```
- Result: one Sentry event and one structured ERROR log line with `eventId` for cross-reference.

6. Optional: source maps upload (advanced)

- Benefits: de-minified stack traces in Sentry. Costs: minor build-time complexity.
- Enable only if needed. Use `withSentryConfig` in `next.config.ts` or Sentry’s Vercel integration.
- Required envs: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

7. Noise control

- Ignore known benign errors (example):
  ```ts
  Sentry.init({
    // ...existing config...
    ignoreErrors: [
      "AbortError", // request aborted by client
      "ResizeObserver loop limit exceeded",
    ],
    sampleRate: 1.0, // for error events; consider lowering if you hit free-tier limits
  });
  ```
- Keep `tracesSampleRate: 0` unless you need perf data; it consumes quota quickly.

Privacy and PII

- Do not attach chat prompts/responses, headers, tokens, or raw user identifiers.
- Prefer request IDs and hashed IDs for correlation.
- Scrub fields via `beforeSend` and keep payloads small.

Verification

- Trigger a test error in a preview deployment; confirm it appears in Sentry with the expected environment and no sensitive data.
- Confirm a single ERROR log with `eventId` appears in Vercel logs for the same request.
