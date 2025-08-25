# Streaming vs Non-Streaming Retry UI Inconsistency

## Issue Summary

The "Try again" button behaves differently between streaming and non-streaming modes when retrying failed messages, creating an inconsistent user experience.

## Current Behavior

### Non-Streaming Mode (`/api/chat`) ✅ **Expected Behavior**

- When a message fails with an error (e.g., "429 Too Many Requests")
- User clicks "Try again" button
- **The same errored green bubble message is retried** (no new bubble created)
- The existing message content gets replaced with the retry response
- Clean, consistent UI - no duplicate messages

### Streaming Mode (`/api/chat/stream`) ❌ **Inconsistent Behavior**

- When a message fails with an error
- User clicks "Try again" button
- **A new green bubble message is created**
- Results in duplicate user messages in the conversation
- Inconsistent with non-streaming behavior

## Evidence

Screenshot shows the "Try again" button appearing after an OpenRouter API 429 error in the chat interface.

## Expected Fix

Streaming mode should match non-streaming behavior:

1. When "Try again" is clicked in streaming mode
2. The retry should **reuse the existing errored message bubble**
3. Not create a new duplicate message
4. Maintain UI consistency across both modes

## Technical Context

This appears to be a difference in how the retry logic is implemented:

- **Non-streaming**: Likely updates the existing message in place
- **Streaming**: Creates a new message instead of reusing the errored one

## Impact

- **User Experience**: Confusing inconsistency between modes
- **Message History**: Cluttered with duplicate retry attempts in streaming mode
- **UI Polish**: Inconsistent behavior reduces app quality perception

## Priority

**Medium** - UI/UX consistency issue that affects user experience but doesn't break core functionality.

## Proposed Solution Areas

1. **Frontend Retry Logic** (`hooks/useChatStreaming.ts`)

   - Modify `retryLastMessage` to reuse existing message instead of creating new one
   - Align streaming retry behavior with non-streaming implementation

2. **Message State Management**

   - Ensure streaming mode updates existing message state during retry
   - Maintain consistent message ID handling across retry attempts

3. **UI Components**
   - Verify retry button triggers consistent behavior regardless of streaming mode
   - Test retry functionality across both modes for parity

## Testing Checklist

- [ ] Test retry in non-streaming mode (baseline behavior)
- [ ] Test retry in streaming mode (current inconsistent behavior)
- [ ] Implement fix for streaming mode retry
- [ ] Verify both modes now behave identically
- [ ] Test multiple retry attempts don't create excessive duplicates
- [ ] Verify error states are handled consistently in both modes

## Related Files

- `hooks/useChatStreaming.ts` - Streaming chat logic and retry implementation
- `hooks/useChat.ts` - Non-streaming chat logic (reference implementation)
- `components/chat/MessageList.tsx` - Message display and retry button rendering
- `src/app/api/chat/route.ts` - Non-streaming endpoint
- `src/app/api/chat/stream/route.ts` - Streaming endpoint

---

**Status**: Open  
**Created**: August 25, 2025  
**Labels**: bug, ui/ux, streaming, consistency  
**Milestone**: UI Polish & Consistency
