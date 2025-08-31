# Chat sessions: `is_active` deprecation + local cache & revalidation

Owner: TBD
Status: Proposal (seeking sign-off)
Related: docs/architecture/chat-history-pagination-and-lazy-loading.md

## Context

- Frontend currently highlights the selected conversation using the client store (Zustand): `currentConversationId` + per-conversation `isActive` flags.
- Multiple devices/sessions may be open for the same account, so a centralized DB `chat_sessions.is_active` cannot represent the per-device selection. It easily becomes incorrect or misleading.
- New sidebar architecture: GET `/api/chat/sync?limit=20&summary_only=true` returns conversation summaries only; full messages are fetched lazily via GET `/api/chat/messages?session_id=...` on selection.

## Findings (code scan)

- Backend references of `is_active` exist in `src/app/api/chat/session/route.ts` and a supporting RPC in `database/patches/active-session-management/01-active-session-function.sql`.
  - POST `/api/chat/session` special-cases `is_active === true` to call `set_active_session(...)`, and allows setting `false` in normal update flow.
- Database DDL defines `is_active`:
  - `database/schema/02-chat.sql`: `chat_sessions.is_active BOOLEAN DEFAULT true NOT NULL` and select lists including `s.is_active`.
- Docs mention `is_active` as a UI field.
- Frontend active selection is tracked entirely in the client store and persisted to `localStorage` via `persist` middleware (`conversations`, `currentConversationId`). There is no consumer of DB `is_active` for selection.

Conclusion: The DB `is_active` is not needed to drive the UI and provides little value in multi-device scenarios. It creates extra code paths and a maintenance burden.

## Proposal A: Deprecate and drop `chat_sessions.is_active`

1. Mark as deprecated in docs and API (no-op on writes):
   - Update API docs to state the field will be ignored and removed.
   - In `POST /api/chat/session`, stop accepting `is_active`; remove the special branch that calls `set_active_session`.
2. Database changes (after sign-off):
   - Add a patch under `database/patches/remove-is-active/` to:
     - Drop any triggers/functions solely for `is_active` management (e.g., `set_active_session`).
     - Drop column `is_active` from `public.chat_sessions`.
     - Update any views/selects that reference it.
   - Follow the project DB workflow: idempotent patch with dependency checks; merge back into `/database/schema/` after approval.
3. Client remains the source of truth for “which conversation is active” (per device/session).

Notes:

- If product later needs a server-visible “recently active session” per device, introduce a separate telemetry table, keyed by `(user_id, device_id)` with TTL rather than an in-row boolean.

## Proposal B: Sidebar local cache with strict revalidation

Goal: Make `/chat` load fast using locally persisted state, while staying correct via a cheap top-of-list check.

Behavior:

- Persist both conversation summaries and any fetched messages in the chat store (already persisted via `persist` partialization: `conversations`, `currentConversationId`).
- On `/chat` mount:
  1. Render from store immediately (sidebar and active conversation messages if present).
  2. In the background, call GET `/api/chat/sync?limit=20&summary_only=true`.
  3. Compare the response’s first 20 sessions with the store’s first 20 (sorted by `last_message_timestamp DESC, id DESC`). For each index i in [0..19], require both `id` and `lastMessageTimestamp` to match exactly.
     - If ALL 20 match: do nothing. Keep local UI as-is.
     - If ANY mismatch: treat server as source of truth for the top page. Replace the first page with server results, clear messages for sessions not currently active, and keep additional locally loaded pages below intact only if they logically follow (optional optimization — safe default is to keep only the 20 from the server and reset pagination).
  4. If the current active conversation id is among the 20 and messages are empty, immediately call GET `/api/chat/messages?session_id=...` to hydrate the middle pane.

Edge cases:

- Anonymous vs authenticated filtering already handled by `filterConversationsByUser`. The compare step should operate on the filtered subset.
- If local store has fewer than 20 items, comparing only the length and items present is acceptable; any shortfall triggers a refill from server.
- Deleted sessions: mismatch path covers this by resetting to server results.

Data contract for compare:

- `id: string`
- `lastMessageTimestamp: string | null` (ISO). Null counts as mismatch unless both sides are null.

## Implementation plan

Phases

- [ ] A1. Remove `is_active` write paths in API (feature flag to ease rollout)
  - Stop calling RPC `set_active_session` and ignore `is_active` in request bodies.
  - Keep DB schema unchanged in this phase.
  - Add deprecation warning in server logs if client sends `is_active`.
- [ ] A2. DB patch to drop column and supporting RPC (gated by migration window)
  - Patch: drop dependent objects, drop column, update views; idempotent.
  - After approval, merge into `/database/schema/02-chat.sql`.
- [ ] B1. Store-level revalidation utilities
  - Add a selector/helper to return top N conversations in canonical sort order.
  - Add `revalidateTopPage(serverConvs: Conversation[], pageSize: number)` that performs the match-or-reset logic.
- [ ] B2. `/chat` page wiring
  - On mount, render from store; fire revalidation request; call `revalidateTopPage` with response; if active session lacks messages and appears in top 20, lazily fetch messages.
- [ ] B3. Persistence verification
  - Ensure `persist.partialize` includes `conversations` and `currentConversationId` (already present). Confirm dates are deserialized (already handled via `deserializeDates`).

## Testing

Manual user steps

- Sign in, open `/chat`. Confirm sidebar renders instantly from previous state (if present) and active conversation messages show without refetch.
- Navigate to another page and back; observe no flash/empty states. Top-of-list revalidation runs but does not re-render if data matches.
- Create a new message in a different device/browser; return to `/chat` on the first device and verify mismatch triggers a sidebar refresh.
- Load more (to 40 items), navigate away and back; ensure all 40 remain in the sidebar; top-20 revalidation does not clobber unless mismatch occurs.

Automated tests (outline)

- Store unit: compare function exact-match vs mismatch, various lengths and timestamp nulls.
- Integration: hydrate store, simulate server response matching top 20, assert no reorder; then simulate mismatch and assert reset + optional lazy fetch for active session.

## Risks & mitigations

- Stale messages in middle pane if active session changed on another device: middle pane will update after a revalidation mismatch and a subsequent messages fetch.
- Large localStorage footprint: limit message payload per session if needed; consider pruning on unload.

## Decision needed

- Approve dropping DB `is_active` and move to client-only active tracking per device/session.
- Approve sidebar cache + revalidation approach.
