# Context-Aware Chat Feature Specification (Draft)

## Overview

Currently, each API call to OpenRouter is stateless and does not include chat history, resulting in responses that lack conversational context. This feature will enable context-aware conversations by including up to the last 5 messages in each API request. Additional strategies such as summarization will be considered to optimize context length and token usage.

---

## Goals

- Provide the LLM with recent conversation history for more coherent, context-aware responses
- Limit the number of messages sent (e.g., last 5) to stay within token limits
- Optionally summarize older messages to preserve important context while reducing token usage
- Maintain efficient API usage and fast response times

---

## User Stories

1. **Contextual Responses**

   - As a user, I want the chatbot to remember the recent conversation so replies are relevant and coherent.

2. **Efficient Context Management**
   - As a developer, I want to avoid exceeding token limits and keep API calls efficient by limiting or summarizing context.

---

## Implementation Plan

### 1. Message Selection Strategy

**Previous Messages Format**: Standard OpenRouter messages array format (NOT system messages)

```typescript
// NEW API payload structure
[
  { role: "user", content: "What is React?" },
  { role: "assistant", content: "React is a JavaScript library..." },
  { role: "user", content: "How do I use hooks?" }, // Current message
];
```

**Message Count**: Default 5 conversation pairs (5 user + 5 assistant = up to 10 messages)

- Configurable via environment: `CONTEXT_MESSAGE_PAIRS=5`
- Progressive reduction if token limits approached: 5→4→3→2→1→0 pairs

### 2. Dynamic Token Management

**Current Problem**: Fixed `OPENROUTER_MAX_TOKENS=5000` for ALL models is inefficient

**New Strategy**: Model-aware token allocation based on context length

- **60% for input context**: Include conversation history
- **40% for output generation**: Allow longer responses
- **Reserve 150 tokens**: Safety buffer

**Examples**:

- **GPT-4o** (128K): ~77K input context, ~51K output
- **DeepSeek R1** (64K): ~38K input context, ~26K output
- **Free models** (8K): ~5K input context, ~3K output

### 3. Context Length Awareness

**Model Context Detection**: Use existing model store data

```typescript
const modelInfo = useModelStore.getState().getModelById(model);
const contextLength = modelInfo?.context_length || 8000; // fallback
```

**Token Estimation**: Approximate counting for real-time decisions

```typescript
// Rough estimation: ~4 characters per token
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### 4. Intelligent Context Selection

**Algorithm**: Fit maximum recent messages within token budget

- Start from most recent messages and work backwards
- Include complete conversation pairs when possible
- Stop when adding next message would exceed token limit
- Ensure coherent context boundaries (don't cut mid-conversation)

### Example: Context Selection Algorithm

Using your conversation data as an example:

```typescript
// Your conversation: 3 pairs, 1,475 tokens total
const messages = [
  {
    role: "user",
    content: "Which basketball team in the NBA has won the most finals?",
  }, // ~15 tokens
  {
    role: "assistant",
    content: "**The Boston Celtics** have won...",
    total_tokens: 128,
  }, // 128 tokens
  { role: "user", content: "What is the average salary of NBA players?" }, // ~12 tokens
  {
    role: "assistant",
    content: "The average salary of NBA players...",
    total_tokens: 688,
  }, // 688 tokens
  { role: "user", content: "Favourite Dota 2 duo laning heroes" }, // ~8 tokens
  {
    role: "assistant",
    content: "When it comes to Dota 2's duo lanes...",
    total_tokens: 659,
  }, // 659 tokens
];

// New user message
const newMessage = {
  role: "user",
  content: "What about Dota 2 pro player salaries?",
}; // ~10 tokens

function selectContextMessages(messages, maxInputTokens) {
  const contextMessages = [];
  let totalTokens = estimateTokenCount(newMessage.content); // Start with new message

  // Work backwards from most recent
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens =
      message.total_tokens || estimateTokenCount(message.content);

    if (totalTokens + messageTokens > maxInputTokens) {
      break; // Would exceed budget
    }

    contextMessages.unshift(message);
    totalTokens += messageTokens;
  }

  return { contextMessages, totalTokens };
}

