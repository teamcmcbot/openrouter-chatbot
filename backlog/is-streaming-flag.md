# is_streaming flag – end-to-end tracking plan

## Goal

Ensure chat_messages.is_streaming in the database accurately reflects whether a message was sent via streaming or non-streaming across all flows:

- Normal message sending
- Retry message sending
- Anonymous -> sign-in -> sync flow

## Current findings

- DB schema: chat_messages has column `is_streaming BOOLEAN DEFAULT false`.
- POST /api/chat/messages currently forces `is_streaming: false` in both single and bulk upserts.
- POST /api/chat/sync sets `is_streaming: false` for all synced messages.
- Client streaming flow exists (useChatStreaming + /api/chat/stream). User messages include `was_streaming: true`, but assistant messages were not marking this before.
- Non-streaming flow (useChatStore -> /api/chat) sends messages without any explicit streaming marker.

## Design decision

- Source of truth on the client: ChatMessage.was_streaming boolean captures the mode used when the message was created/sent.
- Server persistence: Map ChatMessage.was_streaming to DB chat_messages.is_streaming for every message. If missing, default to false.
- Sync: Preserve the original client-side `was_streaming` flag when syncing anonymous conversations on sign-in.

## Affected routes/components

1. Normal message sending
   - Client: stores/useChatStore.ts (non-streaming), hooks/useChatStreaming.ts (streaming)
   - Server: src/app/api/chat/messages/route.ts
2. Retry message sending
   - Client: stores/useChatStore.ts (non-streaming retry), hooks/useChatStreaming.ts (streaming retry)
   - Server: src/app/api/chat/messages/route.ts
3. Anonymous -> sign-in -> sync
   - Client: stores/useChatStore.ts syncConversations/migrateAnonymousConversations
   - Server: src/app/api/chat/sync/route.ts

## Implementation plan

- Server: /api/chat/messages (POST)
  - Map `message.was_streaming === true` to `is_streaming` for both array and single message paths.
  - Backward-compat: if payload includes `is_streaming` directly, prefer `was_streaming` and ignore raw `is_streaming` to keep one canonical input (client owns was_streaming).
- Server: /api/chat/sync (POST)
  - Map `message.was_streaming === true` to `is_streaming` in `messagesData` upserts.
- Client: ensure `was_streaming` exists on both user and assistant messages
  - hooks/useChatStreaming.ts: user messages already set was_streaming: true; add was_streaming: true for assistant messages when built from streaming results (normal and retry).
  - stores/useChatStore.ts: set `was_streaming: false` for assistant messages created from non-streaming responses (normal and retry). User messages already set to false in non-streaming paths and true in streaming paths.

## Edge cases

- Failed streaming send or retry: user message persisted with `error_message`, should still carry `was_streaming: true` so the DB record has `is_streaming=true` even though assistant didn’t arrive.
- Legacy clients without was_streaming: server defaults to `is_streaming=false` safely.
- Sync payload from older persisted state: same default false behavior if flag missing.

## Acceptance criteria

- When sending with streaming enabled:
  - User and assistant DB rows for the exchange have `is_streaming=true`.
- When sending with streaming disabled (non-streaming):
  - User and assistant DB rows have `is_streaming=false`.
- On retry:
  - If original was streaming and retry uses streaming, user row remains is_streaming=true and assistant retry row is is_streaming=true.
  - If original was non-streaming and retry uses non-streaming, user and assistant rows are is_streaming=false.
  - Mixed retries (e.g., original non-streaming, user retries with streaming): user row already persisted remains false; on retry the same user row is upserted with `was_streaming` of the retry path. We keep the current-session semantics: the retry upsert updates is_streaming to reflect the latest send mode used for that user message id.
- Anonymous -> sign-in -> sync persists original was_streaming into DB `is_streaming`.

## Test plan (manual + unit)

