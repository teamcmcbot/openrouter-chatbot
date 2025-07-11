# Chat History Feature Specification

## Feature Overview

The chat history feature enables users to:

- Automatically persist conversations across browser sessions
- Access and switch between multiple chat conversations
- View conversation metadata (message count, timestamp, model used)
- Edit conversation titles for better organization
- Delete conversations when no longer needed
- Resume conversations from any point in history

## Current Implementation Analysis

### Data Flow

1. **useChat Hook**: Manages current conversation state with `ChatMessage[]`
2. **ChatMessage Interface**: Contains rich metadata (model, completion_id, tokens, etc.)
3. **ChatInterface Component**: Orchestrates chat functionality
4. **ChatSidebar Component**: Shows fake static history data
5. **MessageList Component**: Renders messages with model/generation clicking

### Current ChatMessage Structure

```typescript
interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
  model?: string;
  contentType?: "text" | "markdown";
  completion_id?: string;
  error?: boolean;
}
```

### Current Limitations

- No persistence - conversations lost on page refresh
- Fake static chat history in sidebar
- No way to switch between conversations
- No conversation management (create/delete/rename)

## Proposed Solution

### Key Workflows

#### New Chat Button Workflow

1. **State Clearing**: Clear current ChatInterface messages and loading state
2. **Conversation Creation**: Create new conversation entry with temporary title
3. **Sidebar Update**: Add new conversation to ChatSidebar (sorted to top)
4. **ModelDetailsSidebar Reset**: Clear any generation data from previous conversation
5. **Active State**: Set new conversation as active
6. **First Message**: Auto-generate title from first user message

#### Conversation Loading Workflow

1. **Conversation Selection**: User clicks on conversation in ChatSidebar
2. **State Loading**: Load complete message history with all metadata
3. **Interface Update**: Replace current ChatInterface content
4. **Sidebar Highlighting**: Highlight selected conversation as active
5. **ModelDetailsSidebar Context**: Update with loaded conversation's generation data
6. **Scroll Position**: Reset to bottom of loaded conversation

#### State Isolation Requirements

- **Clean Transitions**: No data leakage between conversations
- **ModelDetailsSidebar**: Clear generation IDs, pricing data, and hover states
- **Message Selection**: Reset any selected/highlighted messages
- **Error States**: Clear any conversation-specific errors
- **Loading States**: Reset loading indicators appropriately

### New Data Structures

#### Chat Conversation

```typescript
interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  totalTokens: number;
  lastModel?: string;
  isActive: boolean;
  lastMessagePreview?: string; // Last message content snippet for sidebar
  lastMessageTimestamp?: Date; // Timestamp of most recent message
}
```

#### Chat History Manager

```typescript
interface ChatHistoryState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  lastConversationId: string | null;
}
```

### Architecture Changes

1. **Enhanced useChat Hook**:

   - Add conversation management
   - Integrate with localStorage
   - Handle conversation switching

2. **New useChatHistory Hook**:

   - Manage multiple conversations
   - Persist to localStorage
   - Provide conversation CRUD operations

3. **Updated ChatSidebar**:

   - Display real conversation history
   - Handle conversation selection
   - Support edit/delete operations

4. **Enhanced ChatInterface**:

   - Support conversation switching
   - Auto-save active conversation
   - Handle new conversation creation
   - **New Chat functionality**: Clear current interface and start fresh conversation
   - **State isolation**: Ensure ModelDetailsSidebar generation data is cleared on new chat

5. **New Chat Button Integration**:

   - Clear current ChatInterface messages and state
   - Create new conversation entry in history
   - Reset ModelDetailsSidebar to remove previous generation data
   - Update ChatSidebar to show new conversation snippet
   - Maintain conversation sorting (most recent first)

6. **Conversation Loading**:
   - Load entire chat history when clicking historical conversations
   - Restore all message metadata (models, generation IDs, tokens)
   - Update ModelDetailsSidebar context for the loaded conversation
   - Set active conversation state properly

## Implementation Phases

### Phase 1: Core Data Persistence (Checkpoint 1)

**Goal**: Basic conversation persistence without UI changes

#### Subtasks:

1. **Create ChatConversation type** (30 min)

   - Define interface in `lib/types/chat.ts`
   - Add utility functions for conversation creation

2. **Create useChatHistory hook** (1 hour)

   - Basic CRUD operations for conversations
   - localStorage integration using existing useLocalStorage
   - Conversation state management

3. **Update useChat hook** (1 hour)

   - Integrate with useChatHistory
   - Auto-save messages to active conversation
   - Handle conversation loading
   - **Add conversation isolation**: Ensure clean state when switching conversations

4. **Implement New Chat functionality** (45 min)

   - Create `createNewConversation` function in useChatHistory
   - Add conversation state clearing in useChat
   - Ensure ModelDetailsSidebar state resets on new conversation
   - Handle automatic conversation titling for new chats