// For different models:

// Large model (64K context, ~39K input budget)
const largeModelResult = selectContextMessages(messages, 39000);
// Result: ALL 6 messages included (1,475 + 10 = 1,485 tokens)

// Medium model (16K context, ~9.6K input budget)
const mediumModelResult = selectContextMessages(messages, 9600);
// Result: ALL 6 messages included (still fits)

// Small model (4K context, ~2.4K input budget)
const smallModelResult = selectContextMessages(messages, 2400);
// Result: Only last 2-3 messages included (~700-800 tokens)
// Might include: Dota 2 question + answer + new message
```

## Smart Pair Preservation

The algorithm also ensures **complete conversation pairs** when possible:

```typescript
function selectContextWithPairs(messages, maxInputTokens) {
  // Always try to include complete user+assistant pairs
  // If a user message fits but not the assistant response,
  // decide whether to include the incomplete pair or not

  // Strategy: Prefer complete pairs over partial context
  if (wouldBreakPair && hasCompletePairAlternative) {
    return includeCompletePairs();
  }
}
```

### 5. Summarization Strategy (Advanced)

**When to Summarize**:

- Conversation exceeds 20 message pairs
- Token budget forces aggressive context truncation
- User manually requests summarization

**How to Summarize**:

- Use same LLM model for consistency
- Store summary in conversation metadata
- Include summary as context when needed

---

## Database/State Changes

**Current State Management**: Zustand-based conversation storage already implemented

- Conversations persist in `useChatStore` with full message history
- No schema changes required - existing `ChatMessage[]` structure supports context

**Required Updates**:

- Update chat API logic to retrieve conversation history from current conversation
- Modify OpenRouter client to accept message arrays instead of single message
- Add token estimation and context selection utilities

---

## UI/UX Considerations

- No direct UI changes required; feature is backend/API-focused.
- Optionally, display a note if context is being summarized or truncated.

---

## Efficiency & Optimization Strategies

- Use lightweight, local summarization for older messages to reduce API calls and latency.
- Cache summaries for long sessions to avoid repeated summarization.
- Allow users to opt-in/out of summarization or adjust context window size in settings.

---

## Security & Privacy

- Only include messages from the current user's session.
- Do not leak context between users or sessions.

---

## Implementation Steps (MVP)

1. **Add Token Management Utilities** (`lib/utils/tokens.ts`)

   - Token estimation functions
   - Model-aware context calculation
   - Progressive context reduction logic

2. **Update OpenRouter Client** (`lib/utils/openrouter.ts`)

   - Accept message arrays instead of single message
   - Support dynamic max_tokens based on model context length
   - Enhanced error handling for token limit exceeded

3. **Modify Chat Store** (`stores/useChatStore.ts`)

   - Add context message selection logic
   - Implement conversation history retrieval
   - Include token-aware message filtering

4. **Update Chat API Endpoint** (`src/app/api/chat/route.ts`)

   - Accept conversation context in request body
   - Calculate optimal token allocation per model
   - Pass full message history to OpenRouter

5. **Add Configuration**

   - Environment variables for context settings
   - Model context length integration
   - Fallback mechanisms and error handling

6. **Testing & Validation**
   - Test with various conversation lengths
   - Verify context preservation across different models
   - Monitor token usage and optimize allocation

---

## Future Enhancements

- **Advanced LLM-based summarization** for long conversations
- **Dynamic context window** based on real-time token usage analysis
- **User-configurable context settings** in settings store
- **Visual indicators** in UI showing context inclusion/summarization status
- **Context optimization** using embeddings for semantic relevance
- **Model-specific context strategies** for different LLM capabilities

---

This specification outlines a comprehensive approach to implementing context-aware chat that leverages the existing Zustand architecture while providing intelligent, model-aware context management. The implementation balances conversational quality with efficiency and respects each model's unique context constraints.

**Key Innovation**: Unlike simple message count limits, this approach uses dynamic token allocation based on each model's actual context length, maximizing context utilization while preventing token limit errors.
