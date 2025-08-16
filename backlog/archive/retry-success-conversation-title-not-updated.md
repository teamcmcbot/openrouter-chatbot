# Retry success conversation title not updated - RESOLVED

## Issue Summary
When the first user message in a new chat failed and was later retried successfully, the conversation title remained "New Chat" instead of updating to the first message content.

## Root Cause
The auto-title logic ran only after the initial successful message and did not execute on the retry path. Additionally, the retry persistence call did not send the updated title to the backend.

## Solution Implemented
- Added auto-title generation after successful retries in `stores/useChatStore.ts`.
- Included `sessionTitle` in `/api/chat/messages` payload during retry persistence.
- Created regression test to verify retry titles and persistence.
- Updated documentation for ChatSidebar and useChatStore.

## Status
Issue resolved and covered by automated tests.