- Manual
  1. Toggle streaming ON. Send a message.
     - Expect POST /api/chat/stream used, then POST /api/chat/messages with both messages including was_streaming: true.
     - Verify in DB: both rows have is_streaming=true.
  2. Toggle streaming OFF. Send a message via /api/chat.
     - Verify DB: both rows have is_streaming=false.
  3. Cause an error with streaming ON, ensure failed user message persists with is_streaming=true.
  4. Retry last failed message using streaming retry path. Verify assistant row is is_streaming=true and user row retains/updates is_streaming=true.
  5. Anonymous conversation → sign in → automatic sync. Verify all messages keep correct is_streaming values.
- Unit (where applicable)
  - Mock POST /api/chat/messages payloads ensuring was_streaming flows through to is_streaming in the upsert body.
  - Sync route unit test with conversation.messages including was_streaming and assert Supabase payload contains is_streaming accordingly.

## Rollout notes

- Backward compatible: non-breaking for existing clients.
- No DB migrations required.
- Logs: server continues to log message creation; additional debug can be temporarily added if needed.

## Status

- Implemented:
  - is_streaming mapping in /api/chat/messages and /api/chat/sync (from was_streaming)
  - Client flags set in streaming and non-streaming assistant paths
- Pending:
  - /api/chat/sync parity with /api/chat/messages payload (websearch defaults, attachment flags, content_type sanitization, metadata parity) — see checklist below
  - Tests to guard against nulls and parity regressions
  - Manual QA per tasks.md

## Root cause analysis (from tasks.md walkthrough)

This section traces the observed behavior in `.github/tasks.md` and pinpoints why it happens, without changing code yet.

1. Anonymous send unexpectedly hits POST /api/chat/messages

- Where it happens (client):
  - `hooks/useChatStreaming.ts` (streaming happy path): after building `updatedUserMessage` and `assistantMessage`, it unconditionally calls `fetch('/api/chat/messages', { body: { messages: [updatedUserMessage, assistantMessage], sessionId, sessionTitle? } })` to persist the pair.
  - `hooks/useChatStreaming.ts` (streaming retry happy path): same unconditional call after retry success.
  - `stores/useChatStore.ts` (non‑streaming happy path and retry): after assistant response, it calls `fetch('/api/chat/messages', ...)` to persist the pair.
- Why it affects anonymous users: these client calls don’t gate on auth. The server route `/api/chat/messages` is PROTECTED (wrapped by `withProtectedAuth`). For anonymous users the request will 401 and be ignored by DB, but the network event is still visible in DevTools, which is why step 4, 8, 12 in tasks.md show `/api/chat/messages` requests. Conclusion: the client should skip these calls when `!user?.id`; current code logs warnings but still attempts the request.

2. POST /api/chat/sync not saving anonymous messages after sign‑in

- Expected flow per tasks.md: after sign‑in, local anonymous conversations should be assigned a `userId` and sent via `POST /api/chat/sync`, which should upsert sessions and messages, including `was_streaming` → `is_streaming` mapping.
- Actual code path:
  - `hooks/useChatSync.ts` when user becomes authenticated calls, in order:
    1. `migrateAnonymousConversations(userId)`
    2. `loadUserConversations(userId)` (GET /api/chat/sync)
    3. `filterConversationsByUser(userId)`
  - `migrateAnonymousConversations` in `stores/useChatStore.ts`:
    - Finds conversations where `!conv.userId`, sets `userId` on them in local store, then immediately calls `syncConversations()`.
  - `syncConversations()` filters conversations to only those with `conv.userId === user.id` and POSTs them to `/api/chat/sync`.
