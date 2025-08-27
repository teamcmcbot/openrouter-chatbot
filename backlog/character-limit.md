# Character limit for message input (UI + backend guard)

Goal: Add a soft UI cap and a server-side guard to prevent sending user messages longer than 20,000 characters.

- Soft cap in UI: live character counter; disable Send and Enter-to-send when over limit; keep textarea editable.
- Server guard: reject requests where the triggering user message exceeds 20,000 characters with a clear 413 error. Token-based validation remains in place.

---

## Open questions (please confirm)

1. Scope of 20k cap: apply to all tiers (anonymous/free/pro/enterprise) uniformly? [Assumed: Yes]
2. Counter thresholds: No warning threshold required. Only show normal and over-limit states.
3. Error copy (server): "Message exceeds 20,000 character limit. Reduce by N characters and try again." Use HTTP 413? [Assumed: Yes, matches ErrorCode.PAYLOAD_TOO_LARGE]
4. Count basis: Enforce against the current user message only (not entire conversation/context)? [Assumed: Yes]
5. i18n: Any localization required for the counter and error strings? [Assumed: Not required now]
6. UI counter copy: Hide denominator; show "X characters" only (no limit displayed). [Confirmed: Yes]

> If any assumption is off, we’ll adjust before implementation.

---

## Constants and UX

- Config: `MAX_MESSAGE_CHARS` is environment-driven with default 20,000
  - UI: `NEXT_PUBLIC_MAX_MESSAGE_CHARS` (exposed at build-time)
  - API: `MAX_MESSAGE_CHARS` (server-side)
  - Default: 20000 when envs are absent or invalid
- UI states:
  - Normal: counter shows `X characters` (no denominator)
  - Over-limit: counter turns red, inline hint "Reduce by N to send"; Send button disabled; Enter-to-send suppressed
- Accessibility:
  - `aria-live="polite"` announcements when crossing above/below limit
  - Counter remains non-interactive and does not overlay editable text

---

## Phases and tasks

### Phase 1 — Align requirements and finalize constants

- [ ] Confirm open questions above (scope, thresholds, copy, count basis, i18n)
- [ ] Decide where to place the shared resolver (proposal: `lib/config/limits.ts` exporting `resolveMaxMessageChars` and `MAX_MESSAGE_CHARS`)
- [ ] Add `.env.example` entries for `NEXT_PUBLIC_MAX_MESSAGE_CHARS` and `MAX_MESSAGE_CHARS` (default 20000)
- [ ] Document rationale in this backlog entry (ties to tier token ceilings; UX prevents avoidable 413/token rejections)
- [ ] User verification: Confirm final constants/copy and proceed

User test steps:

- N/A (planning/sign-off only)

---

### Phase 2 — UI soft cap (MessageInput)

Files to change:

- `components/chat/MessageInput.tsx`
- (Optional) `docs/components/chat/MessageInput.md`

Tasks:

- [ ] Import `MAX_MESSAGE_CHARS` from `lib/config/limits`
- [ ] Compute `charCount = message.length` and derived state: `isOver = charCount > 20000`, `overBy = Math.max(0, charCount - 20000)`
- [ ] Update existing floating counter to show `X characters` (no denominator) with color states (normal/red)
- [ ] When `isOver`, disable Send button and block Enter-to-send path; keep Shift+Enter newline; still allow editing
- [ ] Add inline hint when `isOver`: "Reduce by {overBy} to send"
- [ ] Add `aria-live="polite"` announcement when crossing thresholds (enter/leave over-limit)
- [ ] Add `data-testid` hooks for counter state and send-disabled for tests
- [ ] Minimal refactor to keep changes local (no layout shift, no maxLength attr)
- [ ] Update `docs/components/chat/MessageInput.md` to describe the limit and UX

User verification:

- [ ] Type up to 20,000 chars → Send enabled; counter shows "X characters" in grey
- [ ] Type to 20,001+ → Send disabled; counter red; inline hint shows required reduction; Enter-to-send blocked
- [ ] Delete back to 20,000 or fewer → Send re-enables; hint disappears; announce change once
- [ ] Paste large text (e.g., 25k) → same behavior as above; still editable
- [ ] Mobile and desktop; IME composition unaffected; attachments banner unaffected

---

### Phase 3 — Backend guard (API)

Files to change:

