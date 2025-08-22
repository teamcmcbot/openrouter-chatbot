# Phase 1 Streaming Endpoint Verification Guide

## Overview

Phase 1 has implemented the backend streaming foundation with the following components:

✅ **Completed:**

- `/api/chat/stream` endpoint with identical validation to `/api/chat`
- TierA rate limiting (shares limits with non-streaming endpoint)
- Enhanced authentication middleware (`withEnhancedAuth`)
- OpenRouter streaming integration with metadata preservation
- AI SDK v5 integration for proper streaming responses
- Metadata capture (usage tokens, reasoning, annotations)

## Manual Testing Steps

### 1. Basic Streaming Test

**Start the development server:**

```bash
npm run dev
```

**Test with curl (anonymous user):**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, can you help me with a simple question?",
    "model": "deepseek/deepseek-r1-0528:free",
    "temperature": 0.7
  }'
```

**Expected Result:**

- ✅ Stream of text chunks (not a single response)
- ✅ Status: 200 OK
- ✅ Header: `X-Streaming: true`
- ✅ Header: `X-Model: deepseek/deepseek-r1-0528:free`
- ✅ Content-Type: `text/plain; charset=utf-8`

### 2. Rate Limiting Test

**Send multiple requests quickly:**

```bash
# Run this multiple times in quick succession
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/chat/stream \
    -H "Content-Type: application/json" \
    -d '{"message": "Test rate limit", "model": "deepseek/deepseek-r1-0528:free"}' &
done
```

**Expected Result:**

- ✅ First few requests: 200 OK with streaming
- ✅ Rate limited requests: 429 Too Many Requests
- ✅ Rate limit headers present (`X-RateLimit-Remaining`, etc.)
- ✅ Limits shared with `/api/chat` (TierA pool)

### 3. Authentication Test

**Test without authentication (should work with limited features):**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Anonymous test",
    "model": "deepseek/deepseek-r1-0528:free"
  }'
```

**Test web search without auth (should fail):**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the latest news?",
    "model": "deepseek/deepseek-r1-0528:free",
    "webSearch": true
  }'
```

**Expected Result:**

- ✅ Anonymous request: 200 OK with streaming
- ✅ Web search request: 403 Forbidden (requires Pro/Enterprise)

### 4. Model Validation Test

**Test with different model formats:**

```bash
# Should work (free model)
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message",
    "model": "deepseek/deepseek-r1-0528:free"
  }'

# May fail depending on tier restrictions
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message",
    "model": "gpt-4"
  }'
```

**Expected Result:**

- ✅ Free model: 200 OK with streaming
- ✅ Paid model: Either 200 OK or 403 Forbidden (depending on user tier)

### 5. Message Format Tests

**Legacy format (single message):**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello world",
    "model": "deepseek/deepseek-r1-0528:free"
  }'
```

**New format (messages array):**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"},
      {"role": "assistant", "content": "Hi there!"},
      {"role": "user", "content": "How are you?"}
    ],
    "model": "deepseek/deepseek-r1-0528:free"
  }'
```

**Expected Result:**

- ✅ Both formats: 200 OK with streaming
- ✅ Proper conversation context in new format

### 6. Error Handling Test

**Invalid model:**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test",
    "model": "invalid-model-name"
  }'
```

**Missing message:**

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-r1-0528:free"
  }'
```

**Expected Result:**

- ✅ Invalid model: 400 Bad Request with error message
- ✅ Missing message: 400 Bad Request with validation error
- ✅ Proper error format (not streaming response)

### 7. Feature Parity Test

**Compare streaming vs non-streaming:**

```bash
# Non-streaming
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about TypeScript",
    "model": "deepseek/deepseek-r1-0528:free"
  }'

# Streaming
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about TypeScript",
    "model": "deepseek/deepseek-r1-0528:free"
  }'
```

**Expected Result:**

- ✅ Same validation logic applied
- ✅ Same rate limiting pool (TierA)
- ✅ Same authentication requirements
- ✅ Same model access control
- ✅ Streaming response streams content progressively
- ✅ Non-streaming response returns complete response at once

## Automated Testing

**Run the test script:**

```bash
# Local testing
node scripts/test-streaming.js --local --verbose

# Production testing (if deployed)
node scripts/test-streaming.js --prod
```

**Expected Results:**

- ✅ All basic streaming tests pass
- ✅ Rate limiting works correctly
- ✅ Authentication gates work as expected
- ✅ Feature flags are properly enforced
- ✅ Error handling is consistent with non-streaming

## Performance Verification

### Response Time Comparison

- **Non-streaming**: Higher initial latency (waits for complete response)
- **Streaming**: Lower time-to-first-byte, progressive content delivery

### Memory Usage

- ✅ Streaming should use consistent memory (doesn't buffer entire response)
- ✅ No memory leaks during long responses

### Rate Limiting

- ✅ TierA limits properly shared between `/api/chat` and `/api/chat/stream`
- ✅ Redis rate limiting works in serverless environment

## Verification Checklist

Before proceeding to Phase 2:

**Backend Foundation:**

- [ ] Streaming endpoint responds with text stream (not JSON)
- [ ] TierA rate limiting works and is shared with non-streaming
- [ ] Authentication middleware works correctly
- [ ] Enhanced auth supports anonymous and authenticated users
- [ ] OpenRouter streaming integration works
- [ ] Metadata preservation captures usage, reasoning, annotations
- [ ] Error handling matches non-streaming endpoint
- [ ] Build passes without errors

**Feature Parity:**

- [ ] Same model access control as non-streaming
- [ ] Same temperature validation
- [ ] Same message format support (legacy + new)
- [ ] Same attachment validation (if tested with auth)
- [ ] Same web search gating (Pro/Enterprise only)
- [ ] Same reasoning gating (Enterprise only)

**Performance:**

- [ ] Streaming provides progressive content delivery
- [ ] No memory leaks or excessive buffering
- [ ] Rate limiting works correctly under load
- [ ] Response times are reasonable

**Next Steps:**

- [ ] If all tests pass → Proceed to Phase 2 (frontend streaming)
- [ ] If tests fail → Fix issues and re-test
- [ ] Document any limitations or known issues

## Notes

1. **Metadata Handling**: Current implementation logs metadata but doesn't expose it to clients. Phase 2 will need to handle this for database sync.

2. **Database Sync**: Streaming responses still need to be synced to the database. This will be addressed in Phase 2 frontend implementation.

3. **User Preferences**: The streaming/non-streaming toggle will be implemented in Phase 2.

4. **Production Testing**: Test with real authentication tokens to verify tier-based features work correctly.

5. **Monitoring**: In production, monitor streaming endpoint performance and error rates compared to non-streaming.
