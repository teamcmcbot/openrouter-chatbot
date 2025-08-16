# No Input Tokens for User Message Analysis

## Issue Summary

When frontend calls `/api/chat/messages`, the request payload for role=user should include `input_tokens`. Currently, user messages are sent without `input_tokens`, resulting in analytics showing `input_tokens` as 0 for user messages in the database.

## Current Flow Analysis

### 1. Frontend Chat Flow

**File**: `stores/useChatStore.ts` (sendMessage function)

The current flow works as follows:

1. **User creates message**: Frontend creates user message without `input_tokens`

   ```typescript
   const userMessage: ChatMessage = {
     id: generateId(),
     content: content.trim(),
     role: "user",
     timestamp: new Date(),
     // Missing: input_tokens field
   };
   ```

2. **API call to `/api/chat`**: Sends user message + context to get AI response

   ```typescript
   const response = await fetch("/api/chat", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify(requestBody),
   });
   ```

3. **AI response received**: Contains usage data including `prompt_tokens`

   ```json
   {
     "data": {
       "response": "...",
       "usage": {
         "prompt_tokens": 252, // ← This is the input_tokens value needed
         "completion_tokens": 78,
         "total_tokens": 330
       },
       "request_id": "msg_1754390700428_4rwj18lxb", // ← Links back to user message
       "timestamp": "2025-08-05T10:45:04.197Z"
     }
   }
   ```

4. **Frontend updates user message**: Should set `input_tokens` = `prompt_tokens`

   ```typescript
   // Currently in useChatStore.ts lines 406-420
   const updatedMessages = conv.messages.map((msg) =>
     msg.id === data.request_id && msg.role === "user"
       ? { ...msg, input_tokens: data.usage?.prompt_tokens ?? 0 } // ✅ This works correctly
       : msg
   );
   ```

5. **Save to database**: Messages sent to `/api/chat/messages`
   ```typescript
   // Currently in useChatStore.ts lines 452-455
   await fetch("/api/chat/messages", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       messages: [userMessage, assistantMessage], // ← User message should now have input_tokens
       sessionId: currentConversationId,
     }),
   });
   ```

### 2. Database Storage Analysis

**File**: `src/app/api/chat/messages/route.ts`

The backend correctly handles `input_tokens` when provided:

```typescript
// Lines 159-161: Message array processing
input_tokens: message.input_tokens || 0,
output_tokens: message.output_tokens || 0,
total_tokens: message.total_tokens || (message.input_tokens || 0) + (message.output_tokens || 0),
```

**Database Schema**: `chat_messages` table includes:

- `input_tokens` (integer) - stores prompt tokens for user messages
- `output_tokens` (integer) - stores completion tokens for assistant messages
- `total_tokens` (integer) - stores total tokens for all messages

### 3. Root Cause Analysis

The issue occurs because:

1. **Timing mismatch**: User message is created **before** the API call to `/api/chat`
2. **Two-step process**: `input_tokens` is only available **after** the assistant response
3. **Race condition**: Message saving might happen before `input_tokens` update

Currently, the frontend **does** update the user message with `input_tokens` after receiving the assistant response, but this update might not be reflected when the message is saved to the database.

## Current Implementation Status

### ✅ Working Correctly

1. **Assistant messages**: `input_tokens`, `output_tokens`, and `total_tokens` are correctly stored
2. **Frontend token mapping**: User messages are updated with `input_tokens` from API response
3. **Database schema**: Supports all required token fields
4. **API endpoints**: Both `/api/chat` and `/api/chat/messages` handle token data correctly

### ❌ Issue Areas

1. **User message `input_tokens`**: Always 0 in database despite frontend updates
2. **Payload timing**: User message saved before `input_tokens` is available
3. **No fallback**: Failed API calls don't ensure `input_tokens` remains 0

## Fix Recommendations

### Recommendation 1: Ensure Synchronous Update (Preferred)

**Modify**: `stores/useChatStore.ts` sendMessage function

Ensure user message is updated with `input_tokens` **before** saving to database:

