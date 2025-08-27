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
