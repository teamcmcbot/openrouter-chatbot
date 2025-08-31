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

### Phase A — Remove `is_active` (DB + API)

- [x] A1. Create DB patches (idempotent) to remove RPC and column

  - Directory: `database/patches/remove-is-active/`
  - Files to add (and run in order):
    - `01-drop-rpc-set_active_session.sql`
      - Drop `public.set_active_session` if it exists (idempotent; safe no-op if never applied).
    - `02-update-views-and-references.sql`
      - Recreate `public.get_user_recent_sessions` without `is_active` and update any helper views/selects.
    - `03-drop-column-chat_sessions-is_active.sql`
      - Drop `public.chat_sessions.is_active` if it exists.
  - Acceptance: Running patches twice is safe; no remaining references to `is_active` or `set_active_session`.

- [x] A2. User executes the patch in environment(s)

  - Apply patches in order 01→02→03 per project DB workflow (Dev → Staging → Prod).
  - Verify: `chat_sessions` has no `is_active` column; `public.set_active_session` does not exist.
  - Rollback plan: Restore from backup or re-add column/function if needed.

- [x] A3. Update server code to remove references

  - File: `src/app/api/chat/session/route.ts`
    - Remove special branch that calls `supabase.rpc('set_active_session', ...)` when `is_active === true`.
    - Ignore `is_active` in request bodies; log a deprecation warning if present for one release.
    - Remove `is_active` from `SessionUpdateData` and update the UPDATE shape.
  - Grep for any other references to `is_active` or `set_active_session` and remove/update accordingly.
  - Acceptance: Build passes; POST `/api/chat/session` still updates titles and rollups normally.

- [x] A4. Manual shakedown (user verification)

  - Title update still works via `/api/chat/session`.
  - ChatSidebar selection works across navigations; active highlight is client-only.
  - Sending/receiving messages unaffected.
  - No 500s related to missing `set_active_session` or column.
  - DB schema reflects drop; app logs show deprecation warning only when legacy clients send `is_active`.

- [x] A5. Documentation and schema merge
  - Docs:
    - Update `docs/api/chat-session.md` to remove `is_active` from request/response examples and parameter tables; add deprecation note in changelog.
    - Update `docs/database/database_architecture.md` to remove `is_active` from UI fields.
  - Schema merge:
    - Reflect executed patches in canonical DDL (`/database/schema/02-chat.sql`) by removing the column and any references.
  - Close the loop: archive the old RPC patch folder `database/patches/active-session-management/` if fully obsolete.

### Phase B — Sidebar local cache + strict revalidation

- [ ] B1. Store-level revalidation, preservation, and inflight guards

  - Add `getTopNConversations(n)` (sorted by `lastMessageTimestamp DESC, id DESC`, filtered by current user).
  - Add `revalidateTopPage(serverConvs: Conversation[], pageSize: number)` with strict compare by `[id, lastMessageTimestamp]`:
    - If ALL N match: no-op.
    - If ANY mismatch: replace the first page with exactly the N conversations from the server and reset pagination state to that first page.
    - When replacing, preserve local `messages` for any conversation that already has cached messages; if active conversation is in the N but has no messages, schedule immediate lazy hydrate.
  - Add a per-session inflight map in `loadConversationMessages(id)` to dedupe concurrent fetches.

- [ ] B2. Initial load orchestration (single entry point)

  - Use `useChatSync` as the sole initializer for authenticated users (auth-change driven). Remove `ChatSidebar`’s on-mount `loadInitialConversations` effect to avoid double GETs.
  - Flow example:
    1. App renders /chat → store rehydrates → sidebar and (if available) active messages render immediately from local cache.
    2. If authenticated, `useChatSync` calls GET `/api/chat/sync?limit=20&summary_only=true` in background and then `revalidateTopPage`.
    3. If active conversation is among the top 20 and has empty messages, call GET `/api/chat/messages?session_id=...` to hydrate the middle pane.

- [ ] B3. Sidebar pagination source of truth

  - Switch `ChatSidebar` to render from the paginated list in store (page size = 20 by default, with Load More) instead of `getRecentConversations(1000)`.
  - Keep the Load More control as the only way to append additional pages.

- [ ] B4. Selection flow: remove duplicates and lazy hydrate

  - Remove the extra `loadConversationMessages` call from `ChatSidebar` click handler; rely on `switchConversation(id)` to trigger lazy load when `messages.length === 0`.
  - Ensure the inflight guard (B1) prevents duplicate fetches if multiple triggers occur.

- [ ] B5. Message-level revalidation (since timestamp)

  - Extend GET `/api/chat/messages` to accept `since_ts` (alias: `lastMessageTimestamp`) to support cheap validation of cached message lists:
    - If server has newer messages after `since_ts`, respond accordingly (either incremental list or a flag + full list).
    - Client behavior:
      - On re-select of a conversation with cached messages: call `GET /api/chat/messages?session_id=...&since_ts=...` (debounced). If up to date: no-op; if newer: append or refetch and re-render.
      - On top-20 mismatch replace: hydrate only the active conversation if it is empty; preserve other cached messages per policy above.

- [ ] B6. Persistence verification

  - Ensure `persist.partialize` includes `conversations` and `currentConversationId` (already present). Confirm dates are deserialized via `deserializeDates` (already present).
  - Monitor localStorage size; plan a future pruning strategy if needed (not in scope for this change).

- [ ] B7. Logging & tests
  - Add minimal debug logs to identify single vs duplicate initial loads (e.g., log in `useChatSync` and, temporarily, in removed ChatSidebar loader to confirm removal).
  - Unit tests:
    - `revalidateTopPage` match vs mismatch (various lengths and null timestamps), preservation of cached messages, active hydration scheduling.
    - `loadConversationMessages` inflight dedupe (only one network call for simultaneous requests).
  - Integration tests:
    - Rehydrate store, navigate to /chat: verify immediate render from cache; background revalidation does not reorder if equal; resets to server 20 on mismatch.
    - Click reselect on a cached conversation: call messages `since_ts` path and update only when newer exist.

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
