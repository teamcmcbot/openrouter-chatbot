# New Chat Feature - Enhanced Specification

## Overview

This specification outlines the enhanced behavior for the "New Chat" button functionality to provide a more intelligent and user-friendly experience when creating new conversations.

## Current Implementation Analysis

### Existing Implementation

The current "New Chat" button implementation can be found in:

- **ChatInterface.tsx**: `handleNewChat()` function
- **useChat.ts**: `createNewConversation()` function
- **useChatHistory.ts**: `createConversation()` function
- **ChatSidebar.tsx**: "New Chat" button UI

### Current Behavior

When "New Chat" is clicked:

1. Creates a new conversation with title "New Chat"
2. Clears current chat interface messages
3. Sets the new conversation as active
4. Clears ModelDetailsSidebar state

## New Requirements

When the "New Chat" button is clicked, the system should implement the following logic:

### 1. Check localStorage for `openrouter-chat-history`

#### If localStorage does NOT exist:

- Initialize `openrouter-chat-history` with a new empty conversation
- Update/Render "Recent Chat" sidebar with the new conversation titled "New Chat"
- **Note**: Since there's no chat history, the Recent Chat sidebar will only contain this single "New Chat" conversation
- Render ChatInterface with the "New Chat", removing any previous chat history if present

#### If localStorage EXISTS:

- Check the list of conversations in `openrouter-chat-history`
- **Remove any old conversations with 0 messages** (i.e., previous "New Chat" conversations that were never used)
- Add a new empty conversation with title "New Chat" to the existing list
- Render "Recent Chat" sidebar showing existing chat history + "New Chat" at the top

## Implementation Plan

### Phase 1: Analysis and Preparation (15 minutes)

**Objective**: Understand current implementation and identify required changes

#### Task 1.1: Review Current Implementation

- [ ] Examine current `handleNewChat()` function in ChatInterface.tsx
- [ ] Review `createNewConversation()` in useChat.ts
- [ ] Analyze `createConversation()` in useChatHistory.ts
- [ ] Understand current localStorage structure

#### Task 1.2: Identify Required Changes

- [ ] Determine where to add "empty conversation cleanup" logic
- [ ] Plan localStorage existence check
- [ ] Plan conversation deduplication strategy

**Checkpoint 1**: Review findings with human coordinator

### Phase 2: Core Logic Implementation (25 minutes)

**Objective**: Implement the new chat creation logic with cleanup

#### Task 2.1: Add Empty Conversation Cleanup Function

- [ ] Create `removeEmptyConversations()` function in useChatHistory.ts
- [ ] Add logic to identify conversations with 0 messages
- [ ] Add logging to track cleanup operations
- [ ] Test the cleanup function in isolation

#### Task 2.2: Enhance New Chat Creation Logic

- [ ] Modify `createNewConversation()` in useChat.ts to use cleanup
- [ ] Add localStorage existence check
- [ ] Add logging for both scenarios (new vs existing localStorage)
- [ ] Ensure proper conversation ordering (new chat at top)

**Checkpoint 2**: Review implementation with human coordinator and test

### Phase 3: Integration and UI Updates (20 minutes)

**Objective**: Ensure UI properly reflects the new logic

#### Task 3.1: Update ChatSidebar Behavior

- [ ] Verify sidebar properly shows cleaned-up conversation list
- [ ] Ensure "New Chat" appears at top of conversation list
- [ ] Test conversation ordering and highlighting
- [ ] Add logging for sidebar render operations

#### Task 3.2: Enhance ChatInterface Integration

- [ ] Verify ChatInterface properly clears previous state
- [ ] Ensure proper active conversation highlighting
- [ ] Test state transitions between conversations
- [ ] Add error handling for edge cases

**Checkpoint 3**: Review UI integration with human coordinator

### Phase 4: Testing and Validation (20 minutes)

**Objective**: Comprehensive testing of new functionality

#### Task 4.1: Test Initial State Scenarios

- [ ] Test with completely empty localStorage (first time user)
- [ ] Test with existing conversations but no empty ones
- [ ] Test with existing conversations including empty ones
- [ ] Test with multiple empty "New Chat" conversations

#### Task 4.2: Test Edge Cases

- [ ] Test rapid clicking of "New Chat" button
- [ ] Test "New Chat" during message sending
- [ ] Test localStorage corruption scenarios
- [ ] Test conversation switching after "New Chat"

**Checkpoint 4**: Final review and validation with human coordinator

## Technical Details

### Key Functions to Modify

1. **useChatHistory.ts**:

   ```typescript
   // New function to add
   const removeEmptyConversations = useCallback(() => {
     setChatHistoryState((prev) => ({
       ...prev,
       conversations: prev.conversations.filter(
         (conv) => conv.messages.length > 0
       ),
     }));
   }, [setChatHistoryState]);
   ```

2. **useChat.ts**:
   ```typescript
   // Modified createNewConversation function
   const createNewConversation = useCallback(() => {
     // Step 1: Remove empty conversations
     removeEmptyConversations();

     // Step 2: Create new conversation
     createConversation("New Chat");

     // Step 3: Clear interface state
     setMessages([]);
     setError(null);
   }, [createConversation, removeEmptyConversations]);
   ```

### Logging Strategy

Add comprehensive logging at each step:

- `console.log('NEW_CHAT: localStorage exists:', !!localStorage.getItem('openrouter-chat-history'))`
- `console.log('NEW_CHAT: Removing empty conversations:', emptyConversations.length)`
- `console.log('NEW_CHAT: Final conversation count:', conversations.length)`
- `console.log('NEW_CHAT: New conversation created:', newConversation.id)`

### Success Criteria

- [ ] Empty "New Chat" conversations are automatically cleaned up
- [ ] Only one "New Chat" conversation exists at a time
- [ ] Conversation list properly orders with new chat at top
- [ ] UI remains responsive during conversation cleanup
- [ ] localStorage remains consistent and uncorrupted
- [ ] All existing functionality continues to work

## Notes for Human Coordinator

At each checkpoint, please:

1. Review the implemented code changes
2. Test the application manually
3. Verify console logs show expected behavior
4. Provide feedback on any issues or requested changes
5. Approve proceeding to the next phase

The implementation will be done incrementally with extensive logging to ensure we can track the behavior and debug any issues that arise.
