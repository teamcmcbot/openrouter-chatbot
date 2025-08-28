# User Settings: System Prompt — Implementation Plan (PLAN phase)

Status: Ready for approval (no code changes yet)

Scope

- Add a configurable user “System Prompt” setting backed by `profiles.system_prompt`.
- Reuse/extend existing `PUT /api/user/data` to update the system prompt.
- Inline editor within Preferences (under Temperature), textarea, 4000-char limit, trimming, and validation for abuse/policy violations.
- Client and server validations must match; server is authoritative.
- Follow standardized authentication middleware.

Decisions (from stakeholder confirmations)

- API: Reuse `PUT /api/user/data` to accept `systemPrompt` field.
- UX: Place in Preferences section, directly under Temperature. Read-only view shows a truncated preview; when Edit is toggled, show an inline textarea (no separate nested modal; the existing settings dialog already handles mobile).
- Limits: Max 4000 characters; trim; no minimum beyond non-empty after trim.
- Validation: Block empty after trim; block script/executable HTML patterns; block disallowed control characters; optional mild profanity list; return clear JSON errors.
- Notifications: Reuse `components/ui/Toaster.tsx` (react-hot-toast) and call `toast.success` / `toast.error` from UserSettings. Do not create a new toaster component.
- If null/empty: UI disallows saving; server rejects the payload.

Dependencies & References

- Schema: `profiles.system_prompt TEXT DEFAULT 'You are a helpful AI assistant.'` (see `/database/schema/01-users.sql`).
- DB procedure: Prefer `public.update_user_preferences(user_uuid, 'model', preferences JSONB)` to update `system_prompt` and create an audit log entry.
- Auth middleware: Use `withProtectedAuth` per `/lib/middleware/auth.ts` and `/lib/types/auth.ts`.
- Likely API file: `src/app/api/user/data/route.ts` (Next.js App Router). Adjust if actual path differs.
- UI entry: `UserSettings.tsx` (confirm actual location).
- Hooks/stores: `hooks/useUserData.ts`, `contexts/AuthContext.tsx` (for updating local user state if needed).

---

Phase 1 — Discovery & Finalize Requirements

- [x] Placement: Add System Prompt within the "Preferences" section, directly under Temperature.
- [x] Editing pattern: Inline textarea when Edit mode is enabled; truncated preview in read-only mode.
- [x] Notification approach: Reuse existing `Toaster.tsx` and `react-hot-toast`; no new toaster component needed.
- [x] Limits and validation: 4000 max, trim, required after trim; reject executable HTML/script patterns and disallowed control chars; optional mild profanity list.
- [ ] Review `UserSettings.tsx` to confirm exact insertion point and ensure layout works on mobile in the existing settings dialog.
- [ ] Locate `PUT /api/user/data` handler and confirm patterns (request parsing, middleware usage, response shape).
- [ ] Confirm presence of `update_user_preferences` RPC usage; if not, decide direct update to `profiles.system_prompt` with proper audit.
- [ ] Verify existing toast, error handling, and form patterns for consistency.

Summary before verification: System Prompt will live under Temperature in Preferences; edited inline during Edit mode; notifications will reuse `Toaster.tsx`; validation and limits confirmed.
User verification:

- [ ] Approve placement, inline editor pattern, and toaster reuse.

Manual test instructions:

- Open User Settings → Preferences. Verify that System Prompt appears under Temperature. Toggle Edit to reveal the textarea editor. Confirm toasts appear (if Toaster is mounted) when saving succeeds/fails.

---

Phase 2 — API Extension (Reuse PUT /api/user/data)

- [ ] Extend request schema to accept `systemPrompt: string` (optional field).
- [ ] Apply `withProtectedAuth` to the route (ensure no manual auth checks).
- [ ] Implement server-side validation:
  - [ ] Trim input.
  - [ ] Required after trim (length ≥ 1).
  - [ ] Max length ≤ 4000 characters.
  - [ ] Reject executable HTML/script patterns: `<script>`, `<iframe>`, `<object>`, `<embed>`, inline event handlers (e.g., `onload=`, `onerror=`), `javascript:`/`data:` URLs.
  - [ ] Reject disallowed control characters: `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`.
  - [ ] Optional mild profanity blocklist.
- [ ] Update logic:
  - [ ] Prefer `SELECT public.update_user_preferences(authContext.user.id, 'model', jsonb_build_object('system_prompt', $value));`
  - [ ] If RPC is unsuitable in this layer, fallback to updating `profiles.system_prompt` directly with `updated_at = NOW()`.
- [ ] Responses:
  - [ ] 200 with `{ success: true, systemPrompt: <saved> }`.
  - [ ] 400 `{ code: 'VALIDATION_FAILED', message, details? }`.
  - [ ] 413 for oversize payloads if applicable.
- [ ] Tests (API): success, empty, too long, unsafe content, unauthenticated (blocked by middleware).

Summary before verification: Endpoint accepts and validates `systemPrompt`, updates DB via RPC, returns standard responses.
User verification:

- [ ] Approve payload, validation, and response semantics.

Manual test instructions:

- Use REST client or curl to send `PUT /api/user/data` with different `systemPrompt` values (valid, empty, too long, unsafe). Verify DB updates and response codes.

---

