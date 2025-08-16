# Remove manual sync and auto-sync feature

## Overview

The `/api/chat/sync` endpoint is now only used on initial sign-in to sync unauthenticated chat messages to the database and fetch the user's chat history to the frontend. All subsequent message syncs are handled via the `/api/chat/messages` endpoint. Therefore, manual sync and auto-sync features are obsolete and should be removed, including any related UI elements, hooks, and environment variables.

**Note:** Do NOT remove the `/api/chat/sync` endpoint itself—only the manual and auto-sync features in the frontend and supporting code.

---

## Current Implementation Context

### 1. Manual Sync Feature

- **UI Component:**

  - The manual sync button is located in `components/chat/ChatSidebar.tsx` (or similar sidebar/chat UI component).
  - The button typically triggers a function to call `/api/chat/sync` and update chat history.

- **Supporting Logic:**

  - The sync action is likely handled via a custom hook, such as `hooks/useChatSync.ts` or similar.
  - The hook may expose a `syncChat` function, a loading state, and error handling.
  - The sidebar component imports and uses this hook to trigger manual sync.

- **Status Indicator:**
  - There may be a sync status indicator (e.g., last sync time, success/failure) in the sidebar.
  - This indicator could be updated after manual sync or after successful `/api/chat/messages` calls.

### 2. Auto-Sync Feature

- **Environment Variables:**

  - `NEXT_PUBLIC_AUTO_SYNC_INTERVAL` (minutes): Controls periodic sync interval.
  - `NEXT_PUBLIC_AUTO_SYNC_FLAG` (boolean): Enables/disables auto-sync.

- **Implementation:**
  - Auto-sync is likely implemented via a timer (e.g., `setInterval`) in a hook or context, such as `useChatSync.ts` or `useChat.ts`.
  - When enabled, it periodically calls `/api/chat/sync` to refresh chat history.

### 3. API Endpoints

- **/api/chat/sync:**

  - Used for initial sign-in sync and previously for manual/auto sync.
  - Should remain for initial sync only.

- **/api/chat/messages:**
  - Handles all subsequent message syncs.

---

## Files and Functions Involved

- `components/chat/ChatSidebar.tsx`

  - Contains manual sync button and possibly sync status indicator.

- `hooks/useChatSync.ts`

  - Contains logic for manual and auto-sync, including API calls, timers, and state.

- `hooks/useChat.ts`

  - May also contain sync logic or interact with `useChatSync`.

- `.env` or `.env.local`

  - Contains `NEXT_PUBLIC_AUTO_SYNC_INTERVAL` and `NEXT_PUBLIC_AUTO_SYNC_FLAG`.

- `lib/services/chatSync.ts` (or similar)

  - May contain API call logic for `/api/chat/sync`.

- `components/ui/SyncStatusIndicator.tsx` (if exists)
  - Displays sync status.

---

## Flow Description

1. **Manual Sync:**

   - User clicks Sync button in sidebar.
   - Triggers `syncChat` function from `useChatSync`.
   - Calls `/api/chat/sync` endpoint.
   - Updates chat history and sync status indicator.

2. **Auto-Sync:**

   - On app load, checks `NEXT_PUBLIC_AUTO_SYNC_FLAG`.
   - If enabled, sets up interval using `NEXT_PUBLIC_AUTO_SYNC_INTERVAL`.
   - Periodically calls `syncChat` (and `/api/chat/sync`).
   - Updates chat history and sync status indicator.

3. **Current/Future Flow:**
   - Only initial sign-in triggers `/api/chat/sync`.
   - All other syncs handled by `/api/chat/messages`.
   - Manual and auto-sync features are no longer needed.

---

## Next Steps for Developer

- Remove manual sync button from sidebar.
- Remove auto-sync logic and related environment variables.
- Clean up unused functions, hooks, and variables related to manual/auto sync.
- Consider refactoring sync status indicator to update after `/api/chat/messages` calls.
- Ensure `/api/chat/sync` is only used for initial sign-in.
- Update documentation and tests as needed.

---

## Implementation Plan (Phased)

Phase 1 – Remove UI/manual triggers and auto-sync timers

- [x] ChatSidebar: remove manual sync button and its `manualSync` handler
  - File: `components/ui/ChatSidebar.tsx`
  - Keep the Sync Status indicator block
- [x] Hook: remove auto-sync interval logic and env reads
  - File: `hooks/useChatSync.ts`
  - Delete `useEffect` that reads `NEXT_PUBLIC_AUTO_SYNC_FLAG` and `NEXT_PUBLIC_AUTO_SYNC_INTERVAL`
  - Remove `manualSync` callback and stop returning it
- [x] Tests: delete auto-sync tests tied to periodic timers
  - File: `tests/stores/chatStore-autoSync.test.ts`

User test steps (Phase 1)

- Open the app and sign out; confirm there is no “Sync” button in the sidebar
- Sign in; verify initial history loads, and Sync Status renders without a button

Phase 2 – Refactor Sync Status to update on message persistence

- [x] Update chat store to set `lastSyncTime` after successful `/api/chat/messages` saves
  - File: `stores/useChatStore.ts`
  - After successful POST to `/api/chat/messages` in send and retry flows, set `lastSyncTime = new Date().toISOString()`
  - Also show a toast notification: "Message saved!" after each successful save
- [x] Leave `/api/chat/sync` for initial sign-in only

User test steps (Phase 2)

- Send a message; after the assistant replies, confirm Sync Status shows “Synced <time>”
- Retry a failed message; after successful save, confirm Sync Status time updates

Phase 3 – Cleanup docs and env references

- [x] Remove mentions of `NEXT_PUBLIC_AUTO_SYNC_FLAG` and `NEXT_PUBLIC_AUTO_SYNC_INTERVAL` from docs and examples
- [x] Add a note in `docs/components/ui/ChatSidebar.md` about the new Sync Status behavior

Verification & sign-off

- [x] Run typecheck and tests pass (`npm run build` or `tsc --noEmit`, `npm test`)
- [ ] QA: manual checks above

Notes

- Keep `/api/chat/sync` endpoint for initial sign-in.
- Keep admin model-sync (unrelated): `src/app/api/admin/sync-models/*`, `lib/services/modelSyncService.ts`, `src/app/admin/SyncPanel.tsx`.

---

## References

- `components/chat/ChatSidebar.tsx`
- `hooks/useChatSync.ts`
- `hooks/useChat.ts`
- `.env` / `.env.local`
- `lib/services/chatSync.ts`
- `components/ui/SyncStatusIndicator.tsx`

---

This context should help the next developer understand the scope and flow of the manual/auto sync features and what needs to be removed or refactored. If you need more detailed code references, search for “sync” in the above files and look for usage of `/api/chat/sync`, `syncChat`, and related environment variables.
