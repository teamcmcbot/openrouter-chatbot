# Context-Aware Chat Implementation Plan

_Human-Verified Checkpoint-Based Development_

## Current State Analysis

Based on the codebase analysis, here's the current implementation:

### Current Architecture

- **State Management**: Zustand with `useChatStore` managing conversations and messages
- **API Structure**: Single user message sent to `/api/chat` → OpenRouter API
- **Message Format**: Current request body: `{ message: string, model?: string }`
- **Token Limits**: Fixed `OPENROUTER_MAX_TOKENS=1000` for ALL models
- **Context Length**: Models have varying context lengths (e.g., 8K-2M+ tokens)

### Current OpenRouter API Call

```typescript
// Current implementation in lib/utils/openrouter.ts
const messages: OpenRouterRequest["messages"] = [
  { role: "user", content: data!.message },
]; // Only single message!
```

### Current Limitations

1. **Stateless Conversations**: Each API call is independent
2. **No Context Memory**: LLM doesn't know previous conversation
3. **Fixed Token Limits**: Same max_tokens for all models regardless of context length
4. **Inefficient Token Usage**: Not utilizing available context window

---

## Implementation Strategy

### Phase 1: Context Message Selection & Token Management

#### 1.1 Message History Selection

**Strategy**: Include conversation history in OpenRouter API calls

**How Previous Messages Will Be Sent**:

- **Format**: As separate message objects in the `messages` array (OpenRouter standard)
- **NOT as SYSTEM messages** - we'll use the standard user/assistant pattern
- **Structure**:

```typescript
// NEW format
const messages: OpenRouterRequest["messages"] = [
  { role: "user", content: "What is React?" },
  { role: "assistant", content: "React is a JavaScript library..." },
  { role: "user", content: "How do I use hooks?" }, // Most recent
];
```

**Default Configuration**:

- **Last 5 conversation pairs** (5 user + 5 assistant = up to 10 messages)
- **Configurable via environment**: `CONTEXT_MESSAGE_PAIRS=5`
- **Progressive fallback**: If token limit exceeded, reduce to 4, 3, 2, 1, then 0 pairs

#### 1.2 Dynamic Token Management

**Problem**: Current `OPENROUTER_MAX_TOKENS=1000` is inefficient

**Solution**: Model-aware token allocation

```typescript
// NEW token management strategy
interface TokenStrategy {
  contextRatio: number; // % of model's context for input (0.6 = 60%)
  outputRatio: number; // % of model's context for output (0.4 = 40%)
  reserveTokens: number; // Buffer for safety (100-200 tokens)
}

const DEFAULT_TOKEN_STRATEGY: TokenStrategy = {
  contextRatio: 0.6, // 60% for context
  outputRatio: 0.4, // 40% for response
  reserveTokens: 150, // Safety buffer
};
```

**Example Calculations**:

- **GPT-4o** (128K context): 60% = ~77K input, 40% = ~51K output
- **DeepSeek R1** (64K context): 60% = ~38K input, 40% = ~26K output
- **Small models** (8K context): 60% = ~5K input, 40% = ~3K output

#### 1.3 Token Estimation

**Challenge**: Estimate token count before API call

**Solution**: Approximate token counting utility

```typescript
// lib/utils/tokens.ts (NEW FILE)
export function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token for English
  // More accurate would be using tiktoken, but adds bundle size
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  const contentTokens = messages.reduce(
    (total, msg) => total + estimateTokenCount(msg.content),
    0
  );

  // Add overhead for message structure (~3-5 tokens per message)
  const structureTokens = messages.length * 4;

  return contentTokens + structureTokens;
}
```

### Phase 2: Context Window Optimization

#### 2.1 Model-Specific Context Limits

**Implementation**: Use model data for intelligent token allocation

```typescript
// stores/useChatStore.ts - ENHANCED sendMessage
async sendMessage(content: string, model?: string) {
  const modelInfo = useModelStore.getState().getModelById(model);
  const contextLength = modelInfo?.context_length || 8000; // fallback

  const strategy = calculateTokenStrategy(contextLength);
  const availableContextTokens = strategy.maxInputTokens;

  const conversationHistory = this.getContextMessages(availableContextTokens);

  const messages = [...conversationHistory, newUserMessage];

  // Send to API with dynamic max_tokens
  await getOpenRouterCompletion(messages, model, strategy.maxOutputTokens);
}
```

#### 2.2 Intelligent Message Selection