5. **Testing** (30 min)
   - Verify persistence works
   - Test conversation creation/loading
   - **Test New Chat button**: Verify clean state transition
   - Ensure existing functionality unaffected

**Checkpoint**: Conversations persist but UI still shows fake data

### Phase 2: Conversation Management (Checkpoint 2)

**Goal**: Full conversation switching and management

#### Subtasks:

1. **Update ChatInterface for conversation management** (1 hour)

   - Add conversation switching logic
   - Handle new conversation creation
   - Update existing message flow
   - **Integrate New Chat button**: Connect button to conversation creation
   - **State management**: Clear ModelDetailsSidebar when starting new conversation

2. **Implement conversation loading from sidebar** (1 hour)

   - Handle conversation selection from ChatSidebar
   - Load complete message history with metadata
   - Restore conversation context in all components
   - Update ModelDetailsSidebar with loaded conversation data

3. **Implement conversation loading from sidebar** (1 hour)

   - Handle conversation selection from ChatSidebar
   - Load complete message history with metadata
   - Restore conversation context in all components
   - Update ModelDetailsSidebar with loaded conversation data

4. **Enhance useChatHistory with advanced features** (45 min)

   - Conversation title auto-generation
   - Conversation metadata calculation
   - Conversation sorting and filtering
   - **Real-time conversation snippets**: Generate preview text for sidebar

5. **Add conversation state to ChatInterface** (30 min)

   - Track active conversation
   - Handle conversation switching
   - Update header to show conversation info
   - **Active conversation highlighting**: Visual indicator in sidebar

6. **Testing** (30 min)
   - Test conversation switching
   - Verify message persistence
   - Test new conversation creation
   - **Test New Chat workflow**: Full end-to-end new chat creation
   - **Test conversation loading**: Verify complete state restoration

**Checkpoint**: Users can create and switch conversations

### Phase 3: Real Chat History UI (Checkpoint 3)

**Goal**: Replace fake history with real data

#### Subtasks:

1. **Update ChatSidebar to use real data** (1 hour)

   - Replace fake chatHistory with real conversations
   - Update conversation display logic
   - Handle conversation selection
   - **Implement conversation sorting**: Most recent conversations first
   - **Real-time updates**: Show new conversation snippets immediately
   - **Active conversation highlighting**: Visual indicator for current conversation

2. **Implement conversation clicking functionality** (45 min)

   - Handle conversation selection from sidebar
   - Load complete conversation into ChatInterface
   - Restore all message metadata and generation data
   - Clear and update ModelDetailsSidebar appropriately

3. **Implement conversation editing** (45 min)

   - Real title editing functionality
   - Conversation deletion
   - Confirmation dialogs for destructive actions

4. **Add conversation metadata display** (30 min)

   - Show real message counts
   - Display last message preview
   - Show model information and token usage
   - **Show conversation timestamps**: Relative time display (Today, Yesterday, etc.)

5. **Update conversation item styling** (30 min)
   - Highlight active conversation
   - Show conversation status (loading, error)
   - Improve visual hierarchy
   - **New conversation visual treatment**: Special styling for fresh conversations

**Checkpoint**: ChatSidebar shows real conversation history

### Phase 4: Enhanced Features (Checkpoint 4)

**Goal**: Advanced conversation management features

#### Subtasks:

1. **Smart conversation titles** (45 min)

   - Auto-generate titles from first user message
   - Fallback to timestamp-based titles
   - Title truncation and formatting

2. **Conversation search and filtering** (1 hour)

   - Search conversations by title/content
   - Filter by date range or model
   - Sort by various criteria

3. **Conversation export/import** (1 hour)

   - Export conversations as JSON/Markdown
   - Import conversation history
   - Bulk operations (delete multiple)

4. **Performance optimizations** (45 min)
   - Lazy load conversation messages
   - Implement conversation pagination
   - Optimize localStorage operations

**Checkpoint**: Feature-complete chat history system

### Phase 5: Advanced Metadata Integration (Checkpoint 5)

**Goal**: Deep integration with existing model/generation features

#### Subtasks:

1. **Enhanced conversation metadata** (45 min)

   - Track model usage statistics per conversation
   - Store generation IDs and link to pricing
   - Calculate conversation costs

2. **Conversation analytics** (1 hour)

   - Token usage per conversation
   - Model performance comparison
   - Conversation duration tracking

3. **Integration with ModelDetailsSidebar** (30 min)

   - Show conversation-specific model usage
   - Link generation IDs to conversations
   - Enhanced pricing display

4. **Conversation templates** (45 min)
   - Save conversations as templates
   - Quick-start conversation types
   - Template sharing functionality

**Checkpoint**: Full metadata integration complete

## Technical Considerations

### ModelDetailsSidebar State Management

#### State Isolation Between Conversations

- **Generation Data Clearing**: Clear generationId, hoveredGenerationId, and scrollToCompletionId when switching conversations
- **Model Context**: Update model information to match the loaded conversation context
- **Pricing Data**: Clear any pricing calculations from previous conversation
- **Sidebar Tab State**: Reset to default tab when loading new conversation

