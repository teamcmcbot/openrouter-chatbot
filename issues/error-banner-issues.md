# Error banner behavior - Root Cause Analysis

This document traces the exact state flow that leads to the two observed behaviors:

- A: In Conversation 1, clicking "Try again" re-sends the failed message with streaming disabled (even though the original was streaming-enabled).
- B: After that retry, the error banner in Conversation 2 disappears.

The analysis is based strictly on current code; no assumptions.

---

## Scope and reproduction (from task)

- Conversation 1: user sends message with streaming enabled via `/api/chat/stream` -> error -> banner shown (expected).
- Conversation 2: user sends message with streaming disabled via `/api/chat` -> error -> banner shown (expected).
- Navigate back to Conversation 1 and click "Try again".
  - Expected: retry uses streaming, same as original.
  - Actual: retry goes to non-streaming.
- Navigate to Conversation 2.
  - Expected: its banner is still there.
  - Actual: its banner has disappeared.

---

## What the banner is and where it lives

- State shape: `conversationErrorBanners: Record<string, { messageId: string; message: string; code?: string; retryAfter?: number; createdAt: string }>`
  - Defined and managed in `stores/useChatStore.ts`.
- Banner creation on failures:
  - Non-streaming send failure: `useChatStore.sendMessage(...)` sets the error on the user message and calls `setConversationErrorBanner(currentConvId, {...})`.
  - Streaming send failure: `useChatStreaming.sendMessage(...)` does the same via `useChatStore.getState().setConversationErrorBanner(conversationId, {...})`.
- Banner rendering is per conversation (not global):
  - `components/chat/ChatInterface.tsx` reads `conversationErrorBanners[currentConversationId]` and renders `ErrorDisplay` only for the active conversation.
  - The banner is linked to the specific failed user message via `banner.messageId` and `lastFailedUserMessage` lookup.
- Banner dismissal on new sends is scoped to the active conversation only:
  - `ChatInterface.tsx` MessageInput `onSendMessage`:
    - If `currentConversationId` is set, calls `clearConversationErrorBanner(currentConversationId)` before sending.

Conclusion: by design, banners are session-only and per-conversation.

---

## Exact retry flow and why streaming is lost

Retry is initiated from the banner’s "Try again" button in `ChatInterface.tsx`:

1. `handleRetry`

   - Dismisses the banner for the active conversation only: `clearConversationErrorBanner(currentConversationId)`.
   - Calls `retryLastMessage()` from `useChatStreaming`.

2. `useChatStreaming.retryLastMessage()`

   - Locates the most recent failed user message (`msg.role === 'user' && msg.error`).
   - Determines if the original attempt used streaming via `lastFailedMessage.was_streaming === true`.
   - If true, it calls `retryMessageStreaming(...)`; otherwise, it calls the non-streaming store retry `useChatStore.getState().retryMessage(...)`.

3. Inside `useChatStreaming.retryMessageStreaming(...)` the path still depends on the current global streaming setting:
   - The function gates on `streamingEnabled = useSettingsStore().getSetting('streamingEnabled', false)`.
   - Code structure (paraphrased):
     - `if (streamingEnabled) { /* stream via POST /api/chat/stream */ } else { /* delegate to store.retryMessage -> POST /api/chat */ }`

Therefore, even when `lastFailedMessage.was_streaming === true`, a currently disabled global streaming setting will force the retry down the non-streaming path. This exactly explains:

- Behavior A (Actual): "Try again" re-sends with streaming disabled if the user turned off streaming later (e.g., when sending in Conversation 2). The code uses the original flag to choose which helper to call, but that helper still defers to the current global `streamingEnabled` flag and falls back to non-streaming.

References:

- `hooks/useChatStreaming.ts`
  - `retryLastMessage` determines `shouldUseStreaming` from `was_streaming`.
  - `retryMessageStreaming` contains the `if (streamingEnabled) { ... } else { await store.retryMessage(...) }` gate.

---

## Why the other conversation’s banner disappears

When the retry falls back to the non-streaming path, it calls `useChatStore.retryMessage(...)`. At the start of this function, the store performs a global clear of ALL banners:

- In `stores/useChatStore.ts`, within `retryMessage` immediately after setting loading:
  - `set({ isLoading: true, error: null, conversationErrorBanners: {} });`