- Why messages may not appear after sync:
  - Ownership middleware on `/api/chat/sync` validates each conversation’s `userId` matches the authenticated user. If any conversation in the POST body still has `userId` unset or mismatched (e.g., due to a race where `loadUserConversations()` rehydrates and overwrites local conversations before the sync completes), the middleware will reject the body or cause partial sync anomalies. The code sets `syncInProgress` using a `syncManager`, but there’s still a tight sequence: migrate → sync → concurrently load server conversations. This can interleave and cause the sync payload to miss messages or be filtered out.
  - Additionally, the server’s sync handler upserts sessions, then upserts messages only “if (conversation.messages && conversation.messages.length > 0)”. If the client’s migrated conversations sometimes lack messages (e.g., filtered state, or filtered by `filterConversationsByUser` when invoked early), the POST body may include a session with zero messages, resulting in a session without messages in DB.
  - Net effect matching tasks.md: after sign‑in, the POST `/api/chat/sync` happens, but the messages from the pre‑login conversation don’t show up. The title observed for the anonymous conversation likely came from the later authenticated `/api/chat/messages` call for Message 2, not from the sync of Message 1.

3. Session title origin in the walkthrough

- In both streaming and non‑streaming happy paths, the client includes `sessionTitle` in the first message pair persistence when the conversation transitions from "New Chat" to a real title. On the server, `/api/chat/messages` creates the session if missing and sets the title. That explains why tasks.md notes the session titled "who is the current king of England" even though Message 1 wasn’t in DB: Message 2’s authenticated save likely created or updated the session title.

4. Summary of root causes

- Anonymous persistence attempts: client always fires `/api/chat/messages` regardless of auth; server correctly rejects anonymous but network requests are visible, causing confusion.
- Post‑login sync misses messages: ordering and race between `migrateAnonymousConversations → syncConversations` and `loadUserConversations` can lead to an empty or partially owned conversations payload, which passes middleware for some sessions but results in zero messages written for the anonymous conversation. The server only writes messages if the array is non‑empty.
- Title observed with no first message: authenticated `/api/chat/messages` on subsequent sends sets the session title; the earlier anonymous message wasn’t persisted.

5. Validation steps to reproduce

- Anonymous send: open DevTools, observe `/api/chat/messages` 401/403 response on successful streaming/non‑streaming sends; DB remains unchanged.
- Sign‑in: watch console logs from `useChatSync` showing migrate → load → filter; capture the POST body of `/api/chat/sync` and verify conversations include userId and non‑empty `messages`. If messages array is empty or missing `was_streaming`, server writes only session metadata.

6. Proposed fixes (deferred; not implementing yet)

- Gate all client `/api/chat/messages` calls with `if (user?.id)` to avoid anonymous network noise.
- In `useChatSync`, await `migrateAnonymousConversations` completion before `loadUserConversations`, and ensure `syncConversations` finishes before loading server data to avoid overwrite races. Optionally defer `loadUserConversations` until after a short backoff if a sync is in progress.
- In `syncConversations`, ensure the payload includes conversations with populated `messages` arrays post‑migration, and consider logging payload sizes per conversation for troubleshooting.

## New finding (Aug 30, 2025): Sync fails on NOT NULL websearch fields

From the updated test steps in `.github/tasks.md` (steps 8–10), we observed:

- POST `/api/chat/sync` returns 200 but server logs show a database error and 0 conversations synced:

  - `code: '23502'` – null value in column "has_websearch" of relation "chat_messages" violates not-null constraint
  - Followed by `Chat sync completed { synced: 0, errors: 1 }`

- Subsequent GET `/api/chat/sync` lists the conversation with session metadata only, but no messages. Session aggregates (messageCount, totalTokens, lastMessageTimestamp, lastModel) reflect only the first pair and are stale.

### Why this happens

- In `src/app/api/chat/sync/route.ts`, the sync upsert maps web search fields as:

  - `has_websearch: message.has_websearch ?? null`
  - `websearch_result_count: message.websearch_result_count ?? null`

- The database schema enforces NOT NULL on these columns (with defaults, e.g., `has_websearch BOOLEAN NOT NULL DEFAULT false`, `websearch_result_count INTEGER NOT NULL DEFAULT 0`).

  - Passing `null` explicitly overrides column defaults and violates NOT NULL, causing the entire `chat_messages` upsert to fail for that conversation.
  - This can occur for any message that doesn’t explicitly include these fields, including user messages and assistant messages without web search.

