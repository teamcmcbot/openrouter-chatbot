# Retry Last Message Feature Specification

## Overview

This specification outlines the implementation of a retry feature for the last sent message in the OpenRouter chatbot application. When a message fails to send, users can retry sending the same message without retyping it.

## Requirements

### Core Functionality

1. **Error State Tracking**: Track error state specifically for the LAST sent message
2. **Visual Indicators**: Show error/warning icon on failed message bubbles
3. **Retry Button**: Display retry button below the last failed message
4. **Error Dismissal**: Automatically dismiss errors when retry is successful
5. **Message Invalidation**: Remove retry option when user sends a new message

### User Experience Rules

- Only the **LAST** sent message can be retried
- If user sends a new message, previous failed message can no longer be retried
- Retry button appears only for the most recent failed message
- Error indicators are shown inline with the message bubble
- Successful retry removes all error indicators and shows the response

## Technical Implementation Plan

### 1. Data Structure Changes

#### 1.1 Enhanced ChatMessage Interface

Update the `ChatMessage` interface to include error tracking:

```typescript
// lib/types/chat.ts
export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
  error?: ChatError; // New field for error state
  isRetryable?: boolean; // New field to track if message can be retried
}

export interface ChatError {
  message: string;
  code?: string;
  suggestions?: string[];
  retryAfter?: number;
  timestamp?: string;
}
```

#### 1.2 Chat State Management

Add new state variables to track retry functionality:

```typescript
// hooks/useChat.ts
interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: ChatError | null; // Global error state (for general errors)
  sendMessage: (content: string, model?: string) => Promise<void>;
  retryLastMessage: () => Promise<void>; // New function
  clearMessages: () => void;
  clearError: () => void;
  lastFailedMessage: ChatMessage | null; // New state
}
```

### 2. Hook Implementation Changes

#### 2.1 useChat Hook Updates

```typescript
// hooks/useChat.ts
export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [lastFailedMessage, setLastFailedMessage] =
    useState<ChatMessage | null>(null);

  const sendMessage = useCallback(
    async (content: string, model?: string) => {
      if (!content.trim() || isLoading) return;

      // Clear previous failed message state when sending new message
      setLastFailedMessage(null);

      // Mark all previous messages as non-retryable
      setMessages((prev) =>
        prev.map((msg) => ({ ...msg, isRetryable: false }))
      );

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        content: content.trim(),
        role: "user",
        timestamp: new Date(),
        isRetryable: true, // Mark as retryable initially
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        // ... existing API call logic ...

        // On success, mark message as non-retryable
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === userMessage.id ? { ...msg, isRetryable: false } : msg
          )
        );

        // Add assistant response
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        // On error, mark message with error state
        const chatError: ChatError = {
          message: err.message || "Failed to send message",
          code: err.code || "unknown_error",
          suggestions: err.suggestions,
          retryAfter: err.retryAfter,
          timestamp: new Date().toISOString(),
        };

        // Update the failed message with error state
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === userMessage.id
              ? { ...msg, error: chatError, isRetryable: true }
              : msg
          )
        );

        // Set as last failed message
        setLastFailedMessage({ ...userMessage, error: chatError });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  const retryLastMessage = useCallback(async () => {
    if (!lastFailedMessage || isLoading) return;

    // Clear error state from the message
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === lastFailedMessage.id ? { ...msg, error: undefined } : msg
      )
    );

    setIsLoading(true);
    setError(null);

    try {
      // ... retry API call with same content and model ...

      // On success, clear last failed message
      setLastFailedMessage(null);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === lastFailedMessage.id ? { ...msg, isRetryable: false } : msg
        )
      );

      // Add assistant response
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      // On retry failure, restore error state
      const chatError: ChatError = {
        message: err.message || "Retry failed",
        code: err.code || "retry_failed",
        suggestions: err.suggestions,
        retryAfter: err.retryAfter,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === lastFailedMessage.id ? { ...msg, error: chatError } : msg
        )
      );

      setLastFailedMessage((prev) =>
        prev ? { ...prev, error: chatError } : null
      );
    } finally {
      setIsLoading(false);
    }
  }, [lastFailedMessage, isLoading]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    retryLastMessage,
    clearMessages,
    clearError,
    lastFailedMessage,
  };
}
```

### 3. UI Component Changes

#### 3.1 MessageList Component Updates