**Algorithm**: Fit as many recent messages as possible within token budget

```typescript
// NEW function in useChatStore.ts
getContextMessages(maxTokens: number): ChatMessage[] {
  const conversation = this.getCurrentConversation();
  if (!conversation || conversation.messages.length <= 1) return [];

  const messages = conversation.messages.slice(0, -1); // Exclude current user message
  const selectedMessages: ChatMessage[] = [];
  let tokenCount = 0;

  // Start from most recent and work backwards
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = estimateTokenCount(message.content) + 4; // structure overhead

    if (tokenCount + messageTokens > maxTokens) {
      break; // Would exceed limit
    }

    selectedMessages.unshift(message); // Add to beginning
    tokenCount += messageTokens;
  }

  return selectedMessages;
}
```

### Phase 3: API Integration Updates

#### 3.1 Enhanced OpenRouter Client

**File**: `lib/utils/openrouter.ts`

```typescript
// ENHANCED function signature
export async function getOpenRouterCompletion(
  messages: OpenRouterRequest["messages"],
  model?: string,
  maxTokens?: number // NEW: dynamic max tokens
): Promise<OpenRouterResponse> {
  const selectedModel = model ?? OPENROUTER_API_MODEL;
  const dynamicMaxTokens =
    maxTokens ?? parseInt(process.env.OPENROUTER_MAX_TOKENS || "1000");

  const requestBody: OpenRouterRequest = {
    model: selectedModel,
    messages, // NOW: Full conversation history
    max_tokens: dynamicMaxTokens, // NOW: Model-aware limit
    temperature: 0.7,
  };

  // ... rest of implementation
}
```

#### 3.2 Chat API Endpoint Updates

**File**: `src/app/api/chat/route.ts`

```typescript
// ENHANCED to accept conversation context
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = validateChatRequest(body);

  // NEW: Support for message history
  const messages: OpenRouterRequest["messages"] = data!.messages || [
    { role: "user", content: data!.message },
  ];

  const modelInfo = await getModelInfo(data!.model); // NEW: Fetch model data
  const maxTokens = calculateOutputTokens(modelInfo); // NEW: Dynamic calculation

  const openRouterResponse = await getOpenRouterCompletion(
    messages,
    data!.model,
    maxTokens // NEW: Dynamic max tokens
  );

  // ... rest unchanged
}
```

### Phase 4: Configuration & Settings

#### 4.1 Environment Variables

**File**: `.env.example`

```bash
# Context-aware chat settings
CONTEXT_MESSAGE_PAIRS=5
CONTEXT_RATIO=0.6
OUTPUT_RATIO=0.4
RESERVE_TOKENS=150
ENABLE_CONTEXT_AWARE=true

# Legacy fallback (kept for compatibility)
OPENROUTER_MAX_TOKENS=1000
```

#### 4.2 User-Configurable Settings

**Future Enhancement**: Settings store for user preferences

```typescript
// stores/useSettingsStore.ts (FUTURE)
interface ContextSettings {
  maxMessagePairs: number; // 1-10 range
  contextRatio: number; // 0.4-0.8 range
  enableSummarization: boolean; // Phase 2 feature
}
```

### Phase 5: Summarization Strategy (Advanced)

#### 5.1 When to Summarize

**Trigger Conditions**:

1. Conversation exceeds 20 message pairs
2. Token estimation suggests context truncation
3. User manually requests summarization

#### 5.2 Summarization Approaches

**Option 1**: LLM-based summarization (recommended)

```typescript
// Use the same model to summarize older conversation
const summaryPrompt = `Summarize this conversation in 2-3 sentences, focusing on key topics and decisions: ${oldMessages}`;
```

**Option 2**: Template-based summarization (fallback)

```typescript
// Extract key topics and decisions programmatically
const summary = generateTemplateSummary(oldMessages);
```

#### 5.3 Summary Storage

**Implementation**: Store summaries in conversation metadata

```typescript
// Enhanced Conversation interface
interface Conversation {
  // ... existing fields
  summary?: string; // NEW: Conversation summary
  summarizedUpTo?: number; // NEW: Last message index included in summary
  summaryTokens?: number; // NEW: Token count of summary
}
```

---

## Implementation Roadmap with Checkpoints

### 🏗️ Phase 1: Token Management Foundation

**Goal**: Create token estimation and model-aware calculation utilities
**Verification**: Console logs showing accurate token calculations