- Because the message upsert fails, only the session upsert succeeds, leaving a session row without messages. The session aggregates persisted come from the client-provided `conversation` summary in the sync payload and can be stale (e.g., only reflecting the first message pair).

### Scope and relation to streaming

- This failure is independent of streaming; it affects sync for both streaming and non‑streaming messages when those fields are absent.
- The earlier streaming-only anonymous issue is already addressed separately by gating `/api/chat/messages` in the client.

### Proposed solution (planning only; no code changes yet)

- Map web search fields to non-null values during sync upserts:

  - `has_websearch`: use `message.role === 'assistant' ? Boolean(message.has_websearch) : false`
  - `websearch_result_count`: use `message.role === 'assistant' && typeof message.websearch_result_count === 'number' ? message.websearch_result_count : 0`
  - Alternatively: omit these keys entirely when undefined to allow DB defaults on INSERT. Since columns are NOT NULL, sending `null` must be avoided.

- Keep `is_streaming` mapping as implemented: `is_streaming: message.was_streaming === true`.

- Optional hardening (nice-to-have):
  - Compute session aggregates on the server from the `messages` array in the sync request to avoid trusting stale client values. At minimum, clamp to sane defaults if fields are missing.
  - Add structured logging for per-conversation message counts and first/last timestamps during sync to aid diagnostics.

### Acceptance criteria updates

- After sign-in sync:
  - No DB errors (no 23502) when messages omit web search fields.
  - All messages from the anonymous session are persisted.
  - GET `/api/chat/sync` returns the conversation with all message pairs.
  - Session aggregates (messageCount/totalTokens/last\*) are accurate and consistent with messages.

### Test plan additions

- Unit: Update sync route tests to assert that for messages without `has_websearch`/`websearch_result_count`, the upsert payload contains `false`/`0` (or omits the keys), never `null`.
- Integration (manual): Re-run the steps in `.github/tasks.md` and confirm `/api/chat/sync` no longer logs NOT NULL violations and that messages appear after GET.

## DB triggers and functions that depend on message rows

From `database/schema/02-chat.sql`:

- Session stats trigger: `public.update_session_stats()` runs AFTER INSERT/UPDATE/DELETE on `chat_messages` via trigger `on_message_change` and updates:
  - `chat_sessions.message_count, total_tokens, last_message_timestamp, last_message_preview, last_model, last_activity, updated_at`
  - Excludes error messages (where `error_message` is set) from last preview/model and stats.
  - Therefore, successful message inserts during sync must complete for aggregates to be recomputed; if the upsert fails, session aggregates remain stale client-provided values.
- Cost tracking:
  - `after_assistant_message_cost` trigger calls `public.calculate_and_record_message_cost()` (AFTER INSERT on `chat_messages`).
  - That routine calls `public.recompute_image_cost_for_user_message(NEW.user_message_id)` and depends on:
    - `has_websearch` (BOOLEAN NOT NULL DEFAULT false)
    - `websearch_result_count` (INT NOT NULL DEFAULT 0)
    - Attachment counts resolved from `chat_attachments` for the user message
  - Nulls in these fields will break insert before triggers run; defaults exist but only apply when the keys are omitted or explicit non-null values are provided.

## chat_messages field parity: what sync currently misses

Schema columns vs sync mapping (`src/app/api/chat/sync/route.ts`):

