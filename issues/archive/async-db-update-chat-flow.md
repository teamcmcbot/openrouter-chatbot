# Async DB Update After Successful Assistant Response

## Overview

Item 3 in [sync-endpoint.md](sync-endpoint.md) proposes removing reliance on the `/api/chat/sync` endpoint for persisting new messages. The chat API should persist the user and assistant messages directly when a response is successful, without waiting for the frontend to run a manual or auto sync.

## Current Behaviour

- `sendMessage` in `useChatStore` optimistically stores both messages locally then schedules a background call to `/api/chat/sync`.
- Conversation title changes and sign‑in also trigger the same sync routine.
- The sync endpoint upserts **all** existing messages, firing `update_session_stats()` and `track_user_usage()` on every row. Repeated updates inflate analytics like `user_usage_daily`.

## Implementation Considerations

1. **Direct write on success**
   - After `POST /api/chat` receives a valid assistant reply, the backend should call a lightweight endpoint or stored procedure to insert:
     - The user message with its `input_tokens` and metadata.
     - The assistant message with its `output_tokens`, linked via `user_message_id`.
     - Updated fields in `chat_sessions` (message count, total tokens, last preview, last model, timestamps).
   - Database triggers (`on_message_change` → `update_session_stats()` → `track_user_usage()`) will maintain analytics automatically.
2. **Error flow**
   - Failed assistant responses currently mark the user message with `error: true` in local state. No DB write occurs.
   - When "Try again" is used, the **same message id** is retried (`retryMessage` reuses `messageId`), so the record should either be inserted only after success or updated if a placeholder row was written.
   - Updating an existing row will trigger `update_session_stats()` again. Ensure we only call `track_user_usage()` once per successful attempt—either by inserting after success or by updating a placeholder row with tokens only once.
3. **Disabling extra sync scenarios**
   - Remove auto‑sync after each message and after title edits. Leave sync only for the sign‑in case to upload conversations created while offline/unauthenticated.
   - Manual sync UI may be dropped or repurposed to reconcile unsent rows (e.g., if the async write fails).
4. **Handling async write failures**
   - If the new background API call fails, queue the unsynced message locally. A periodic job (a trimmed version of current auto-sync) can retry only those unsent messages instead of re‑syncing all history, avoiding double counting in `user_usage_daily`.
5. **Database functions**
   - Existing core function `update_session_stats` remains in use. The legacy helper `sync_user_conversations()` has been removed from the schema as unused; bulk sync is handled directly via the `/api/chat/sync` endpoint performing Supabase upserts.
   - No new analytics function is required, but we must ensure `input_tokens` are not updated for assistant rows (see item 1 in the issue).

## Open Questions

- Should failed user messages be inserted immediately with an `error` flag or only written after a successful retry?
- When a retry succeeds, should we update the existing row or insert anew? Updating preserves the same `id` and avoids double counting if `track_user_usage()` only runs once.
- How will the async write be authenticated? Likely via service role key or Supabase server-side function.

### Analysis and Proposed Approach

1. **Persisting failed messages**

   - _Option A – Insert immediately:_ store the user message with `error: true` and no assistant row. This captures token usage and keeps the timeline intact.
     - **Pros:** reflects actual tokens spent; enables syncing failed attempts across devices; user can still see the message.
     - **Cons:** updating this row later triggers `update_session_stats()` again which may double count unless tokens remain unchanged.
   - _Option B – Defer write until success:_ keep the failed message only in local state and insert once a retry succeeds.
     - **Pros:** avoids duplicate updates and analytics complications.
     - **Cons:** loses visibility of failed attempts and discards token usage from unsuccessful calls.
   - _Recommendation:_ insert the failed user message immediately with tokens so that usage tracking remains accurate. On retry, update the same row’s `error` flag without modifying `input_tokens` to avoid recounting.

2. **Handling successful retries**

   - _Option A – Update existing row:_ continue using the same message ID and update its content/error status. Insert a new assistant message linked by `user_message_id`.
     - **Pros:** maintains conversation order and prevents analytics from treating the retry as a new message, provided token values are unchanged.
     - **Cons:** triggers `update_session_stats()` on update; must ensure triggers ignore unchanged token fields.
   - _Option B – Insert a new row:_ keep the failed message as-is and create a fresh user+assistant pair on retry.
     - **Pros:** avoids extra UPDATE triggers.
     - **Cons:** double counts message attempts and clutters the history.
   - _Recommendation:_ update the existing user message in place while ensuring `track_user_usage()` is idempotent on updates (e.g., only increment when token counts change).

3. **Authentication for async writes**
   - _Option A – Server-side call with service role key:_ Next.js route uses Supabase admin credentials to invoke a stored procedure.
     - **Pros:** simplest implementation and avoids exposing elevated keys to the client.
     - **Cons:** requires secure environment variables on the server.
   - _Option B – Client-side Supabase write:_ front‑end writes directly to `chat_messages` via the user's session.
     - **Pros:** no extra endpoint; uses existing auth context.
     - **Cons:** harder to ensure atomic updates and may expose rate‑limited insert operations to the client.
   - _Recommendation:_ perform a server-side call using the service role key to a dedicated function (e.g., `insert_chat_message`) so the chat API remains the single source of truth.

## Next Steps

1. Design a new endpoint or server-side function invoked from the chat API to insert the new messages and update the session in a single transaction.
2. Modify `sendMessage`/`retryMessage` flows to remove auto-sync calls.
3. Keep sign-in sync but ensure it performs insert-only logic—handled by `/api/chat/sync` upserts (no Postgres `sync_user_conversations()`).
4. Document the new flow and update analytics tests to verify only new messages impact `user_usage_daily`.