#### Task 1.1: Create Token Estimation Utilities

**File**: `lib/utils/tokens.ts` (NEW)

- [x] Create `estimateTokenCount(text: string)` function
- [x] Create `estimateMessagesTokens(messages: ChatMessage[])` function
- [x] Add comprehensive unit tests for token estimation
- [x] Add console logging to verify estimation accuracy
- [x] **Human Verification**: Check console logs showing token estimates vs actual API usage

#### Task 1.2: Add Model-Aware Token Strategy

**File**: `lib/utils/tokens.ts`

- [x] Create `TokenStrategy` interface
- [x] Implement `calculateTokenStrategy(contextLength: number)` function
- [x] Add `getModelTokenLimits(modelId: string)` function using model store
- [x] Add debug logging for token allocation decisions
- [x] **Human Verification**: Console logs showing different token allocations per model

#### Task 1.3: Update Environment Configuration

**Files**: `.env.example` and `.env.local`

- [x] Add `CONTEXT_MESSAGE_PAIRS=5` (default conversation pairs to include)
- [x] Add `CONTEXT_RATIO=0.6` (60% for input context)
- [x] Add `OUTPUT_RATIO=0.4` (40% for output generation)
- [x] Add `RESERVE_TOKENS=150` (safety buffer)
- [x] Add `ENABLE_CONTEXT_AWARE=true` (feature flag)
- [x] Keep `OPENROUTER_MAX_TOKENS=1000` (legacy fallback)
- [x] **Human Verification**: Environment variables loaded correctly in development

**🛑 CHECKPOINT 1**: Token utilities working and tested
**Commit Message**: `feat: add token estimation utilities and model-aware strategy`

---

### 🔧 Phase 2: OpenRouter Client Enhancement

**Goal**: Update OpenRouter client to handle message arrays and dynamic tokens
**Verification**: API requests with conversation history in network tab

#### Task 2.1: Enhance OpenRouter Client Function

**File**: `lib/utils/openrouter.ts`

- [x] Update `getOpenRouterCompletion` signature to accept `maxTokens?: number`
- [x] Modify function to use dynamic `max_tokens` instead of fixed value
- [x] Add logging for request payload size and token allocation
- [x] Maintain backward compatibility with single message format
- [x] **Human Verification**: Network tab shows dynamic max_tokens in API requests

#### Task 2.2: Add Request Validation

**File**: `lib/utils/validation.ts`

- [x] Update `validateChatRequest` to accept optional `messages` array
- [x] Add validation for message array format
- [x] Ensure backward compatibility with single message requests
- [x] Add logging for request validation results
- [x] **Human Verification**: Both old and new request formats work correctly

**🛑 CHECKPOINT 2**: OpenRouter client accepts conversation arrays
**Commit Message**: `feat: enhance OpenRouter client for conversation context`

---

### 💬 Phase 3: Chat Store Context Selection

**Goal**: Implement intelligent message selection in chat store
**Verification**: Console logs showing selected context messages

#### Task 3.1: Add Context Selection Logic

**File**: `stores/useChatStore.ts`

- [ ] Create `getContextMessages(maxTokens: number)` method
- [ ] Implement backward message selection algorithm
- [ ] Add logic to preserve complete conversation pairs when possible
- [ ] Add extensive logging for context selection decisions
- [ ] **Human Verification**: Console shows which messages are included/excluded

#### Task 3.2: Integrate Token Calculation in sendMessage

**File**: `stores/useChatStore.ts`

- [ ] Modify `sendMessage` to calculate model-specific token limits
- [ ] Call `getContextMessages` to select appropriate history
- [ ] Build complete message array (context + new message)
- [ ] Add logging for total token usage and context decisions
- [ ] **Human Verification**: Console logs show token calculations before API calls

#### Task 3.3: Add Progressive Fallback Logic

**File**: `stores/useChatStore.ts`

- [ ] Implement context reduction when token limit exceeded
- [ ] Add fallback chain: 5→4→3→2→1→0 message pairs
- [ ] Log each fallback step for debugging
- [ ] Ensure system gracefully handles all edge cases
- [ ] **Human Verification**: Test with small models to trigger fallbacks

**🛑 CHECKPOINT 3**: Chat store selects appropriate context
**Commit Message**: `feat: add intelligent context selection to chat store`

---

### 🌐 Phase 4: API Endpoint Integration

