# Conditional Reasoning Display Enhancement

**Status**: Planning  
**Priority**: Medium  
**Component**: Frontend ChatInterface + MessageList  
**Created**: 2025-01-27

## Issue Description

Currently, the reasoning display in MessageList shows "Initializing AI reasoning..." whenever streaming is enabled, regardless of whether reasoning mode is actually enabled or not. The user wants conditional behavior:

1. **When reasoning is enabled**: Show reasoning blocks normally with "Initializing AI reasoning..." state
2. **When reasoning is disabled**: Don't show reasoning blocks at all, even if streaming
3. **When models send reasoning anyway**: Show reasoning after receiving the first chunk, even if reasoning wasn't enabled

## Current Implementation Analysis

### Data Flow Understanding

```typescript
// 1. User toggles reasoning in MessageInput.tsx
const [reasoningOn, setReasoningOn] = useState(false);

// 2. MessageInput passes reasoning to sendMessage
onSendMessage(message.trim(), {
  webSearch: webSearchOn,
  reasoning: reasoningOn ? { effort: "low" } : undefined,
});

// 3. ChatInterface calls useChatStreaming hook
sendMessage(message, selectedModel, options);

// 4. useChatStreaming processes options
const sendMessage = useCallback(
  async (content, model, options?: { reasoning?: { effort } }) => {
    // Sends to /api/chat/stream with reasoning in body
  }
);

// 5. Backend receives and processes reasoning
const reasoning =
  body?.reasoning && typeof body.reasoning === "object"
    ? { effort: body.reasoning.effort || "low" }
    : undefined;

// 6. Streaming reasoning data flows back to frontend
setStreamingReasoning((prev) => prev + reasoningData.data);

// 7. ChatInterface passes to MessageList
<MessageList streamingReasoning={streamingReasoning} />;
```

### Current MessageList Reasoning Display Logic

```typescript
// Line ~490: Streaming reasoning section
{
  isStreaming && (
    <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-300/80 dark:border-slate-500/60 rounded-lg">
      <div className="flex items-center space-x-2 mb-2">
        <LightBulbIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Technical Details
        </h4>
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
        {streamingReasoning.length > 0
          ? streamingReasoning
          : "Initializing AI reasoning..."}
      </div>
    </div>
  );
}
```

**Problem**: This shows for ALL streaming messages, regardless of reasoning enablement.

## Required Changes

### Phase 1: Track Reasoning Intent

**Requirement**: Pass reasoning enablement state to MessageList

```typescript
// 1. MessageInput.tsx - Already working (reasoningOn state)
// No changes needed

// 2. ChatInterface.tsx - Add reasoning enablement tracking
const [lastReasoningEnabled, setLastReasoningEnabled] = useState<boolean>(false);

// Update sendMessage handler to track reasoning state
onSendMessage={(message, options) => {
  setLastReasoningEnabled(!!options?.reasoning);
  sendMessage(message, selectedModel, options);
}}

// Pass to MessageList
<MessageList
  // ... existing props
  reasoningEnabled={lastReasoningEnabled}
/>
```

**MessageList Props Interface Update**:

```typescript
interface MessageListProps {
  // ... existing props
  reasoningEnabled?: boolean; // NEW: Whether reasoning was enabled for the last message
}
```

### Phase 2: Implement Conditional Display Logic

**Update MessageList.tsx reasoning display section**:

```typescript
// Current logic (line ~490)
{isStreaming && (
  // Always shows reasoning section
)}

// NEW conditional logic
{isStreaming && reasoningEnabled && (
  <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-300/80 dark:border-slate-500/60 rounded-lg">
    <div className="flex items-center space-x-2 mb-2">
      <LightBulbIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Technical Details
      </h4>
    </div>
    <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
      {streamingReasoning.length > 0 ? streamingReasoning : "Initializing AI reasoning..."}
    </div>
  </div>
)}

// NEW: Handle models that send reasoning anyway (after first chunk)
{isStreaming && !reasoningEnabled && streamingReasoning.length > 0 && (
  <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-300/80 dark:border-slate-500/60 rounded-lg">
    <div className="flex items-center space-x-2 mb-2">
      <LightBulbIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Technical Details
      </h4>
    </div>
    <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
      {streamingReasoning}
    </div>
  </div>
)}
```