- `lib/config/limits.ts` (add `export const MAX_MESSAGE_CHARS` and `resolveMaxMessageChars()`)
- `src/app/api/chat/route.ts`
- `src/app/api/chat/stream/route.ts`
- (Optional) `lib/utils/errors.ts` (copy text only; 413 mapping already exists)

Tasks:

- [ ] Import `MAX_MESSAGE_CHARS` from `lib/config/limits` in both endpoints
- [ ] Identify the triggering user message content:
  - If using new format: last message with `role === 'user'` (post-enhancements)
  - If legacy `body.message` path: the single user content
  - For multimodal content blocks, count text parts only (ignore image blocks)
- [ ] If content length > `MAX_MESSAGE_CHARS`, throw `ApiErrorResponse` with `ErrorCode.PAYLOAD_TOO_LARGE (413)` and message: "Message exceeds 20,000 character limit. Reduce by {overBy} characters and try again."
- [ ] Keep token-based validation (`validateRequestLimits`) as-is
- [ ] Log a concise warning with user/tier/model (avoid logging full content)

User verification:

- [ ] Send payload with user message length 20,001 → 413 JSON error with expected message
- [ ] Send exactly 20,000 → 200 OK or model error as usual (no 413)
- [ ] Multimodal message: images + 20,001 text → 413
- [ ] Legacy body.message only: 20,001 → 413
- [ ] Rate limiting and other middleware unaffected

---

### Phase 4 — Tests

Files to add/update:

- UI tests:
  - `tests/components/MessageInput.char-limit.test.tsx` (new)
- API tests (if present test harness for routes; otherwise add minimal):
  - `tests/api/chat.char-limit.test.ts` (new)
  - `tests/api/chat.stream.char-limit.test.ts` (new)

Tasks:

- [ ] UI: renders counter, thresholds, disables Send at >20k, blocks Enter-to-send, re-enables when trimmed, handles paste
- [ ] API: 413 when over limit for regular and stream endpoints; exact boundary at 20,000; multimodal handling (text-only length)
- [ ] Keep tests fast with minimal mocks; reuse standard Next/router/auth mocks per repo conventions

User verification:

- [ ] `npm test` passes for added test files
- [ ] No regressions in existing MessageInput tests

---

### Phase 5 — Documentation & cleanup

Files to change:

- `docs/components/chat/MessageInput.md`
- `docs/api/*` (add note in chat endpoints response behavior for 413)
- (Optional) `lib/utils/validation.ts` — add @deprecated JSDoc to `validateChatRequest`

Tasks:

- [ ] Document the 20k limit, UX behavior (denominator hidden; counter shows only "X characters"), and 413 response shape
- [ ] Mark `validateChatRequest` as deprecated in comments (not used by chat endpoints)
- [ ] Add changelog entry in `docs/` (or update an existing summary file)

User verification:

- [ ] Docs render correctly and clearly explain behavior
- [ ] Deprecated note prevents confusion with the old 4,000 character validator

---

## Acceptance criteria

- Users cannot send messages over 20,000 characters via the UI; Send stays disabled, and Enter-to-send is blocked, while editing remains possible
- Visual counter ("X characters" only, no denominator) and inline hint clearly communicate the status (normal/over-limit) and how many characters to remove when over
- MAX_MESSAGE_CHARS is read from env (`NEXT_PUBLIC_MAX_MESSAGE_CHARS` for UI; `MAX_MESSAGE_CHARS` for API) with sane default 20,000
- Server rejects over-limit messages with HTTP 413 and actionable error copy
- Behavior is consistent for both standard and streaming chat endpoints
- Token-based validation remains in effect and may still reject long messages below 20,000 chars depending on model/tier
- Tests cover key UI and API scenarios and pass reliably
- Documentation updated; legacy validator clearly marked deprecated

---

## Risks and mitigations

- Token vs char mismatch: 20k chars may still exceed token limits for some languages or contexts → keep token validation as source of truth; present optional estimated token hint later
- Accessibility regressions: ensure `aria-live` updates are polite and non-spammy (announce only on threshold transitions)
- Multimodal content: ensure only text parts are counted for server guard; ignore image blocks
- Performance: string length checks are O(1); no measurable impact expected

---

## Rollout

- Feature is safe-by-default; no feature flags required
- Deploy with tests; monitor logs for 413 frequency and UX friction
- Iterate threshold copy or styling as needed after feedback