```typescript
// After successful API response, update the conversation state first
set((state) => {
  const currentConv = state.conversations.find(
    (c) => c.id === state.currentConversationId
  );

  return {
    conversations: state.conversations.map((conv) =>
      conv.id === state.currentConversationId
        ? updateConversationFromMessages({
            ...conv,
            messages: [
              ...conv.messages.map((msg) =>
                msg.id === data.request_id && msg.role === "user"
                  ? { ...msg, input_tokens: data.usage?.prompt_tokens ?? 0 }
                  : msg
              ),
              assistantMessage,
            ],
          })
        : conv
    ),
    isLoading: false,
  };
});

// THEN save to database with updated messages
const { user } = useAuthStore.getState();
if (user?.id && currentConv?.userId === user.id) {
  // Get the updated conversation state
  const updatedConv = get().conversations.find(
    (c) => c.id === currentConversationId
  );
  const updatedUserMessage = updatedConv?.messages.find(
    (m) => m.id === data.request_id
  );

  if (updatedUserMessage) {
    setTimeout(async () => {
      try {
        await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [updatedUserMessage, assistantMessage], // ← Now has input_tokens
            sessionId: currentConversationId,
          }),
        });
      } catch (error) {
        logger.debug("Message save failed (silent)", error);
      }
    }, 0);
  }
}
```

### Recommendation 2: Database-Level Update (Alternative)

**Add**: Separate API call to update user message `input_tokens`

```typescript
// After saving the user/assistant pair, update user message tokens
if (data.request_id && data.usage?.prompt_tokens) {
  setTimeout(async () => {
    try {
      await fetch(`/api/chat/messages/${data.request_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_tokens: data.usage.prompt_tokens,
        }),
      });
    } catch (error) {
      logger.debug("Token update failed (silent)", error);
    }
  }, 100);
}
```

### Recommendation 3: Handle Failed Requests

**Ensure**: Failed API calls set `input_tokens` to 0

```typescript
// In error handling section
catch (err) {
  // Update user message to ensure input_tokens is 0 for failed requests
  set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.id === state.currentConversationId
        ? {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === userMessage.id && msg.role === 'user'
                ? { ...msg, input_tokens: 0 } // Ensure 0 for failed requests
                : msg
            ),
          }
        : conv
    ),
    isLoading: false,
    error: chatError,
  }));
}
```

## Testing Plan

### Manual Testing Steps

1. **Test successful user message**:

   - Send a user message that gets a successful assistant response
   - Verify user message has `input_tokens` > 0 in database
   - Verify assistant message has correct `input_tokens`, `output_tokens`, `total_tokens`

2. **Test failed user message**:

   - Send a user message that fails (rate limit, network error, etc.)
   - Verify user message has `input_tokens` = 0 in database
   - Verify no assistant message is created

3. **Test database queries**:

   ```sql
   -- Check user message tokens
   SELECT id, role, content, input_tokens, output_tokens, total_tokens
   FROM chat_messages
   WHERE role = 'user'
   ORDER BY message_timestamp DESC
   LIMIT 10;

   -- Check assistant message tokens
   SELECT id, role, content, input_tokens, output_tokens, total_tokens
   FROM chat_messages
   WHERE role = 'assistant'
   ORDER BY message_timestamp DESC
   LIMIT 10;
   ```

### Expected Results

- **User messages**: `input_tokens` = prompt_tokens from API, `output_tokens` = 0, `total_tokens` = 0
- **Assistant messages**: `input_tokens` = prompt_tokens, `output_tokens` = completion_tokens, `total_tokens` = total_tokens
- **Failed requests**: User message `input_tokens` = 0

## Implementation Priority

1. **High Priority**: Fix Recommendation 1 (synchronous update)
2. **Medium Priority**: Add comprehensive error handling (Recommendation 3)
3. **Low Priority**: Consider database-level updates if needed (Recommendation 2)

## Files to Modify

1. **Primary**: `stores/useChatStore.ts` (sendMessage and retryMessage functions)
2. **Testing**: Add tests to verify token handling in various scenarios
3. **Documentation**: Update API documentation to clarify token handling flow

## Security Considerations

- Ensure `input_tokens` values are not user-manipulable
- Validate that `input_tokens` comes only from authenticated API responses
- Maintain audit trail for token usage analytics

## Analytics Impact

Once fixed, this will provide:

- Accurate input token analytics for user messages
- Proper cost tracking per conversation
- Better insights into model usage patterns
- Foundation for usage-based billing features