**Goal**: Update chat API endpoint to accept and process conversation context
**Verification**: API requests include conversation history in payload

#### Task 4.1: Update Chat API Request Interface

**File**: `lib/types/chat.ts`

- [ ] Extend `ChatRequest` interface to include optional `messages` array
- [ ] Maintain backward compatibility with `message` string field
- [ ] Update JSDoc documentation for new interface
- [ ] Add TypeScript validation for new structure
- [ ] **Human Verification**: TypeScript compilation passes without errors

#### Task 4.2: Modify Chat API Endpoint

**File**: `src/app/api/chat/route.ts`

- [ ] Update request handling to accept both old and new formats
- [ ] Add logic to construct message array from context
- [ ] Integrate model-aware token calculation
- [ ] Pass dynamic max_tokens to OpenRouter client
- [ ] Add comprehensive logging for API request processing
- [ ] **Human Verification**: API responses include conversation context

#### Task 4.3: Update Frontend Chat Interface

**File**: `stores/useChatStore.ts` (sendMessage method)

- [ ] Modify API request to include conversation context
- [ ] Send complete message array to chat API endpoint
- [ ] Handle both success and error responses appropriately
- [ ] Add logging for frontend API interactions
- [ ] **Human Verification**: Network tab shows conversation history in requests

**🛑 CHECKPOINT 4**: End-to-end context-aware conversations working
**Commit Message**: `feat: implement full context-aware chat pipeline`

---

### 🧪 Phase 5: Testing & Validation

**Goal**: Comprehensive testing and edge case handling
**Verification**: All scenarios work correctly with proper logging

#### Task 5.1: Edge Case Testing

- [ ] Test with empty conversations (first message)
- [ ] Test with single message conversations
- [ ] Test with very long conversations (>10 pairs)
- [ ] Test with different model context lengths
- [ ] Test token limit exceeded scenarios
- [ ] **Human Verification**: All edge cases handled gracefully

#### Task 5.2: Model Compatibility Testing

- [ ] Test with free models (small context: 4K-8K)
- [ ] Test with medium models (moderate context: 16K-32K)
- [ ] Test with large models (large context: 64K-128K+)
- [ ] Verify token allocation works across all model types
- [ ] **Human Verification**: Context adapts appropriately per model

#### Task 5.3: Performance Validation

- [ ] Measure token estimation performance (<1ms per message)
- [ ] Verify context selection speed (<10ms for 20+ messages)
- [ ] Check memory usage doesn't increase significantly
- [ ] Monitor API response times for impact assessment
- [ ] **Human Verification**: No noticeable performance degradation

**🛑 CHECKPOINT 5**: Production-ready context-aware chat
**Commit Message**: `feat: context-aware chat fully tested and validated`

---

### 🚀 Phase 6: Advanced Features (Optional)

**Goal**: Enhanced features for better user experience
**Verification**: Advanced features work seamlessly

#### Task 6.1: Context Visualization (Optional)

**File**: `components/chat/ChatInterface.tsx`

- [ ] Add subtle UI indicator showing context inclusion
- [ ] Display token usage information in debug mode
- [ ] Show context truncation warnings when applicable
- [ ] **Human Verification**: UI clearly shows context status

#### Task 6.2: User Settings Integration (Future)

**File**: `stores/useSettingsStore.ts` (NEW)

- [ ] Create settings store for context preferences
- [ ] Add user controls for context message count
- [ ] Add toggle for context-aware mode
- [ ] **Human Verification**: Settings persist and affect behavior

#### Task 6.3: Conversation Summarization (Advanced)

**File**: `stores/useChatStore.ts`

- [ ] Implement LLM-based conversation summarization
- [ ] Add summary storage in conversation metadata
- [ ] Integrate summaries as context when needed
- [ ] **Human Verification**: Long conversations use summaries effectively

**🛑 CHECKPOINT 6**: All advanced features implemented
**Commit Message**: `feat: add advanced context management features`

---

## Verification Criteria for Each Phase

### Phase 1 Verification:

- [x] Console logs show accurate token estimates
- [x] Different models show different token allocations
- [x] Environment variables load correctly

### Phase 2 Verification:

- [x] Network tab shows dynamic max_tokens in requests
- [x] Both old and new request formats accepted
- [x] API requests maintain backward compatibility

### Phase 3 Verification:

- [ ] Console shows intelligent message selection
- [ ] Token calculations displayed before API calls
- [ ] Fallback logic triggers with small models