- id, session_id, role, content: Mapped.
- model: Mapped.
- total_tokens, input_tokens, output_tokens: Mapped via `|| 0`.
- user_message_id: Mapped (`|| null`).
- content_type: Mapped with fallback `'text'` (must be `'text' | 'markdown'`).
- elapsed_ms, completion_id: Mapped (`|| 0`/`|| null`).
- message_timestamp: Mapped from `Date`/string.
- error_message: Mapped as `'Message failed'` when `message.error` is true (OK; nullable).
- is_streaming: Mapped from `was_streaming` (OK).
- metadata JSONB: NOT mapped (defaults to `{}`) — OK but consider parity with messages route.
- reasoning, reasoning_details: Mapped (nullable JSON/text) — OK.
- has_attachments, attachment_count: NOT mapped (schema requires NOT NULL with defaults). Omitting is fine; consider deriving from `attachment_ids` if present for better fidelity.
- has_websearch, websearch_result_count: Currently mapped as `?? null` — BUG. Columns are NOT NULL with defaults; sending null violates constraints.

Additional considerations:

- content_type must be sanitized to allowed enum values; any unexpected value should coerce to `'text'` to avoid CHECK violations.
- For failed user messages, set token fields to 0 (already defaulting) to keep stats consistent.
- For assistant messages, `user_message_id` should be present when available to enable cost recompute and attachment-based pricing.

## Implementation plan to fix sync issues (no code yet)

1. Fix NOT NULL violations for web search fields in sync route

- Replace `has_websearch: message.has_websearch ?? null` with:
  - `has_websearch`: `message.role === 'assistant' ? Boolean(message.has_websearch) : false`
- Replace `websearch_result_count: message.websearch_result_count ?? null` with:
  - `websearch_result_count`: `message.role === 'assistant' && typeof message.websearch_result_count === 'number' ? message.websearch_result_count : 0`
- Alternative acceptable approach: omit these keys entirely when undefined to let DB defaults apply on INSERT. Never send `null`.

2. Align sync mapping to messages route for parity and safety

- metadata: include upstream error metadata like the messages route does, e.g. `metadata` JSONB with `upstream_error_code`, `upstream_error_message`, `upstream_retry_after`, `upstream_suggestions` when present in `ChatMessage`.
- content_type: guard to `'text' | 'markdown'` only; fallback `'text'` if anything else.
- tokens: coalesce `total_tokens/input_tokens/output_tokens` to 0 for all messages; keep zeros for failures.

3. Attachment flags (optional, safe)

- If `attachment_ids` is present on the message:
  - `has_attachments = attachment_ids.length > 0`
  - `attachment_count = Math.min(attachment_ids.length, 3)`
- Do not attempt to link `chat_attachments` during sync for anonymous sessions (files won’t exist in Supabase yet). Leave linkage to the normal upload/link flow post-login. This ensures flags reflect intent but won’t break cost recompute (image units are derived by counting actual linked attachments, which may be zero).

4. Session aggregates consistency

- Rely on the existing `on_message_change` trigger (`update_session_stats`) to recompute aggregates after successful message inserts.
- Remove or de-emphasize client-provided session aggregates in the sync session upsert (or accept them as temporary and allow triggers to overwrite). Add logs noting the server recomputation occurs after message insert.

5. Tests and verification

- Unit tests for sync route:
  - Ensure upsert payload never contains `has_websearch: null` or `websearch_result_count: null`.
  - Validate `content_type` sanitization and defaulting.
  - Validate `metadata` parity with messages route.
- Integration/manual per `.github/tasks.md`:
  - After sign-in, POST `/api/chat/sync` produces no 23502; GET `/api/chat/sync` returns all messages; session aggregates updated (last message timestamp/model reflect latest successful assistant message). Error messages are excluded from aggregates as per trigger.

6. Acceptance criteria (sync path)

- Sync does not error when messages omit web search fields; defaults applied.
- All messages, including streaming and non-streaming, persist with correct `is_streaming`.
- Session aggregates reflect inserted messages (trigger-driven), not stale client values.
- No CHECK/NOT NULL violations for `content_type`, `has_websearch`, `websearch_result_count`, `has_attachments`, `attachment_count`.

7. Rollout

- No DB migrations required.
- Low risk: mapping-only change in `/api/chat/sync` and optional parity additions.
- Add temporary structured logging for per-conversation message counts and a snippet of the first/last message timestamps to validate trigger recomputation in staging.

