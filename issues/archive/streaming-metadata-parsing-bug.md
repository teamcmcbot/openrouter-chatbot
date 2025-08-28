# Streaming Metadata Parsing Bug

**Status**: Fixed (Needs Testing)  
**Priority**: High  
**Component**: Frontend Streaming  
**Created**: 2025-08-23  
**Fixed**: 2025-08-23

## Issue Description

The `__FINAL_METADATA__` JSON is sometimes being rendered as part of the assistant response instead of being properly parsed and separated from the content.

## Root Cause Identified ✅

**Backend Format:**

```json
{"__FINAL_METADATA__": {
  "response": "content...",
  "usage": {...},
  "annotations": [...],
  ...
}}
```

**Frontend Error:**
The parsing logic was looking for `__FINAL_METADATA__` as a text delimiter in the stream, but the backend sends it as a complete JSON object. The frontend needed to detect and parse JSON lines containing the metadata key.

## Fix Applied ✅

**Location:** `hooks/useChatStreaming.ts`

**Solution:**

- Changed from text delimiter search to JSON line detection
- Parse each line that starts with `{` and contains `__FINAL_METADATA__`
- Properly separate content lines from metadata JSON
- Handle incomplete chunks correctly

**Code Change:**

```typescript
// NEW: Detect JSON lines with metadata
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (
    line.trim().startsWith("{") &&
    line.includes("__FINAL_METADATA__") &&
    !foundMetadata
  ) {
    try {
      const potentialJson = JSON.parse(line);
      if (potentialJson.__FINAL_METADATA__) {
        finalMetadata = potentialJson.__FINAL_METADATA__;
        foundMetadata = true;
        break;
      }
    } catch {
      // Not valid JSON yet, treat as content
      contentLines.push(line);
    }
  } else if (!foundMetadata) {
    contentLines.push(line);
  }
}
```

## Testing Status: 🔍 NEEDS VERIFICATION

**Test Scenarios:**

1. ✅ **Basic Streaming**: Enable streaming → send "What is 1+1?" → verify no raw JSON
2. 🔍 **Web Search**: Enable streaming + web search → send query → verify annotations appear
3. 🔍 **Reasoning**: Enable streaming + reasoning → send complex query → verify thinking steps
4. 🔍 **Rapid Messages**: Test multiple consecutive streaming requests
5. 🔍 **Network Issues**: Test with slow/unstable network conditions

**Expected Results:**

- ❌ No raw `{"__FINAL_METADATA__": {...}}` in chat responses
- ✅ Token counts still appear correctly
- ✅ Generation links still work
- ✅ Web search annotations display properly
- ✅ Reasoning sections populate correctly

## Evidence from Previous Bug

**User Report (Pre-Fix):**

```text
From: OpenRouter{"__FINAL_METADATA__":{"response":"Jerome Powell's recent speech...", "usage":{"prompt_tokens":1124,"completion_tokens":250...}}}
```

**Network Response (Pre-Fix):**
Raw stream included: `...From: OpenRouter{"__FINAL_METADATA__": {...}}`

**Expected Result (Post-Fix):**

```text
From: OpenRouter
```

(With metadata processed separately for UI elements)
