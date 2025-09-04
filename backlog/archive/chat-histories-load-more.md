# Chat histories: Load more (final plan)

This document proposes backend pagination for conversations and a frontend “Load more” flow in ChatSidebar.

## Goals

- Show initial 20 most-recent conversations.
- If more exist, show a "Load more…" affordance at the end of the list.
- On click (or on scroll sentinel), fetch the next 20, append to the list, and continue until exhausted.
- Return a lightweight payload for the sidebar (avoid fetching all messages per session if not needed).

## Current behavior (verified)

- GET /api/chat/sync
  - Queries Supabase for the user’s chat_sessions ordered by last_message_timestamp desc with limit(20).
  - Eager-loads chat_messages (\*) for each session.
  - Returns conversations array with messages, messageCount, totalTokens, lastMessagePreview, lastMessageTimestamp, etc.
  - Does NOT include last_activity in the response.
- ChatSidebar renders getRecentConversations(20) from store; store.loadUserConversations() calls GET /api/chat/sync (which already limits to 20 in DB).

Conclusion: The 20-item cap comes from the DB query, and ChatSidebar also slices locally.

## Proposed approach

We add cursor pagination to list older conversations, plus metadata to tell the UI whether more exist. We keep backward compatibility by making the new features opt-in via query params. This plan adopts Option A only.

### Paginate sessions on GET /api/chat/sync

- New query params:
  - limit: number (default 20, max 50)
  - cursor_ts: ISO string of last_message_timestamp from the last item on the previous page
  - cursor_id: string id used as tiebreaker when timestamps equal
  - direction: 'before' | 'after' (default 'before' for loading older)
  - summary_only: boolean (default false). When true, return sessions without nested chat_messages to reduce payload.
  - with_total: boolean (default false). When true, include totalCount (exact) for the user’s sessions. Default is OFF; UI will not rely on totalCount.
- Query logic (seek pagination, stable ordering):
  - ORDER BY last_message_timestamp DESC, id DESC (secondary key for determinism)
  - If cursor provided: WHERE (last_message_timestamp, id) < (cursor_ts, cursor_id) when direction='before'
  - LIMIT = limit (+1 probe row to detect hasMore without a COUNT)
- Response additions:
  - meta: { hasMore: boolean, nextCursor: { ts: string, id: string } | null, pageSize: number, totalCount?: number }
  - conversations: array as today; when summary_only=true, omit messages[] and rely on lastMessagePreview, messageCount.
- Auth and rate-limiting:
  - Keep protected auth: prefer withProtectedAuth for listing; continue Tier C rate limit.

Pros: Minimal changes for the consumer; can gradually switch ChatSidebar to summary_only payload.

## Frontend changes

- Store (useChatStore):
  - New pagination state for sidebar listing:
    - sidebar: { pageSize: 20, loadingMore: false, hasMore: boolean, nextCursor: { ts: string, id: string } | null, totalCount?: number }
  - New actions:
    - loadInitialConversations: calls GET /api/chat/sync?limit=20&summary_only=true (no with_total by default), replaces state, fills sidebar meta.
    - loadMoreConversations: guards loadingMore and hasMore; calls GET /api/chat/sync with cursor params; appends unique sessions by id, updates cursor/hasMore.
    - Optional: a separate action to fetch totalCount by calling GET /api/chat/sync with with_total=true when needed (not used in initial UI).
  - De-duplication: Use a Map by id when merging pages; keep overall list sorted by lastMessageTimestamp desc.
  - Replace getRecentConversations(20) usage in ChatSidebar with the paged list from state.
- ChatSidebar:
  - Render the conversations array from store (paged), not a local slice.
  - At bottom: if hasMore, render a "Load more…" button. Optionally switch to an IntersectionObserver sentinel for auto-load.
  - Show a compact spinner while loadingMore. When no more, hide the control.
  - For preview text, prefer conversation.lastMessagePreview when available; avoid reading conversation.messages for performance.
- Anonymous users:
  - Keep current local-only behavior; only show the prompt. Load more requires signed-in state because listing comes from server.

## API response contract (summary mode)

- Request: GET /api/chat/sync?limit=20&summary_only=true[&cursor_ts=...&cursor_id=...]
  - Optional: append &with_total=true to receive totalCount