### Phase 4 Verification:

- [ ] API requests include conversation history
- [ ] TypeScript compilation passes
- [ ] End-to-end conversations maintain context

### Phase 5 Verification:

- [ ] All edge cases handle gracefully
- [ ] Performance remains acceptable
- [ ] All model types work correctly

### Phase 6 Verification:

- [ ] UI shows context status clearly
- [ ] Advanced features enhance user experience
- [ ] System remains stable with new features

## Human Coordinator Action Items

After each checkpoint, please:

1. **Review console logs** for verification criteria
2. **Test manually** with different conversation lengths
3. **Verify with different models** (free vs paid)
4. **Check network requests** match expectations
5. **Commit working code** with suggested commit message
6. **Report any issues** before proceeding to next phase

## Rollback Strategy

Each checkpoint creates a stable state. If issues arise:

1. **Identify last working checkpoint**
2. **Revert to checkpoint commit**
3. **Review logs and error messages**
4. **Adjust implementation approach**
5. **Resume from stable checkpoint**

---

## Implementation Details

### Token Management Best Practices

**Context Length Distribution**:

- **50% of models**: 4K-32K context (conservative approach)
- **30% of models**: 32K-128K context (moderate context)
- **20% of models**: 128K+ context (aggressive context usage)

**Recommended Split**:

- **Input Context**: 60% of available tokens
- **Output Generation**: 35% of available tokens
- **Safety Buffer**: 5% of available tokens

### Error Handling & Fallbacks

**Token Limit Exceeded**:

1. Reduce context messages by 50%
2. If still exceeded, reduce by 75%
3. If still exceeded, send only current message
4. Log warning and suggest model upgrade

**Model Context Unknown**:

- Use conservative 8K context assumption
- Allocate 4.8K for input, 2.8K for output
- Log warning about unknown model limits

### Performance Considerations

**Token Estimation Speed**:

- Character-based estimation: ~0.1ms per message
- Acceptable for real-time use
- Consider caching estimates for unchanged messages

**Memory Usage**:

- Store only essential message data in context
- Consider message compression for long conversations
- Implement conversation pagination for UI

---

## Expected Benefits

### User Experience

- **Coherent Conversations**: AI remembers context and previous topics
- **Natural Flow**: No need to repeat information in subsequent messages
- **Better Problem Solving**: AI can reference earlier parts of conversation

### Technical Benefits

- **Optimal Token Usage**: Utilize full model context windows efficiently
- **Cost Efficiency**: Better token allocation reduces waste
- **Model Flexibility**: Automatically adapt to different model capabilities

### Developer Experience

- **Clear Architecture**: Centralized context management
- **Debuggable**: Logging and monitoring for context decisions
- **Configurable**: Environment and user-level settings

---

## Risk Mitigation

### High Priority Risks

1. **Token Estimation Accuracy**: May over/under-estimate context usage
   - _Mitigation_: Conservative estimates + buffer + progressive fallback
2. **API Cost Increase**: More tokens per request
   - _Mitigation_: Intelligent context pruning + user controls
3. **Latency Impact**: Larger payloads to OpenRouter
   - _Mitigation_: Async processing + progressive loading

### Medium Priority Risks

1. **Memory Usage**: Storing conversation context
   - _Mitigation_: Message pagination + cleanup policies
2. **Complex State Management**: Context selection logic
   - _Mitigation_: Comprehensive testing + fallback mechanisms

### Low Priority Risks

1. **Backward Compatibility**: Existing conversations
   - _Mitigation_: Graceful degradation + migration utilities
2. **Model-Specific Quirks**: Different context handling
   - _Mitigation_: Model-specific configurations + overrides

---

## Success Metrics

### Functional Metrics

- ✅ Context-aware responses in >95% of multi-turn conversations
- ✅ Zero token limit exceeded errors with proper fallbacks
- ✅ <200ms additional latency for context processing

### Quality Metrics

- ✅ User satisfaction surveys show improved conversation quality
- ✅ Reduced user repetition in follow-up messages
- ✅ AI responses demonstrate clear memory of conversation context

### Technical Metrics

- ✅ Token utilization efficiency >80% of available context
- ✅ Context selection accuracy >90% (relevant messages included)
- ✅ System stability maintained during implementation

---

This implementation plan provides a robust, scalable approach to adding context-aware capabilities while maintaining system performance and user experience. The phased approach allows for iterative testing and refinement of the context management strategies.