This resets `conversationErrorBanners` to an empty object, which removes banners for every conversation, not just the active one. That directly explains:

- Behavior B (Actual): After retrying in Conversation 1, the banner in Conversation 2 disappears.

This global clear appears to have been intended for a different lifecycle (a comment mentions clearing when "loading server conversations on sign-in"), but in practice it runs on every non-streaming retry.

References:

- `stores/useChatStore.ts` -> function `retryMessage` -> assignment `conversationErrorBanners: {}` at loading time.

---

## End-to-end sequence mapping to the reported scenario

1. Conv1 sends with streaming enabled -> failure:
   - User message gets `error: true`, `was_streaming: true`.
   - `setConversationErrorBanner(conv1, { messageId, ... })`.
2. Conv2 sends with streaming disabled -> failure:
   - User message gets `error: true`, `was_streaming: false`.
   - `setConversationErrorBanner(conv2, { messageId, ... })`.
3. Navigate back to Conv1 and click "Try again":
   - `ChatInterface.handleRetry` clears only `conv1` banner.
   - `useChatStreaming.retryLastMessage` sees `was_streaming === true` and calls `retryMessageStreaming`.
   - `retryMessageStreaming` checks global `streamingEnabled` (now false) and therefore delegates to non-streaming `useChatStore.retryMessage`.
   - `useChatStore.retryMessage` immediately does `set({ ..., conversationErrorBanners: {} })` -> clears all banners, including Conv2’s.
   - Non-streaming request is sent to `/api/chat` (not `/api/chat/stream`).
4. Navigate to Conv2 -> banner is gone due to the global clear in step 3.

This sequence matches both observed "Actual" behaviors.

---

## Verdict on the user’s theory

- "The error banner is global and can be dismissed by any new message sent."
  - Not exactly. New message sends call `clearConversationErrorBanner(currentConversationId)` and only affect the active conversation. However, a non-streaming retry currently clears banners globally via `retryMessage`.
- "When clicking try again, it either did not track streaming mode or it used the current mode in MessageInput (streaming disabled)."
  - The code does track the original attempt via `was_streaming`. But the streaming retry helper still respects the current global `streamingEnabled` and will fall back to non-streaming if it’s off. In effect, the current setting overrides the original mode on retry.

---

## Evidence pointers (files/functions)

- Banner state and APIs (per-conversation, session-only)
  - `stores/useChatStore.ts` -> `conversationErrorBanners`, `setConversationErrorBanner`, `clearConversationErrorBanner`.
  - `components/chat/ChatInterface.tsx` -> reads `conversationErrorBanners[currentConversationId]` and shows `ErrorDisplay`.
- Streaming vs non-streaming send paths
  - Streaming send and error banner: `hooks/useChatStreaming.ts` -> `sendMessage` (stream path), sets banner on failure.
  - Non-streaming send and error banner: `stores/useChatStore.ts` -> `sendMessage`, sets banner on failure.
- Retry logic
  - User action: `components/chat/ChatInterface.tsx` -> `handleRetry` -> `retryLastMessage()`.
  - Mode selection: `hooks/useChatStreaming.ts` -> `retryLastMessage` (checks `was_streaming`).
  - Streaming retry gate: `hooks/useChatStreaming.ts` -> `retryMessageStreaming` (falls back to store retry if `streamingEnabled` is false).
  - Global banner clear on non-streaming retry: `stores/useChatStore.ts` -> `retryMessage` -> `set({ ..., conversationErrorBanners: {} })`.

---

## Consequences (current code)

- Retrying a previously streaming message while streaming is currently disabled causes:
  - The retry to use the non-streaming `/api/chat` endpoint.
  - All error banners in other conversations to disappear.

No code changes were made for this analysis.

---

## Proposed fix (high level)

1. Always retry in the original mode (streaming vs non‑streaming) regardless of the current UI toggle.

   - When `lastFailedMessage.was_streaming === true`, route the retry directly to the streaming path (`POST /api/chat/stream`) without checking `streamingEnabled`.
   - When `was_streaming !== true`, keep current non‑streaming retry (`POST /api/chat`).