### Phase 3: Test Coverage Update

**Update existing test file**: `tests/components/chat/MessageList.reasoning.render.test.tsx`

Add new test cases:

```typescript
describe("conditional reasoning display", () => {
  it("shows reasoning section when streaming and reasoning enabled", () => {
    // reasoningEnabled=true, isStreaming=true -> should show
  });

  it("hides reasoning section when streaming but reasoning disabled", () => {
    // reasoningEnabled=false, isStreaming=true -> should not show
  });

  it("shows reasoning after first chunk when reasoning disabled but data received", () => {
    // reasoningEnabled=false, but streamingReasoning="some data" -> should show
  });
});
```

## Implementation Complexity

### ✅ **Simple Changes** (Low Risk)

- MessageList prop interface update
- ChatInterface reasoning tracking state
- Conditional display logic in JSX

### ⚠️ **Medium Complexity** (Requires Testing)

- State synchronization between MessageInput → ChatInterface → MessageList
- Handling edge cases where reasoning data arrives unexpectedly

### 🔴 **Considerations**

- **Performance**: Additional state tracking is minimal overhead
- **UX Consistency**: Must ensure reasoning state resets between messages
- **Edge Cases**: Models that always send reasoning regardless of request

## Testing Strategy

1. **Manual Testing**:

   - Enable reasoning → send message → should see "Initializing AI reasoning..."
   - Disable reasoning → send message → should not see reasoning section
   - Use model that sends reasoning anyway → should show after first chunk

2. **Automated Testing**:

   - Update existing reasoning render tests
   - Add conditional display test cases
   - Verify prop passing through component tree

3. **Integration Testing**:
   - Test with various models (reasoning-capable vs non-reasoning)
   - Test reasoning toggle state persistence across messages

## User Impact

### ✅ **Benefits**

- Cleaner UI when reasoning is not needed
- Reduced visual noise for non-reasoning workflows
- Better handling of models with unexpected reasoning data

### ⚠️ **Potential Issues**

- Users might be confused if reasoning appears unexpectedly
- Need clear indication when reasoning data comes from model vs user request

## Implementation Phases

### Phase 1: State Tracking ⏱️ 30 minutes

- [ ] Add `reasoningEnabled` prop to MessageListProps interface
- [ ] Update ChatInterface to track reasoning state from last message
- [ ] Pass reasoning state to MessageList component

### Phase 2: Conditional Logic ⏱️ 45 minutes

- [ ] Update MessageList reasoning display conditions
- [ ] Implement "reasoning enabled" vs "reasoning disabled but data received" logic
- [ ] Test manual scenarios with different reasoning states

### Phase 3: Test Coverage ⏱️ 30 minutes

- [ ] Update existing reasoning tests for new conditional behavior
- [ ] Add test cases for reasoning enabled/disabled scenarios
- [ ] Verify tests pass with `npm test`

### Phase 4: User Verification ⏱️ 15 minutes

- [ ] **USER TEST**: Enable reasoning mode → verify reasoning section appears
- [ ] **USER TEST**: Disable reasoning mode → verify reasoning section hidden
- [ ] **USER TEST**: Use reasoning-capable model with reasoning disabled → verify conditional appearance

**Total Estimated Time**: ~2 hours

## Dependencies

- No external dependencies
- Requires understanding of React prop passing
- Builds on existing reasoning display implementation

## Success Criteria

1. **Reasoning Enabled**: Shows "Initializing AI reasoning..." during streaming
2. **Reasoning Disabled**: No reasoning section appears during streaming
3. **Unexpected Reasoning Data**: Shows reasoning after first chunk received
4. **Tests Pass**: All existing and new tests validate correctly
5. **No Regressions**: Existing reasoning functionality unchanged when enabled

---

**Implementation Status**: ✅ **READY** - All requirements analyzed, changes identified, complexity assessed
