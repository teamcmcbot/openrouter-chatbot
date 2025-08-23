# Real-Time Reasoning Display Implementation Plan

## Current Behavior

- Reasoning data streams first (before content)
- UI only shows reasoning when message is complete
- User sees thinking process after response is finished

## Target Behavior

- Show reasoning chunks in real-time as they stream
- Update reasoning section incrementally
- Better UX: user sees AI "thinking" process live

## Implementation Steps

### Phase 1: Frontend Streaming Hook Updates

**File**: `hooks/useChatStreaming.ts`

1. **Add streaming reasoning state**:

   ```typescript
   const [streamingReasoning, setStreamingReasoning] = useState("");
   const [streamingReasoningDetails, setStreamingReasoningDetails] = useState<
     Record<string, unknown>[]
   >([]);
   ```

2. **Process reasoning chunks during streaming**:

   - Currently: Only process content chunks, accumulate reasoning in final metadata
   - New: Process both content AND reasoning chunks in real-time
   - Update reasoning state as chunks arrive

3. **Extract reasoning from stream chunks**:
   ```typescript
   // In stream processing loop, check for reasoning in each chunk
   if (chunk.includes('"reasoning":')) {
     // Extract reasoning data from chunk
     // Update streaming reasoning state
   }
   ```

### Phase 2: MessageList Component Updates

**File**: `components/chat/MessageList.tsx`

1. **Support streaming reasoning display**:

   ```tsx
   // Show streaming reasoning for in-progress messages
   {
     isStreaming && streamingReasoning && (
       <div className="reasoning-streaming">
         <span className="reasoning-indicator">🧠 Thinking...</span>
         <div>{streamingReasoning}</div>
       </div>
     );
   }
   ```

2. **Progressive reasoning updates**:
   - Show reasoning sections as they become available
   - Smooth transitions between reasoning chunks
   - Visual indicators for streaming vs complete reasoning

### Phase 3: Stream Chunk Processing

**Backend**: Already working - reasoning chunks come first in stream
**Frontend**: Need to parse reasoning from early stream chunks

1. **Identify reasoning chunk patterns**:

   ```
   🟢 [OpenRouter Stream] Captured DELTA reasoning chunk: **Developing Jug Measuring Solutions**...
   ```

2. **Parse reasoning from stream response**:
   - Extract reasoning from `data.choices[0].delta.reasoning`
   - Accumulate reasoning_details from `data.choices[0].delta.reasoning_details`
   - Update UI state progressively

### Phase 4: UX Improvements

1. **Visual Indicators**:

   - Pulsing/animated thinking indicator
   - Progress indicator for reasoning steps
   - Clear distinction between streaming and complete reasoning

2. **Performance Optimization**:
   - Debounce rapid reasoning updates
   - Efficient state updates to avoid UI jank
   - Smooth animations for reasoning appearance

## Technical Considerations

### Stream Processing Architecture

```
OpenRouter Stream → useChatStreaming → MessageList
     ↓                    ↓                ↓
1. Reasoning chunks    2. Real-time      3. Live display
2. Content chunks         processing        updates
3. Final metadata      3. State updates   4. Smooth UX
```

### Data Flow Changes

- **Current**: Stream → Accumulate → Final Display
- **New**: Stream → Real-time Display + Accumulate → Final Display

### Edge Cases

1. **Rapid reasoning updates**: Debounce to prevent UI overload
2. **Incomplete reasoning chunks**: Handle partial data gracefully
3. **Reasoning-only responses**: Support responses with only reasoning
4. **Error handling**: Graceful fallback to current behavior

## Benefits

1. **Better UX**: Users see AI thinking process in real-time
2. **Engagement**: More interactive and transparent AI interaction
3. **Understanding**: Users can follow AI reasoning as it develops
4. **Transparency**: Clear visibility into AI decision-making process

## Implementation Priority

- **Phase 1**: Frontend streaming state management ⚡ (High)
- **Phase 2**: MessageList progressive display 🎨 (Medium)
- **Phase 3**: Chunk processing optimization ⚙️ (Medium)
- **Phase 4**: UX enhancements and animations ✨ (Low)

## Success Metrics

1. Reasoning appears within 200ms of first chunk
2. Smooth incremental updates without jank
3. No impact on content streaming performance
4. Graceful fallback for non-reasoning responses

## Testing Scenarios

1. **Simple reasoning**: Basic math problems with step-by-step thinking
2. **Complex reasoning**: Multi-step analysis with detailed thinking
3. **Mixed responses**: Content with embedded reasoning
4. **Error cases**: Incomplete streams, network issues
5. **Performance**: High-frequency reasoning updates

---

This enhancement would transform reasoning from a post-completion feature into a live, engaging part of the AI interaction experience.