2. Preserve the original request options for retries.

   - Persist the relevant options on the user message at send time (both streaming and non‑streaming):
     - attachments: already present (`attachment_ids` / `has_attachments`).
     - web search on/off and max results (new per‑user‑message fields).
     - reasoning effort (new per‑user‑message field; do not overload assistant `reasoning`).
   - On retry, reconstruct `options` purely from the failed user message (not current UI state).

3. Stop clearing banners globally on non‑streaming retry.

   - Replace `set({ ..., conversationErrorBanners: {} })` in `useChatStore.retryMessage` with a scoped clear of the active conversation only, or no clear (since `ChatInterface` and retry flows already clear the active banner explicitly).

4. Keep banner lifecycle per conversation.
   - Continue to set the banner on failure for the active conversation only.
   - Dismiss only the active conversation’s banner on new sends and on successful retry.

---

## Clarifying questions (please confirm before implementation)

1. Should retry also preserve “web search max results” and “reasoning effort” exactly as originally sent, even if the UI toggle has since changed?
   -> Yes, the retry should preserve these values exactly as they were originally sent including stream mode, reasoning, web search, and max results and any image attachments
2. Is it acceptable to extend `ChatMessage` with request‑side metadata (e.g., `requested_web_search`, `requested_web_max_results`, `requested_reasoning_effort`), stored only on user messages?
   -> Yes, this metadata can be stored on user messages to facilitate accurate retries.

3. For non‑streaming retry, do we want to clear the active conversation’s banner automatically at retry start (current behavior) or only after a successful retry?
   -> Streaming or non-streaming retry will both clear the `ERROR BANNER` if that is what you are asking, otherwise please clarify.

4. If a user manually dismisses a banner and then retries, should we still proceed with retry (yes today), or should retry be disabled once dismissed?
   -> Once the banner is dismissed, it is dismissed with no more ways to retry that message.
5. Any analytics/audit you’d like when retries cross mode boundaries (e.g., warn if a retry would have switched modes)?
   -> No.

---

## Implementation plan

Phases with checklists, verification steps, and minimal surface changes.

### Phase 1 – Data model and plumbing (request options on user messages)

- [x] Add request‑side fields to `ChatMessage` (user messages only):
  - `requested_web_search?: boolean`
  - `requested_web_max_results?: number`
  - `requested_reasoning_effort?: 'low' | 'medium' | 'high'`
- [x] Populate these fields when creating the user message in both paths:
  - `stores/useChatStore.ts` → `sendMessage`
  - `hooks/useChatStreaming.ts` → `sendMessage`
- [x] Ensure persistence logic (`/api/chat/messages`) tolerates the new optional fields (no server dependency for retries; we only need client state).
- [x] Do not modify assistant messages; keep existing metadata unchanged.

User verification for Phase 1

- [x] Start the app, send messages with various combinations:
  - With/without web search, different max results, different reasoning effort.
  - Confirm in Redux/Zustand DevTools (or console logs) that the created user message carries the new fields with the expected values.

### Phase 2 – Retry routing and option restoration

- [x] Force streaming retry to honor original `was_streaming` regardless of the current `streamingEnabled` setting:
  - `hooks/useChatStreaming.ts` → in `retryLastMessage` and `retryMessageStreaming` paths, remove the fallback to store retry when `was_streaming === true`.
  - Introduce a `forceStreaming` branch (ignore `streamingEnabled`) when retrying a streaming‑originated failure.
- [x] For non‑streaming retry (`useChatStore.retryLastMessage` → `retryMessage`), extend the call surface to accept `options` (attachments, web search, max results, reasoning effort) and plumb these into the request body.
- [x] In both retry paths, reconstruct `options` exclusively from the failed user message:
  - attachments: from `attachment_ids` (if any).
  - web search: from `requested_web_search`.
  - max results: from `requested_web_max_results`.
  - reasoning: from `requested_reasoning_effort`.

User verification for Phase 2

- [x] Reproduce the scenario: Conv1 (streaming on) failure, Conv2 (streaming off) failure.
- [x] Return to Conv1 and click Retry.
  - Expectation: request goes to `/api/chat/stream` and streams; does not honor the now‑off global toggle.
- [x] Confirm via Network tab and console logs that the options match the original message (attachments, search, reasoning effort), not current UI.

### Phase 3 – Banner scope fix (no global clears)

