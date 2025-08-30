# Error Banner Behavior (Session-Scoped)

This document explains how error banners behave in the chat UI and how retries interact with them.

## Scope and storage

- Error banners are session-only and per-conversation.
- State shape: `conversationErrorBanners: Record<string, { messageId: string; message: string; code?: string; retryAfter?: number; createdAt: string }>`.
- Lives in the client store (`stores/useChatStore.ts`) and is NOT persisted.

## When banners appear

- Non-streaming send error: `useChatStore.sendMessage` marks the user message as failed and sets the banner for the current conversation.
- Streaming send error: `hooks/useChatStreaming.sendMessage` marks the user message as failed and sets the banner similarly.

## When banners are cleared

- Sending a new message in a conversation: the UI clears only that conversation's banner before sending.
- Clicking "Try again": the retry action first clears the active conversation's banner; it does not touch other conversations.
- Manual dismissal: clicking close on the banner clears it for that conversation and disables retry for that specific failed message.

## Retry semantics

- Retries always use the original mode of the failed user message:
  - If the failed message was streaming, the retry streams via `/api/chat/stream`.
  - If it was non-streaming, the retry uses `/api/chat`.
- Retries preserve the original request options from the failed message:
  - Attachments, web search toggle, web search max results.
  - Reasoning effort (low/medium/high).

## Manual dismissal disables retry

- When the banner is manually dismissed, `retry_available` is flipped to `false` on the failed user message.
- The retry button becomes a no-op for that message; network requests are not issued.
- Covered by unit test: `tests/stores/chatStore-manual-dismissal-disables-retry.test.ts`.

## Streaming parser behavior (retries and normal)

- Marker-aware parsing prevents reasoning or annotation markers from appearing in visible content.
- Guards added for buffer flush so partial `__REASONING_CHUNK__` / `__ANNOTATIONS_CHUNK__` lines don't leak.
- File: `hooks/useChatStreaming.ts` (normal and retry paths).

## Developer notes

- Debug logs are gated by `STORE_CONFIG.DEVTOOLS_ENABLED` and may not appear unless devtools logging is enabled.
- Streaming runtime debug toggle is available for field diagnostics:
  - Env: set `NEXT_PUBLIC_DEBUG_STREAMING=1` before starting the app.
  - Runtime: in browser console, run `localStorage.setItem('DEBUG_STREAMING', '1')` and refresh.
  - When enabled, you will see `[STREAM-DEBUG]` console lines alongside existing `[STREAM-NORMAL]`/`[STREAM-RETRY]` logger entries.

## Error banner (session-only, per-conversation)

This document describes how the chat error banner works after the August 2025 update.

### Scope and lifecycle

- Session-only: Error banners are not persisted. They exist only in the current browser tab/session.
- Per-conversation: At most one banner is tracked per conversation, keyed by `conversationId`.
- Creation: Set when a local send or retry failure happens in that conversation.
- Dismissal: Cleared when the user dismisses it, or when they send a new message, or when a retry succeeds (in that conversation).
- Auth boundary: Sign-out/in (which reloads conversations) shows no banners for historical failures.

### State shape and APIs

- Store field: `conversationErrorBanners: Record<string, { messageId: string; message: string; code?: string; retryAfter?: number; createdAt: string } | undefined>`
- Store actions:
  - `setConversationErrorBanner(conversationId, banner)`
  - `clearConversationErrorBanner(conversationId)`
  - `clearAllConversationErrorBanners()`

### Rendering and CTA rules

- `ChatInterface` renders a banner only when the active conversation has an entry in `conversationErrorBanners`.
- The banner text prefers the ephemeral `banner.message`; it falls back to the failed user message’s `error_message`.
- Retry button visibility is derived from the failed user message:
  - Hidden for non-retryable codes (e.g., `bad_request`, `forbidden`, `unauthorized`, `token_limit_exceeded`, `tier_upgrade_required`, etc.).
  - Hidden when the message has `retry_available === false`.
  - Otherwise shown.

### Streaming parity

- Streaming and non-streaming both set the banner on failure and clear it on retry/success, reusing the same failed user message bubble on retry.

### Authentication transitions

- `loadUserConversations` is invoked on sign-in/out. Since banners aren’t persisted, no banners appear for historical failures after auth transitions.

### Manual QA checklist

- Trigger a failure in Conversation A → banner appears. Navigate to B (no banner), back to A (banner still visible in-session).
- Click Retry in A and succeed → banner disappears in A only.
- Send a new message in A → banner disappears in A only.
- Dismiss banner manually → message.error stays untouched; only the banner disappears.
- Sign out → sign in → previously failed messages do not show banners; Retry CTA still respects message fields.

### Troubleshooting streaming logs

- If you don’t see `[STREAM-DEBUG]` logs:
  - Ensure `NEXT_PUBLIC_DEBUG_STREAMING=1` or `localStorage.DEBUG_STREAMING = '1'`.
  - Confirm the request actually uses the streaming path (`/api/chat/stream`).
  - Some logs are behind the store logger; enable devtools if deeper logs are needed.
