# API Chat Messages Error Flow Analysis

## Issue Summary

When `/api/chat` fails with an error, the subsequent `/api/chat/messages` request incorrectly includes both the failed user message AND an assistant response containing the error. The expected behavior is to send ONLY the user message with the error_message mapped to it.

## Current Problematic Flow

### 1. Chat API Fails
POST `/api/chat` returns error response:
```json
{
  "error": "The Stealth model is temporarily rate-limited...",
  "code": "too_many_requests",
  "details": "...",
  "timestamp": "2025-08-05T14:49:29.200Z",
  "retryAfter": 60,
  "suggestions": [...]
}
```

### 2. Frontend Creates Assistant Error Message
Current code in `stores/useChatStore.ts` (lines 544-572):
```typescript
const errorMessage: ChatMessage = {
  id: generateMessageId(),
  role: "assistant",  // ❌ WRONG: Creates assistant message
  content: "",
  timestamp: new Date(),
  error_message: chatError.message,
  error_code: chatError.code,
  retry_after: chatError.retryAfter,
  suggestions: chatError.suggestions,
  user_message_id: userMessage.id,
};

// Saves BOTH user message AND assistant error message
const messagesToSave = [];
if (failedUserMessage) {
  messagesToSave.push(failedUserMessage);
}
messagesToSave.push(errorMessage); // ❌ WRONG: Adds assistant error
```

### 3. Wrong Messages Endpoint Request
Results in incorrect `/api/chat/messages` request:
```json
{
  "messages": [
    {
      "id": "msg_user",
      "role": "user",
      "error": true,
      "input_tokens": 0
    },
    {
      "id": "msg_assistant", // ❌ WRONG: Assistant error message
      "role": "assistant",
      "error_message": "...",
      "user_message_id": "msg_user"
    }
  ]
}
```

## Required Code Changes

### Change 1: Fix Error Message Assignment
**File**: `stores/useChatStore.ts` (around line 544-572)

**Problem**: Error message is created as assistant message instead of being assigned to user message

**Solution**: Map error details directly to the failed user message:

```typescript
// ❌ REMOVE: Don't create separate assistant error message
// const errorMessage: ChatMessage = {
//   role: "assistant",
//   error_message: chatError.message,
//   ...
// };

// ✅ ADD: Map error to user message directly (only error_message field)
const failedUserMessageWithError = {
  ...failedUserMessage,
  error: true,
  input_tokens: 0,
  error_message: chatError.message, // Only this field is stored in DB
  // NOTE: error_code, retry_after, suggestions are NOT stored in DB
};

// Save ONLY the user message with error details
await fetch("/api/chat/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: failedUserMessageWithError, // Single message, not array
    sessionId: currentConversationId,
  }),
});
```

### Change 2: Update Local State Management
**File**: `stores/useChatStore.ts` (around line 514-523)

**Current**: Marks user message as failed with `error: true, input_tokens: 0`

**Update**: Include only error_message in user message state (other fields for local display only):

```typescript
// Update user message state to include error details
set((state) => ({
  conversations: state.conversations.map((conv) =>
    conv.id === state.currentConversationId
      ? {
          ...conv,
          messages: conv.messages.map((msg) =>
            msg.id === userMessage.id
              ? { 
                  ...msg, 
                  error: true, 
                  input_tokens: 0,
                  error_message: chatError.message, // For DB storage
                  // Keep these for local UI state (not sent to DB):
                  error_code: chatError.code,
                  retry_after: chatError.retryAfter,
                  suggestions: chatError.suggestions,
                }
              : msg
          ),
        }
      : conv
  ),
  isLoading: false,
  error: chatError,
}));
```

### Change 3: Verify Message Endpoint Handling
**File**: `src/app/api/chat/messages/route.ts` (lines 169-198)

**Current**: Already supports error_message field in user messages ✅

**Verification**: The endpoint correctly handles:
```typescript
error_message: message.error_message || (message.error ? 'Message failed' : null),
```

This supports both explicit error_message and fallback for error flag.

## Expected Result

After changes, `/api/chat/messages` request will contain ONLY the user message with error details:

```json
{
  "message": {
    "id": "msg_1754405367067_s1crag3tm",
    "content": "how many squares are there in a tic-tac-toe game?",
    "role": "user",
    "timestamp": "2025-08-05T14:49:27.067Z",
    "originalModel": "openrouter/horizon-beta",
    "error": true,
    "error_message": "The Stealth model is temporarily rate-limited. Please try again in a few moments or switch to a different model.",
    "input_tokens": 0
  },
  "sessionId": "conv_1754405367066_vbdyf52or"
}
```

**Note**: `error_code`, `retry_after`, and `suggestions` fields are not included in the request since they are not stored in the database schema.

## Implementation Priority

1. **High Priority**: Fix error message assignment in `useChatStore.ts` - eliminate assistant error message creation
2. **Medium Priority**: Update local state management to include error_message for DB storage
3. **Low Priority**: Verify message endpoint (already working correctly)

**Database Schema Note**: Only `error_message` field is stored in `chat_messages` table. Fields like `error_code`, `retry_after`, and `suggestions` can be kept in local state for UI purposes but should not be sent to the database.

## Testing Scenarios

1. **API Error Response**: Trigger rate limit error and verify only user message saved
2. **Error Message Content**: Verify error details properly mapped to user message
3. **Retry Functionality**: Ensure retry works with updated error message structure
4. **Database Storage**: Verify error_message field populated correctly in chat_messages table

## Files to Modify

1. `stores/useChatStore.ts` - Primary changes to error handling logic
2. No changes needed to `/api/chat/messages` endpoint (already supports required fields)

## Backward Compatibility

Changes maintain backward compatibility:
- Existing error_message field in database schema ✅
- Message endpoint already supports error fields ✅
- Frontend error display logic should work with user message errors ✅