#### State Restoration for Loaded Conversations

- **Generation ID Mapping**: Restore generation IDs from loaded conversation messages
- **Model Information**: Update sidebar with models used in the loaded conversation
- **Interactive Elements**: Ensure generation clicking and hovering work with loaded data
- **Pricing Context**: Calculate pricing data for the loaded conversation

#### New Chat State Handling

- **Complete Reset**: Clear all ModelDetailsSidebar state when creating new conversation
- **Default State**: Return to default model selection and overview tab
- **Clean Slate**: No generation data, pricing info, or conversation-specific metadata

### Data Storage Strategy

- **localStorage**: Primary storage for conversation history
- **Session persistence**: Maintain active conversation across tabs
- **Data migration**: Handle schema changes gracefully
- **Size limits**: Implement conversation pruning for storage limits

### Performance Optimizations

- **Lazy loading**: Load conversation messages on demand
- **Debounced saving**: Avoid excessive localStorage writes
- **Memory management**: Unload inactive conversation messages
- **Caching**: Cache frequently accessed conversations

### Error Handling

- **Storage failures**: Graceful degradation when localStorage fails
- **Data corruption**: Recovery mechanisms for corrupted data
- **Migration errors**: Fallback to default state if migration fails
- **Sync conflicts**: Handle multiple tab scenarios

### Security Considerations

- **Data sanitization**: Ensure conversation data is properly sanitized
- **Size validation**: Prevent localStorage overflow attacks
- **XSS prevention**: Sanitize conversation titles and content
- **Privacy**: Consider conversation data sensitivity

## API Extensions (Future)

### Backend Integration Points

- **Conversation sync**: Sync conversations across devices
- **Conversation sharing**: Share conversations with other users
- **Conversation backup**: Cloud backup for conversation history
- **Conversation analytics**: Server-side conversation analytics

### Webhook Integration

- **Conversation events**: Trigger webhooks on conversation actions
- **Model usage tracking**: Track model usage across conversations
- **Cost tracking**: Monitor API costs per conversation

## Success Metrics

### User Experience

- **Conversation retention**: 90%+ of conversations should persist correctly
- **Loading performance**: Conversation switching under 200ms
- **Data integrity**: 99.9% data consistency across sessions

### Technical Metrics

- **Storage efficiency**: Optimal localStorage usage
- **Memory usage**: Minimal memory footprint for inactive conversations
- **Error rates**: < 1% conversation operation failures

## Migration Strategy

### Backwards Compatibility

- **Graceful degradation**: App works without stored conversations
- **Data migration**: Smooth transition from single to multi-conversation
- **Feature flags**: Gradual rollout of conversation features

### Deployment Plan

1. **Phase 1-2**: Internal testing with existing conversation state
2. **Phase 3**: Beta release with real conversation history
3. **Phase 4-5**: Full feature rollout with advanced capabilities

## Dependencies

### Existing Code

- `useLocalStorage` hook (already implemented)
- `ChatMessage` interface (may need extensions)
- `useChat` hook (will be significantly modified)
- `ChatSidebar` component (will be rewritten)

### New Dependencies

- UUID generation for conversation IDs
- Date manipulation utilities
- Storage compression (if needed for large conversations)
- Debouncing utilities for auto-save

## Testing Strategy

### Unit Tests

- Conversation CRUD operations
- localStorage persistence
- Data migration scenarios
- Error handling edge cases
- **New Chat functionality**: Conversation creation and state clearing
- **ModelDetailsSidebar state**: Generation data clearing and restoration

### Integration Tests

- Conversation switching workflow
- Message persistence across conversations
- UI state management during operations
- **New Chat workflow**: End-to-end new conversation creation
- **Conversation loading**: Complete state restoration from sidebar
- **ModelDetailsSidebar integration**: State synchronization with conversations

### E2E Tests

- Complete conversation lifecycle
- Cross-tab conversation synchronization
- Performance under large conversation loads
- **New Chat button**: Full user workflow testing
- **Conversation sidebar**: Click-to-load conversation testing
- **State isolation**: Verify no data leakage between conversations

## Risk Assessment

### High Risk

- **Data loss**: Conversation data corruption or loss
- **Performance degradation**: Large conversation history affecting app performance
- **Storage limitations**: localStorage size limits affecting functionality

### Medium Risk

- **UI complexity**: Conversation management adding too much UI complexity
- **Migration issues**: Problems migrating from single to multi-conversation
- **Cross-tab sync**: Synchronization issues across multiple tabs

### Low Risk

- **Feature adoption**: Users not utilizing conversation history features
- **Storage compatibility**: Browser localStorage compatibility issues

## Conclusion

This comprehensive chat history feature will transform the application from a single-session chat tool into a full-featured conversation management system. The phased approach ensures that each checkpoint provides a stable, testable milestone while building toward the complete feature set.

The implementation preserves all existing functionality while adding powerful conversation management capabilities that leverage the rich metadata already being captured in the ChatMessage structure.