Phase 3 — UI: Preferences Section Inline Editor

- [ ] Add a “System Prompt” row to the Preferences section with:
  - [ ] In read-only: truncated preview (first ~200 chars) with ellipsis if truncated.
  - [ ] In Edit mode: multiline textarea under the label.
- [ ] Textarea/editor:
  - [ ] Soft wrap and suitable height for long text; desktop resizing optional.
  - [ ] Character counter (e.g., `123 / 4000`).
  - [ ] Save disabled when invalid; loading state while saving.
- [ ] Accessibility:
  - [ ] Proper label and description for textarea.
  - [ ] `aria-invalid` and inline error messaging when invalid.
- [ ] i18n readiness if applicable.

Summary before verification: Inline editor in Preferences offers accessible editing with live counter.
User verification:

- [ ] Approve UI structure, behavior, and accessibility approach.

Manual test instructions:

- Open settings; see truncated preview; toggle Edit; type content; watch counter; try Save with invalid/valid inputs.

---

Phase 4 — Client-Side Validation & Save Flow

- [ ] Implement a shared validator (e.g., `lib/utils/validation/systemPrompt.ts`) used by both UI and API (or mirrored logic if shared not feasible on server).
- [ ] Client validation rules mirror server:
  - [ ] Trim prior to checks.
  - [ ] Required after trim.
  - [ ] ≤ 4000 chars.
  - [ ] Block script/executable HTML patterns, disallowed control chars; optional mild profanity.
- [ ] Save flow:
  - [ ] On Save, validate; if valid, call `PUT /api/user/data` with `{ systemPrompt }`.
  - [ ] Handle success: toast via `react-hot-toast` (reusing `Toaster.tsx`), update preview, exit edit mode.
  - [ ] Handle error: show inline error and toast; do not exit edit mode; retain user input.
- [ ] Prevent saving null/empty; button disabled with explanatory message.

Summary before verification: Client and server validations align; clear error handling; success updates UI state.
User verification:

- [ ] Confirm validation and error messages.

Manual test instructions:

- Try empty, too long, and unsafe content; verify client blocks and server responses are consistent.

---

Phase 5 — State Sync & Data Refresh

- [ ] Ensure local user data source (e.g., `useUserData`, `AuthContext`) reflects the updated `system_prompt` after save.
- [ ] Decide whether to optimistically update local state or re-fetch on success; prefer re-fetch if inexpensive and standard.
- [ ] Verify preview updates immediately after save.

Summary before verification: User sees up-to-date prompt in settings and any dependent UI.
User verification:

- [ ] Approve state sync approach.

Manual test instructions:

- Save a new prompt; verify preview updates; refresh page to ensure persistence.

---

Phase 6 — Testing

- [ ] API tests: success, empty, too long, unsafe content, unauthenticated.
- [ ] UI tests: render section, toggle edit, validation messages, save success/failure paths, accessibility (focus, labels), mobile viewport behavior.
- [ ] Snapshot tests where appropriate; avoid brittle snapshots for long text.

Summary before verification: Tests cover main paths and guardrails.
User verification:

- [ ] Approve test coverage and scenarios.

Manual test instructions:

- Run `npm test`; confirm all tests pass. Perform manual smoke tests in Chrome and Safari, plus mobile emulation.

---

Phase 7 — Documentation

- [ ] Add `/docs/` page updates:
  - [ ] Feature overview and screenshots/gifs.
  - [ ] API update for `PUT /api/user/data` body/response/errors.
  - [ ] Validation rules and examples; troubleshooting guidance.
- [ ] Link from existing user settings docs and changelog/summary.

Summary before verification: Docs describe how to use and troubleshoot the feature.
User verification:

- [ ] Approve docs content.

Manual test instructions:

- Open the new docs and verify examples and guidance match behavior.

---

Phase 8 — Rollout & Follow-ups

- [ ] Confirm rate-limiting defaults suffice for this endpoint.
- [ ] Consider feature flag if needed (likely unnecessary).
- [ ] Create follow-up issue(s) for centralized moderation utilities or admin reset action.

Summary before verification: Safe rollout with noted follow-ups.
User verification:

- [ ] Approve rollout notes and follow-ups.

---

Acceptance Criteria

- Users can view a truncated preview and edit their system prompt inline under Temperature in the Preferences section.
- Saving enforces trim, non-empty, ≤4000 chars, and abuse/policy checks, on both client and server.
- `PUT /api/user/data` accepts `systemPrompt`, validates, updates DB via RPC (preferred) or direct update, and returns clear responses.
- UI provides accessible interactions, character counter, error messages, and success toasts.
- Tests cover key success and failure scenarios; `npm test` passes.
- Documentation is updated with API and user guidance.

Security & Compliance Notes

- Use standardized middleware `withProtectedAuth`; no manual auth logic.
- Avoid echoing back unsafe content in error messages; sanitize/escape UI output.
- Audit logs via `preferences_updated` (from RPC) or equivalent when directly updating the column.

Risks & Mitigations

- Overblocking legitimate content: Keep safety checks minimal (executables and control chars) and document rationale.
- Long-text UX on small screens: existing settings dialog handles scrolling; ensure textarea is usable on mobile.
- Divergent validations: Centralize validation logic or keep mirrored tests to ensure parity.
