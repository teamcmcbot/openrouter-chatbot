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

---

## Additional hardening (2025-08-30)

### Streaming parser guard

- Implemented marker-aware buffer flush in `hooks/useChatStreaming.ts` for both normal and retry streams.
- Prevents partial `__REASONING_CHUNK__` / `__ANNOTATIONS_CHUNK__` lines from being appended to visible content when a chunk boundary splits a marker line.
- If the buffer starts with a known marker and is incomplete, we keep it for the next chunk; if a complete marker payload is present, we parse and accumulate reasoning/annotations; otherwise we append only non-marker content.

### Manual dismissal disables retry

- When users manually close the banner, the store flips `retry_available` to `false` on the failed user message.
- The retry entry point becomes a no-op for that message (covered by unit tests).

### Migration notes (client-only metadata)

The `ChatMessage` type on user messages carries request-side metadata so retries faithfully replay the original request:

- `was_streaming?: boolean`
- `requested_web_search?: boolean`
- `requested_web_max_results?: number`
- `requested_reasoning_effort?: 'low' | 'medium' | 'high'`

These fields are optional and intended for client use only. Server endpoints ignore them safely.

### Validation

- Build passes (types/lint).
- All tests green, including:
  - Retry mode preservation and banner scope.
  - Manual dismissal disables retry and avoids network calls.
  - Streaming route newline handling and annotations parsing.