```typescript
// components/chat/MessageList.tsx
interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onRetryMessage?: () => void; // New prop for retry functionality
}

export default function MessageList({
  messages,
  isLoading,
  onRetryMessage,
}: Readonly<MessageListProps>) {
  // ... existing code ...

  return (
    <div className="h-full overflow-y-auto px-6 py-4 scroll-smooth">
      <div className="space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`flex max-w-[70%] ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  message.role === "user"
                    ? "bg-emerald-600 text-white ml-3"
                    : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 mr-3"
                }`}
              >
                {message.role === "user" ? "U" : "AI"}
              </div>

              {/* Message Content with Error State */}
              <div className="flex flex-col">
                <div
                  className={`rounded-lg px-4 py-2 relative ${
                    message.role === "user"
                      ? `bg-emerald-600 text-white ${
                          message.error ? "border-2 border-red-400" : ""
                        }`
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {/* Error Icon */}
                  {message.error && message.role === "user" && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                    </div>
                  )}

                  <p
                    className={`text-xs mt-1 ${
                      message.role === "user"
                        ? "text-emerald-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {formatTime(message.timestamp)}
                    {message.elapsed_time && (
                      <span className="text-gray-400 dark:text-gray-500">
                        {" "}
                        (Took {message.elapsed_time} seconds, {
                          message.total_tokens
                        } tokens)
                      </span>
                    )}
                  </p>
                </div>

                {/* Retry Button */}
                {message.error &&
                  message.isRetryable &&
                  message.role === "user" && (
                    <button
                      onClick={onRetryMessage}
                      className="mt-2 self-start flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="Retry sending this message"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Retry
                    </button>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 3.2 ChatInterface Component Updates

```typescript
// components/chat/ChatInterface.tsx
export default function ChatInterface() {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
    lastFailedMessage,
  } = useChat();

  // ... existing code ...

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      {/* ... existing header ... */}

      {/* Messages Container */}
      <div className="flex-1 min-h-0">
        <MessageList
          messages={messages}
          isLoading={isLoading}
          onRetryMessage={retryLastMessage}
        />
      </div>

      {/* Global Error Display - Only for non-message specific errors */}
      {error && !lastFailedMessage && (
        <div className="px-4 sm:px-6 py-2">
          <ErrorDisplay
            message={error.message}
            type={error.code === "too_many_requests" ? "warning" : "error"}
            title={
              error.code === "too_many_requests" ? "Rate Limited" : "Error"
            }
            onClose={clearError}
            suggestions={error.suggestions}
            retryAfter={error.retryAfter}
            code={error.code}
          />
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <MessageInput
          onSendMessage={(message) => sendMessage(message, selectedModel)}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}
```

### 4. Implementation Steps

#### Phase 1: Data Structure Updates

1. Update `ChatMessage` interface to include error and retry fields
2. Update `useChat` hook to track `lastFailedMessage` state
3. Add `retryLastMessage` function to hook interface

#### Phase 2: Hook Logic Implementation

1. Modify `sendMessage` function to handle error states properly
2. Implement `retryLastMessage` function
3. Add logic to invalidate previous failed messages when new message is sent
4. Update error handling to store errors in message objects

#### Phase 3: UI Updates

1. Update `MessageList` to display error icons on failed messages
2. Add retry button component for failed messages
3. Style error states with appropriate visual indicators
4. Update `ChatInterface` to pass retry functionality to components

#### Phase 4: Testing & Refinement

1. Test retry functionality with various error scenarios
2. Ensure proper state management when switching between messages
3. Verify error indicators are displayed correctly
4. Test edge cases (multiple rapid sends, network issues, etc.)

### 5. Error Handling Strategy

#### Error Categories

1. **Network Errors**: Connection issues, timeout
2. **API Errors**: Rate limiting, invalid requests
3. **Server Errors**: Backend failures, service unavailable
4. **Validation Errors**: Invalid message format

#### Visual Indicators

- **Error Icon**: Red warning triangle on message bubble
- **Border**: Red border around failed message bubble
- **Retry Button**: Small retry icon with text below message
- **Hover States**: Interactive feedback for retry button

### 6. User Experience Considerations

#### Accessibility

- Proper ARIA labels for retry buttons
- Screen reader announcements for error states
- Keyboard navigation support for retry functionality

#### Performance

- Debounce rapid retry attempts
- Prevent multiple simultaneous retries
- Clean up error states when messages are cleared

#### Edge Cases

- Handle offline/online state changes
- Manage retry attempts limit
- Clear retry state on component unmount
- Handle concurrent message sending

### 7. Configuration Options

#### Retry Behavior

```typescript
interface RetryConfig {
  maxRetries: number; // Maximum retry attempts (default: 3)
  retryDelay: number; // Delay between retries in ms (default: 1000)
  showRetryButton: boolean; // Show/hide retry button (default: true)
  autoRetry: boolean; // Auto-retry on failure (default: false)
}
```

## Success Criteria

1. ✅ Only the last sent message can be retried
2. ✅ Error icon appears on failed message bubbles
3. ✅ Retry button appears below the last failed message
4. ✅ Successful retry removes error indicators and shows response
5. ✅ New message sending invalidates previous retry options
6. ✅ Error states are properly managed and don't conflict with global errors
7. ✅ UI is responsive and accessible
8. ✅ Edge cases are handled gracefully

## Future Enhancements

1. **Retry History**: Track retry attempts and show count
2. **Retry Queue**: Allow multiple failed messages to be retried
3. **Auto-Retry**: Automatic retry with exponential backoff
4. **Partial Retry**: Retry only failed parts of multi-part messages
5. **Retry Analytics**: Track retry success/failure rates

---

This specification provides a comprehensive plan for implementing the retry functionality while maintaining good user experience and code quality. The implementation follows React best practices and integrates seamlessly with the existing codebase.