- [x] Edit `stores/useChatStore.ts` → `retryMessage`: remove `conversationErrorBanners: {}` from the loading `set(...)` call.
- [x] If any banner clear is still needed at retry start, clear only the active conversation’s banner using `clearConversationErrorBanner(currentConversationId)` (but current `ChatInterface` already does this before sending; duplication is optional and should not be global).
- [x] Ensure success path clears banner only for the active conversation; failure path sets it (unchanged).

User verification for Phase 3

- [x] Reproduce the two‑conversation scenario again.
- [x] After retrying in Conv1, navigate to Conv2.
  - Expectation: Conv2’s banner remains visible.
- [x] Send a new message in Conv2.
  - Expectation: Only Conv2’s banner is dismissed (Conv1 unaffected).

### Phase 4 – Tests and guards

- [x] Add unit tests around banner scope and retry routing:
  - Retry streaming despite `streamingEnabled=false` when `was_streaming=true`.
  - Non‑streaming retry does not clear global banners.
  - Options restoration reads from user message fields (attachments/search/max/reasoning).
- [x] Add an integration test (React Testing Library) to simulate two conversations and validate banners remain scoped.
- [x] Follow project testing standards (Next.js navigation mocks, auth store mocks, toast mocks, etc.).

Additional hardening (Phase 4.1)

- [x] Streaming parser: add marker-aware buffer flush to avoid leaking partial `__REASONING_CHUNK__` or `__ANNOTATIONS_CHUNK__` lines into content. Applied to normal and retry paths in `hooks/useChatStreaming.ts`.

User verification for Phase 4

- [x] `npm run build` passes (typecheck/lint).
- [x] `npm test` green; provide a short summary of the added tests and their assertions in PR.

### Phase 5 – Docs and rollout

- [x] Update docs:
  - `docs/components/chat/error-banner-session-behavior.md` clarifies retry source of truth and banner scope.
  - `docs/error-retry-flow-update.md` includes “retry honors original streaming mode and original options” and parser hardening notes.
- [x] Add a short migration note for developers about the new `ChatMessage` request fields.

Optional follow-ups

- [x] Add a runtime toggle (e.g., `NEXT_PUBLIC_DEBUG_STREAMING` or localStorage flag) to promote stream logs for easier field debugging in production. Implemented via `lib/utils/streamDebug.ts` and documented in `docs/components/chat/error-banner-session-behavior.md`.

User verification for Phase 5

- [x] Review docs diffs and confirm wording matches expected behavior.

---

## Risk assessment and mitigations

- Risk: Extending `ChatMessage` may affect persistence or server mappers.
  - Mitigation: Keep new fields optional; server endpoints that upsert messages should ignore unknown fields; avoid relying on server for retries.
- Risk: Forcing streaming on retry might surprise users who toggled streaming off intentionally.
  - Mitigation: Show a subtle hint in banner tooltip or console log: “Retrying in original streaming mode.” Optionally add a future toggle to “retry using current settings”.
- Risk: Duplicate banner clears if both UI and store clear.
  - Mitigation: Make store not clear banners globally; rely on UI per‑conversation clear.

---

## Rollback plan

- All changes are confined to client hooks/stores and type additions. If regressions arise:
  - Revert the force‑streaming path to respect `streamingEnabled` (toggle‑based behavior).
  - Revert `ChatMessage` extensions and stop reconstructing options on retry.
  - Keep the banner scope fix (no global clears) as it is low‑risk and correct.

---

## Acceptance criteria

- Retry always uses the mode of the original attempt.
- Retry replays attachments, web search on/off, max results, and reasoning effort from the original attempt.
- Retrying in one conversation never clears banners in other conversations.
- Build and tests pass; new tests cover routing, options restoration, and banner scope.

---

## Completion summary (2025-08-30)

- Phases 1–4 completed. Streaming parser hardened with marker-aware buffer flush in normal and retry paths.
- Build and tests green (60 suites, 283 tests).
- Docs added/updated:
  - `docs/components/chat/error-banner-session-behavior.md`
  - `docs/error-retry-flow-update.md` (extended with hardening and migration notes)
- Pending optional follow-up: add a runtime debug toggle for promoting streaming logs.

User verification: Completed. Documentation updates reviewed and approved.
