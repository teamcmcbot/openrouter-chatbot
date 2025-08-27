## Error/Try Again Flow Update (2025-08-27)

This update refines the chat error and retry experience to be session-scoped, predictable, and safe across streaming and non‑streaming paths.

### What changed

- Session-only, per-conversation error banner. Banner visibility no longer derives from persisted message state; it’s driven by an ephemeral store keyed by `conversationId` and set only for local failures.
- `retry_available` is still stored on messages to drive CTA eligibility, but it does not control banner visibility for historical data.
- Correct endpoint routing. “Try again” automatically routes to the same mode as the original attempt:
  - Streaming → `POST /api/chat/stream`
  - Non‑streaming → `POST /api/chat`
- Better metadata. The actual model used by the backend is propagated back to the client and attached to the assistant message.

### Why

- Prevents banners from appearing for old failures after sign‑out/sign‑in or page reloads.
- Maintains truthful message history while keeping banners purely UI/session state.

### Implementation notes

- Frontend sets `retry_available: true` on a new failure and clears it on successful retry; non‑retryable codes disable the CTA.
- Ephemeral banner state is stored in `conversationErrorBanners` and cleared on manual dismiss, send, successful retry, or sign‑in/out reload.
- Server GET mappers may include `retry_available: false` on prior-session failures; this controls CTA visibility only, not banners.

### Developer references

- `components/chat/ChatInterface.tsx` – renders from the ephemeral `conversationErrorBanners` map; CTA derived from the last failed user message.
- `hooks/useChatStreaming.ts` and `stores/useChatStore.ts` – set/clear ephemeral banner and `retry_available`, route retries by original mode, and clear error flags on success.
- API mappers: `src/app/api/chat/messages/route.ts` and `src/app/api/chat/sync/route.ts` – may set `retry_available: false` for persisted failed user messages (affects CTA only).
