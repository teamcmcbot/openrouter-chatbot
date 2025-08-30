## Chat history pagination and lazy loading

This document describes the architecture for loading chat histories efficiently:

- Seek-based pagination on GET `/api/chat/sync` to fetch conversation summaries in pages.
- Lazy message loading on selection via GET `/api/chat/messages` to fetch the full message list only when needed.
- Strong authentication and tiered rate limiting enforced by middleware.

### Goals

- Keep the sidebar fast by fetching summaries only (titles and stats) with minimal payloads by default.
- Support scrolling back through older conversations with hasMore/nextCursor.
- Load messages on-demand when a conversation is selected.

### High-level flow

1. Sidebar requests GET `/api/chat/sync?summary_only=true` with default `limit=20` and seek cursor params.
2. The response includes conversation summaries and `meta`:
   - `hasMore` and `nextCursor { ts, id }` for further pagination.
3. On selection, the client calls GET `/api/chat/messages?session_id=...` to fetch the full message list for that conversation.
4. Messages include attachments, annotations, search metadata, reasoning, tokens, and request options.

### Pagination details

- Ordering: sessions are ordered by `last_message_timestamp DESC, id DESC`.
- Cursor: `{ cursor_ts, cursor_id }` marks the last row of the previous page.
- Direction: `before` only (load older pages).
- Page size: default 20; capped at 20.
- Probing: query retrieves `limit + 1` rows to detect `hasMore`.

### Endpoint roles and protection

- GET `/api/chat/sync`: protected via `withConversationOwnership` + tiered rate limiting tierC.
- POST `/api/chat/sync`: same protection; upserts sessions/messages and annotations.
- GET `/api/chat/messages`: protected via `withProtectedAuth` + tierC.
- POST `/api/chat/messages`: same protection; persists messages, updates session stats, links attachments and annotations.

### Rate limiting tiers (summary)

- Tiered limits are applied via `withTieredRateLimit`:
  - Tier A (Chat): most restrictive
  - Tier B (Storage): medium
  - Tier C (CRUD): most generous (used for these endpoints)
  - Tier D (Admin): testing access

See `docs/architecture/redis-rate-limiting.md` for details.

### Data model highlights

- `chat_sessions`: per-conversation rollups (message*count, total_tokens, last*\* fields, timestamps).
- `chat_messages`: individual messages (role, content, models, tokens, reasoning, websearch fields, metadata, is_streaming).
- `chat_attachments`: image uploads linked to messages when ready.
- `chat_message_annotations`: URL citations linked to assistant messages.

### Tradeoffs

- Summary-only mode keeps the sidebar snappy and reduces bandwidth.
- Lazy loading introduces a small delay on initial conversation opening, mitigated by caching in the store.
- `with_total=true` enables counts but increases DB cost; the UI doesn’t rely on it.
