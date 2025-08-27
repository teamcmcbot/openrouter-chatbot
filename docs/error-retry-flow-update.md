## Error/Try Again Flow Update (2025-08-27)

This update refines the chat error and retry experience to be session-scoped, predictable, and safe across streaming and non‑streaming paths.

### What changed

- Per-conversation banner. The error banner is derived from the last failed user message in the current conversation only.
- Session-scoped retries via `retry_available` flag on `ChatMessage`:
  - `true` for failures that occur in the current browser session (locally set on failure).
  - `false` for previously persisted failed user messages when they are loaded from the server (set during API mapping).
  - cleared/undefined when a retry succeeds.
- Banner visibility. The global “Error — Try again” banner shows only when the last failed user message has `retry_available !== false`.
- Correct endpoint routing. “Try again” automatically routes to the same mode as the original attempt:
  - Streaming → `POST /api/chat/stream`
  - Non‑streaming → `POST /api/chat`
- Better metadata. The actual model used by the backend is propagated back to the client and attached to the assistant message.

### Why

- Prevents “Try again” from appearing for old failures after sign‑out/sign‑in or page reloads.
- Keeps UI logic simple and explicit with a single `retry_available` switch.

### Implementation notes

- Frontend sets `retry_available: true` on a new failure and clears it on successful retry.
- Server GET mappers (sync/messages) mark failed user messages from the database with `retry_available: false` so the UI won’t offer retry for prior-session failures.
- The banner is dismissed while retrying and restored only if another error occurs.

### Developer references

- `components/chat/ChatInterface.tsx` – picks the last failed user message and shows the banner only when `retry_available !== false`.
- `hooks/useChatStreaming.ts` and `stores/useChatStore.ts` – set/clear `retry_available`, route retries by original mode, and clear error flags on success.
- API mappers: `src/app/api/chat/messages/route.ts` and `src/app/api/chat/sync/route.ts` – set `retry_available: false` for persisted failed user messages.
