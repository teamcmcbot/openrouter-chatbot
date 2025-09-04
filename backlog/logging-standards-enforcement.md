# Logging Standards Enforcement

This backlog item tracks adopting and enforcing the production logging strategy across the codebase.

## Overview

Goal: make logs quiet, safe, and actionable in production while keeping local dev convenient.

Key standards (summary):

- Use shared `logger` only in app code; no `console.*` in components, hooks, stores, lib, or API.
- Default levels: prod → warn/error; dev → debug. Respect `LOG_LEVEL`.
- Structured JSON logs with `ts`, `level`, `msg`, `requestId`, `route`, and small redacted `ctx`.
- One `logger.error` per failure; include `requestId`; no duplicates.
- Streaming/token verbosity is gated (use `streamDebug()`); collapse to single INFO summary per request; sample hot paths.
- Never log prompts, headers, tokens, or PII. Prefer counts/durations/flags.
- ESLint blocks `console.*` in app code; allow only in tests/scripts and logger implementation.

## Current status (quick audit)

- ESLint: allows `console.warn/error` globally in app code → should be disallowed with overrides.
- API/server: largely compliant; requestId present and returned via `x-request-id`.
- UI/hooks/stores: many `console.*` usages remain (see below).
- Commented debug prints: present in `hooks/useChatStreaming.ts`.
- Sentry: not configured (optional).

## Checklist (must pass)

- [ ] No `console.*` in app code (components/**, hooks/**, stores/**, lib/**, src/app/\*\*); tests/scripts allowed.
- [ ] Server/API logging uses `logger` with structured JSON and `requestId`.
- [ ] Add/keep `route` in server logs for filtering.
- [ ] Streaming/token debug via `streamDebug()` and flags; single INFO summary per request; sampling on hot paths.
- [ ] No commented-out debug lines.
- [ ] ESLint enforces no-console in app code with overrides for tests/scripts and `lib/utils/logger.ts`.
- [ ] Optional: Sentry wired for errors only (no PII, traces disabled).

## Required changes (files and actions)

- ESLint config: `eslint.config.mjs`

  - Change global rule to disallow all console usage in app code; allow in tests/scripts and `lib/utils/logger.ts` only.

- UI/components

  - `components/chat/markdown/MarkdownComponents.tsx`: replace `console.error` with `logger.error`.
  - `components/chat/MessageList.tsx`: replace `console.error/warn` with `logger.error/warn`.
  - `components/ui/ErrorBoundary.tsx`: replace `console.error` with `logger.error`.
  - `components/ui/ModelDetailsSidebar.tsx`: replace `console.error` with `logger.error`.
  - `components/ui/TierBadge.tsx`: replace `console.warn` with `logger.warn`.
  - `components/ui/ChatSidebar.tsx`: replace `console.error` with `logger.error`.

- Auth components

  - `components/auth/SimpleAuthButton.tsx`: replace `console.warn/error` with `logger.warn/error`.
  - `components/auth/SignInModal.tsx`: replace `console.error` with `logger.error`.
  - `components/auth/UserMenu.tsx`: replace `console.error` with `logger.error`.

- Hooks

  - `hooks/useAuthSuccessToast.ts`: replace `console.error` with `logger.error`.
  - `hooks/useLocalStorage.ts`: replace `console.warn` with `logger.warn`.
  - `hooks/useChatStreaming.ts`: remove commented debug `console.log` lines; keep `streamDebug()` usage only.

- Stores

  - `stores/storeUtils.ts`: remove `console.log/debug/info`; keep `logger.warn/error` only for real failures; or gate with env.
  - `stores/useAuthStore.ts`: remove routine logs (start/complete); replace real errors with `logger.error`; keep user-facing warnings as `logger.warn`.
  - `stores/useSettingsStore.ts`: replace `console.warn` with `logger.warn`.

- Lib

  - `lib/utils/openrouter.ts`: replace `console.warn` with `logger.warn`.
  - Server utilities already use `logger`; add `route` consistently in API logs.

- Optional
  - Add minimal Sentry (`@sentry/nextjs`) with errors-only config and PII scrubbing.

## Implementation plan (phased)

### Phase 1 – Tooling enforcement

- [ ] Update ESLint rule: disallow all `console.*` for `**/*.{ts,tsx,js,jsx}`.
- [ ] Add overrides:
  - `tests/**`, `scripts/**`: no-console off.
  - `lib/utils/logger.ts`: no-console off (logger implementation only).
- [ ] Run lint; list violations.

User verification

- [ ] Confirm lint fails on app code `console.*` and ignores tests/scripts.

### Phase 2 – UI/hooks/stores cleanup

- [ ] Replace `console.warn/error` with `logger.warn/error` for actual failures.
- [ ] Remove `console.log/debug/info` and interaction breadcrumbs.
- [ ] Remove commented-out debug prints.

User verification

- [ ] Run lint → zero console violations.
- [ ] App smoke test: copy/share actions, auth flows, and sidebar operations still work.

### Phase 3 – Server/API consistency

- [ ] Ensure each handler includes `requestId` and `route` in logs.
- [ ] Keep a single INFO summary (sampled when needed) and avoid verbose debug in prod.

User verification

- [ ] Hit endpoints locally; inspect logs for `requestId` and `route`.

### Phase 4 – Optional Sentry

- [ ] Add `@sentry/nextjs` minimal config (errors only, no traces, PII scrubbed).
- [ ] Use `Sentry.captureException(err)` + `logger.error(..., { requestId, route, eventId })` in catch blocks.

User verification

- [ ] Trigger test error; see single structured ERROR log and one Sentry event without sensitive data.

### Phase 5 – Docs and CI

- [ ] Update docs if behavior changes.
- [ ] Ensure CI runs lint and fails on new `console.*`.

## Manual testing notes

- Toggle `LOG_LEVEL` to see verbosity changes.
- Confirm `x-request-id` header returned by API routes.
- Ensure no prompts/headers/tokens are printed in logs.

## Tracking

- Link to `.github/copilot-instructions.md` → Logging & Observability Standards.
- This backlog item closes when all checklist boxes are ticked and lint passes with zero app-code `console.*` instances.