## Parity commitment with /api/chat/messages

Using the sample payload in `.github/tasks.md` as the contract, the sync route will map and persist all of the following fields for both user and assistant messages, with safe defaults where necessary, so anonymous → signed-in migrations behave identically to direct `/api/chat/messages` persistence:

- has_attachments, attachment_count
- has_websearch, websearch_result_count
- reasoning, reasoning_details
- is_streaming
- metadata
- content_type

This ensures that if/when these features are enabled for anonymous sessions in the future, the sync path will already handle them correctly without additional changes.

## Implementation tasks (checklist)

Phases are small and sequential. Each sub-task includes a brief verification step.

- [ ] Server: fix NOT NULL websearch fields in /api/chat/sync

  - Change mapping to never send nulls:
    - has_websearch = message.role === 'assistant' ? Boolean(message.has_websearch) : false
    - websearch_result_count = message.role === 'assistant' && typeof message.websearch_result_count === 'number' ? message.websearch_result_count : 0
  - Verification: Add temporary log when payload contains undefined/null websearch fields and ensure final upsert body shows false/0 (or keys omitted). Run one sync; confirm no 23502 in logs.

- [ ] Server: sanitize content_type in /api/chat/sync

  - Map contentType → content_type with allowed values only ('markdown' | 'text'); fallback to 'text' for anything else.
  - Verification: Create a message with unexpected contentType; sync should insert with content_type='text' and no CHECK violation.

- [ ] Server: tokens and timings coalesce in /api/chat/sync

  - Ensure total_tokens/input_tokens/output_tokens default to 0; elapsed_ms default 0; completion_id nullable.
  - Verification: Sync a conversation where some fields are missing; insert succeeds and triggers recompute session totals.

- [ ] Server: attachment flags in /api/chat/sync (safe parity)

  - If attachment_ids is present, set has_attachments and clamp attachment_count to [0..3]. Do not link files during sync.
  - Verification: Sync one user message with attachment_ids length 1; DB row has has_attachments=true, attachment_count=1.

- [ ] Server: metadata parity in /api/chat/sync

  - Persist requested_web_search, requested_web_max_results, requested_reasoning_effort and any upstream error hints into metadata JSONB.
  - Verification: Sync payload including these fields; select chat_messages.metadata to confirm presence and shape.

- [ ] Server: annotations parity in /api/chat/sync

  - For assistant messages with annotations, delete existing then bulk insert into chat_message_annotations.
  - Verification: Sync sample that includes annotations (see .github/tasks.md sample); rows appear with correct indices and URLs.

- [ ] Client: confirm anonymous gating (no changes expected)

  - Ensure /api/chat/messages is never called when not authenticated in streaming and non-streaming paths.
  - Verification: Repeat steps 2–7 in .github/tasks.md; DevTools shows no /api/chat/messages network calls.

- [ ] Tests: unit tests for /api/chat/sync mapping

  - Assert payload never includes null for NOT NULL fields (has_websearch, websearch_result_count, has_attachments, attachment_count, content_type).
  - Assert was_streaming → is_streaming mapping for both roles.
  - Verification: npm test passes new cases; snapshot payloads as needed.

- [ ] Build and typecheck

  - Run production build; ensure no type or lint errors.
  - Verification: Build completes successfully.

- [ ] Manual QA (per .github/tasks.md)

  - Run full scenario including anonymous → sign-in → sync; ensure messages persist and session aggregates reflect all pairs.
  - Verification: No DB errors; GET /api/chat/sync shows all messages; message*count/last*\* accurate.

- [ ] Optional hardening (nice-to-have)
  - Compute session aggregates on the server from the messages array during sync; at minimum, clamp incoming session fields to sane defaults and rely on triggers to finalize stats.
  - Verification: Log server-computed counts vs. trigger results for one conversation; numbers align.
