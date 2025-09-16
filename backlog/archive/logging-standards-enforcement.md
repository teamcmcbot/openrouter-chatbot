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

- ESLint: no-console enforced in app code; tests/scripts and `lib/utils/logger.ts` exempt. (DONE)
- API/server: compliant on chat + admin routes; requestId present and returned via `x-request-id`; INFO summaries added; test mocks hardened.
- UI/hooks/stores: migrated to shared `logger`; ESLint clean.
- Commented debug prints: removed in `hooks/useChatStreaming.ts`.
- Tests: all green; Build: passes.
- Sentry: not configured (optional).

## Checklist (must pass)

- [x] No `console.*` in app code (components/**, hooks/**, stores/**, lib/**, src/app/\*\*); tests/scripts allowed.
- [x] Server/API logging uses `logger` with structured JSON and `requestId`.
- [x] Add/keep `route` in server logs for filtering.
- [ ] Streaming/token debug via `streamDebug()` and flags; single INFO summary per request; sampling on hot paths.
- [x] No commented-out debug lines.
- [x] ESLint enforces no-console in app code with overrides for tests/scripts and `lib/utils/logger.ts`.
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

- [x] Update ESLint rule: disallow all `console.*` for `**/*.{ts,tsx,js,jsx}`.
- [x] Add overrides:
  - `tests/**`, `scripts/**`: no-console off.
  - `lib/utils/logger.ts`: no-console off (logger implementation only).
- [x] Run lint; list violations.

User verification

- [ ] Confirm lint fails on app code `console.*` and ignores tests/scripts.

### Phase 2 – UI/hooks/stores cleanup

- [x] Replace `console.warn/error` with `logger.warn/error` for actual failures.
- [x] Remove `console.log/debug/info` and interaction breadcrumbs.
- [x] Remove commented-out debug prints.

User verification

- [x] Run lint → zero console violations.
- [x] App smoke test: copy/share actions, auth flows, and sidebar operations still work.

### Phase 3 – Server/API consistency

– Status: Applied to chat endpoints previously; extended to admin analytics and admin endpoints (users, model-access, sync-models). Tests green.

- [x] Ensure each handler includes `requestId` and `route` in logs.
- [x] Keep a single INFO summary (sampled when needed) and avoid verbose debug in prod.

User verification

- [x] Hit endpoints locally; inspect logs for `requestId` and `route`.

### Phase 4 – Optional Sentry

- [ ] Add `@sentry/nextjs` minimal config (errors only, no traces, PII scrubbed).
- [ ] Use `Sentry.captureException(err)` + `logger.error(..., { requestId, route, eventId })` in catch blocks.

User verification

- [ ] Trigger test error; see single structured ERROR log and one Sentry event without sensitive data.

### Phase 5 – Docs and CI

- [ ] Update docs if behavior changes.
- [x] Ensure CI runs lint and fails on new `console.*`.

Next steps

- Add minimal Sentry config (errors only, no traces) if approved.
- Consider tiny logger helper for "info-or-debug" emission to avoid inline guards.
- Monitor logs for noise; adjust sampling or tiers if needed.

## Manual testing notes

- Toggle `LOG_LEVEL` to see verbosity changes.
- Confirm `x-request-id` header returned by API routes.
- Ensure no prompts/headers/tokens are printed in logs.

## Tracking

- Link to `.github/copilot-instructions.md` → Logging & Observability Standards.
- This backlog item closes when all checklist boxes are ticked and lint passes with zero app-code `console.*` instances.

---

### Update (2025-09-04)

- Added DRY helper `logger.infoOrDebug` and refactored admin analytics/admin routes to use it.
- Updated test logger mocks to include `info`/`infoOrDebug` to prevent TypeErrors.
- Targeted tests PASS: tests/api/adminAnalytics.test.ts, tests/api/adminAnalytics.segments.test.ts (11/11).