- Response:
  - conversations: Array<{
    id: string;
    title: string;
    userId: string;
    messageCount: number;
    totalTokens: number;
    lastModel?: string;
    lastMessagePreview?: string;
    lastMessageTimestamp?: string;
    createdAt?: string;
    updatedAt?: string;
    }>
  - meta: {
    pageSize: number;
    hasMore: boolean;
    nextCursor: { ts: string; id: string } | null;
    totalCount?: number; // present only when with_total=true
    }
  - syncTime: ISO string

Notes:

- last_activity won’t be used for pagination to avoid inconsistencies; we paginate by last_message_timestamp (already indexed and used for ordering today).

## Data and index considerations

- chat_sessions has last_message_timestamp and index(es). Seek pagination uses (last_message_timestamp DESC, id DESC) ordering.
- Tie handling: include id in the cursor; the WHERE clause applies lexicographic comparison on (ts, id).
- Counting: with_total=true uses an exact count on chat_sessions filtered by user_id; can be made optional to reduce load. For hasMore, prefer LIMIT+1 probe.

## Edge cases

- Multiple sessions sharing identical timestamp: resolved via id secondary sort and composite cursor.
- Deleted/renamed sessions while paginating: merging by id handles duplicates; sorting keeps order stable.
- Sessions with zero messages: lastMessageTimestamp may be null; treat as the oldest and include at the end.
- Backward compatibility: Default GET /api/chat/sync with no params works as today.

## Testing plan

- Unit/API tests (tests/api):
  - Page 1 returns 20 items and meta.hasMore=true when 21+ exist; nextCursor points to the 20th item.
  - Page 2 request with cursor returns the next 20; no overlap with page 1; when fewer than 20 remain, meta.hasMore=false.
  - with_total=true returns totalCount only when requested and stays constant across pages (unless creating/deleting sessions in test).
  - summary_only=true excludes chat_messages and still includes lastMessagePreview and messageCount.
  - Auth guard and rate-limit decorators applied.
- Store tests (tests/stores):
  - loadInitialConversations populates state and meta.
  - loadMoreConversations appends, dedupes, updates hasMore and nextCursor.
- Component tests (tests/components):
  - ChatSidebar shows Load more… when hasMore.
  - Clicking Load more… fetches next page and appends cards; hides button when exhausted.

## Rollout steps

- Phase 1: Backend API updates (GET /api/chat/sync pagination + meta, summary_only, optional with_total)
  - [ ] Param parsing and validation (limit caps, cursor parse, direction)
  - [ ] Seek pagination query and meta detection (LIMIT+1)
  - [ ] Optional totalCount (with_total)
  - [ ] summary_only to skip chat_messages (\*) join
  - [ ] Tests for API
  - [ ] Docs in docs/api
  - [ ] User verification: confirm API shape matches needs
- Phase 2: Frontend store and ChatSidebar wiring
  - [ ] Add pagination state and actions
  - [ ] Switch ChatSidebar to paged state and summary preview
  - [ ] Load more button + spinner, dedupe, sort
  - [ ] Tests and a11y pass
  - [ ] User verification: scroll UX and state behavior
- Phase 3: Performance + polish
  - [ ] Throttle loadMore calls; guard double clicks
  - [ ] Optional IntersectionObserver sentinel
  - [ ] Empty/edge-state handling
  - [ ] Docs updates
  - [ ] User verification: final QA

## Assumptions

- It’s acceptable to add meta to the /api/chat/sync GET response without breaking consumers.
- We can introduce summary_only to dramatically cut payload for sidebar.
- Timestamps are UTC ISO strings; id is lexicographic-safe for secondary sort.

## Clarifying questions

1. Should we paginate strictly by last_message_timestamp (recommended) or by last_activity?
2. Do you want totalCount always returned, or only when requested via with_total=true?
3. Is it okay to introduce summary_only and stop returning chat_messages in the sidebar fetch to reduce payload?
4. Should we implement Option B (dedicated sessions listing) instead, and migrate ChatSidebar to that endpoint?
5. What page size caps do you prefer (e.g., default 20, max 50)?

## Manual test steps

- Seed > 40 conversations for a test user with varying last_message_timestamp values.
- Load the app as that user; verify first 20 show; "Load more…" appears.
- Click "Load more…"; next 20 append beneath; order remains correct; preview and counts are accurate.
- After the second page, if fewer than 20 remain, button hides and no extra fetch occurs.
- Verify network calls include cursor_ts/cursor_id and summary_only=true.
