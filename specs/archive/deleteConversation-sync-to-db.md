# Plan: Sync `deleteConversation` to Backend DB

## Background

Currently, the `deleteConversation` function in the chat application only deletes conversations locally (in the client-side store). It does not sync deletions to the backend database, which can cause inconsistencies between the client and server, especially for authenticated users who expect their data to be consistent across devices.

## Current State Analysis

### Existing Implementation

- **Local deletion only**: `deleteConversation` in `stores/useChatStore.ts` (line 509-523) only removes from local store
- **Working reference**: `clearAllConversations` (line 525-572) demonstrates proper sync pattern with `/api/chat/clear-all`
- **Existing API endpoint**: `/api/chat/sessions` DELETE method supports single session deletion with `?id=sessionId`
- **Database schema**: `chat_sessions` and `chat_messages` tables with proper foreign key cascade constraints

### Current Delete Flow

1. User clicks delete button in `ChatSidebar.tsx`
2. Calls `handleDeleteChat(conversation.id)` which calls `deleteConversation(id)`
3. Only updates local store (removes from `conversations` array, updates `currentConversationId`)
4. **Missing**: No backend sync for authenticated users

## Goals

- Ensure that when a conversation is deleted in the UI, it is also deleted from the backend database for authenticated users.
- Maintain local-only deletion for unauthenticated users.
- Handle errors gracefully and provide user feedback if the sync fails.
- Ensure the UI and store remain consistent with the backend state.
- Follow existing patterns established by `clearAllConversations` implementation.

## Implementation Plan

### Task 1: Update `deleteConversation` Store Method

**File**: `stores/useChatStore.ts`
**Location**: Line 509-523 (current `deleteConversation` method)

**Changes needed**:

1. Make `deleteConversation` async (follow `clearAllConversations` pattern)
2. Check if user is authenticated using `useAuthStore.getState()`
3. If authenticated, call backend API before updating local store
4. Add error handling and logging (follow existing logger pattern)
5. Update local store only after successful backend deletion (or for unauthenticated users)

**Error handling**:

- If backend deletion fails, don't update local store
- Set error state in store for UI feedback
- Log errors appropriately

### Task 2: Create Backend API Endpoint

**File**: `src/app/api/chat/delete-conversation/route.ts` (new file)

**Alternative approach**: The existing `/api/chat/sessions` DELETE endpoint already handles single conversation deletion correctly. We can use this endpoint instead of creating a new one.

**Endpoint specification**:

- **URL**: `/api/chat/sessions?id={conversationId}`
- **Method**: DELETE
- **Authentication**: Required (already implemented)
- **Functionality**: Already deletes both messages and session with proper user validation
- **Response**: JSON with success status

**No new API needed** - existing endpoint at `/api/chat/sessions` DELETE is perfect for this use case.

### Task 3: Update Error Handling in UI

**File**: `components/ui/ChatSidebar.tsx`
**Location**: Line 79 (`handleDeleteChat` method)

**Changes needed**:

1. Make `handleDeleteChat` async
2. Add try-catch error handling
3. Show user feedback for deletion failures (similar to `handleClearAllConversations`)
4. Add loading state during deletion (optional UX enhancement)

### Task 4: Add Loading State and User Feedback

**File**: `components/ui/ChatSidebar.tsx`

**Changes needed**:

1. Add loading indicator while deletion is in progress
2. Disable delete button during deletion
3. Show success/error feedback to user
4. Consider optimistic updates with rollback on error

### Task 5: Update Store Types

**File**: `stores/types/chat.ts`
**Location**: Line 47 (`deleteConversation` type definition)

**Changes needed**:

1. Update type signature from `(id: string) => void` to `(id: string) => Promise<void>`
2. Ensure consistency with async nature

### Task 6: Add Tests

**Files**:

- `tests/stores/chatStore-deleteConversation.test.ts` (new)
- Update existing integration tests

**Test cases needed**:

1. **Authenticated user**: Deletion syncs to backend
2. **Unauthenticated user**: Local-only deletion
3. **Backend failure**: Error handling, no local deletion
4. **Network error**: Proper error state and user feedback
5. **Current conversation deletion**: Switches to next available conversation
6. **Last conversation deletion**: Sets `currentConversationId` to null

### Task 7: Documentation Updates

**Files**:

- `docs/stores/useChatStore.md`
- Update inline comments in code

**Updates needed**:

1. Document async nature of `deleteConversation`
2. Document error handling patterns
3. Update API documentation if needed

## Detailed Implementation Sequence

### Step 1: Backend Integration (Priority 1)

```typescript
// In stores/useChatStore.ts - update deleteConversation method
deleteConversation: async (id) => {
  const { user } = useAuthStore.getState();

  logger.debug("Deleting conversation", { id, authenticated: !!user });

  try {
    // If user is authenticated, delete from backend first
    if (user) {
      logger.debug("Deleting conversation from server for authenticated user");
      const response = await fetch(`/api/chat/sessions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.statusText}`);
      }

      const result = await response.json();
      logger.debug("Server conversation deleted", result);
    }

    // Delete from local store
    set((state) => {
      const newConversations = state.conversations.filter(c => c.id !== id);
      const newCurrentId = state.currentConversationId === id
        ? newConversations[0]?.id ?? null
        : state.currentConversationId;

      return {
        conversations: newConversations,
        currentConversationId: newCurrentId,
        error: null,
      };
    });

    logger.debug("Conversation deleted successfully", { id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation';
    logger.error("Failed to delete conversation", errorMessage);

    set({
      error: {
        message: errorMessage,
        timestamp: new Date().toISOString()
      }
    });
    throw error; // Re-throw for UI handling
  }
},
```

### Step 2: UI Error Handling (Priority 2)

```typescript
// In ChatSidebar.tsx - update handleDeleteChat method
const handleDeleteChat = async (id: string) => {
  try {
    await deleteConversation(id);
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    alert("Failed to delete conversation. Please try again.");
  }
};
```

## Success Criteria

1. **Authenticated users**: Conversation deletion removes data from both local store and backend database
2. **Unauthenticated users**: Conversation deletion works locally (no change in behavior)
3. **Error handling**: Failed backend deletions don't affect local store, user gets feedback
4. **UI consistency**: Delete button states and feedback work properly
5. **Data integrity**: No orphaned data in database, proper cascade deletions
6. **Performance**: No noticeable delay in UI responsiveness
7. **Tests**: All test cases pass, good coverage of success and error scenarios

## Rollback Plan

If issues arise:

1. **Quick fix**: Revert `deleteConversation` to synchronous local-only version
2. **Partial rollback**: Keep backend sync but disable error blocking of local deletion
3. **Full rollback**: Revert all changes and return to current behavior

## Risk Mitigation

1. **Backend unavailable**: Local deletion still works for unauthenticated users
2. **Network issues**: Proper error messages and retry mechanisms
3. **Race conditions**: Use existing store patterns and locking mechanisms
4. **User experience**: Maintain responsive UI with loading states
5. **Data consistency**: Follow existing sync patterns that work well
