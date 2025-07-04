# Gemini CLI Mission Brief - OpenRouter Chatbot Backend

## 🎯 Mission Overview

**Agent**: Gemini CLI  
**Role**: Backend API Developer & Integration Specialist  
**Primary Responsibility**: Build the complete backend infrastructure, API endpoints, and OpenRouter integration for the chatbot application.

**Success Criteria**:

- ✅ Functional `/api/chat` endpoint that calls OpenRouter
- ✅ Proper error handling and logging
- ✅ Type-safe API contracts
- ✅ Environment configuration management
- ✅ Robust OpenRouter integration with the specified model

---

## 📁 Exclusive File Ownership

**YOU OWN these exact paths** (full write access):

```
/src/app/api/**/*       # All API routes and backend logic
/lib/utils/**/*         # Utility functions and helpers
/lib/types/**/*         # TypeScript type definitions
/.env.example           # Environment variable documentation
/*.config.ts            # Configuration files (if needed)
```

**You can READ** (for integration):

- `/components/**/*` (Frontend components from Copilot)
- `/src/app/(app)/**/*` (UI pages from Copilot)

---

## 🏗️ Task Breakdown

### Task 1: OpenRouter Integration Setup

**Priority**: High

- Create OpenRouter client configuration
- Set up API key management and validation
- Implement proper error handling for API calls
- Test connection with `deepseek/deepseek-r1-0528:free` model
- **Files**: `lib/utils/openrouter.ts`, `lib/types/openrouter.ts`

### Task 2: Chat API Endpoint

**Priority**: High

- Implement `POST /src/app/api/chat/route.ts`
- Accept user messages and forward to OpenRouter
- Handle streaming responses (if supported)
- Return formatted AI responses with error handling
- Add comprehensive logging for debugging
- **Files**: `src/app/api/chat/route.ts`

### Task 3: Type Definitions & Contracts

**Priority**: High

- Define TypeScript interfaces for all API interactions
- Create shared types for frontend integration
- Document API request/response schemas
- Ensure type safety across the application
- **Files**: `lib/types/api.ts`, `lib/types/chat.ts`, `lib/types/index.ts`

### Task 4: Error Handling & Validation

**Priority**: Medium

- Input validation for chat messages
- Comprehensive error responses with appropriate status codes
- Rate limiting protection (basic)
- Request sanitization and security measures
- **Files**: `lib/utils/validation.ts`, `lib/utils/errors.ts`

### Task 5: Utility Functions & Helpers

**Priority**: Medium

- Environment variable validation utility
- Logging helpers for debugging
- Response formatting utilities
- OpenRouter response parsing helpers
- **Files**: `lib/utils/env.ts`, `lib/utils/logger.ts`, `lib/utils/response.ts`

---

## 🔌 OpenRouter Integration Requirements

**API Specifications**:

- **Base URL**: `https://openrouter.ai/api/v1`
- **Model**: `deepseek/deepseek-r1-0528:free`
- **Authentication**: Bearer token via `OPENROUTER_API_KEY`
- **Content-Type**: `application/json`

**Expected Request Format**:

```typescript
{
  "model": "deepseek/deepseek-r1-0528:free",
  "messages": [
    {
      "role": "user",
      "content": "user message here"
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

**Response Handling**:

- Parse OpenRouter response format
- Extract AI message content
- Handle rate limits and API errors
- Provide fallback error messages

---

## 📋 Git Communication Protocol

### Commit Message Format:

```
[GEMINI] Clear description of backend implementation

Examples:
[GEMINI] Implement OpenRouter API client with error handling
[GEMINI] Add chat endpoint with request validation
[GEMINI] Create type definitions for API contracts
```

### Handoff Communication:

```
[GEMINI] Implemented /api/chat endpoint, ready for COPILOT frontend integration
[GEMINI] Added type definitions in /lib/types/, available for import
[GEMINI] OpenRouter integration complete, needs frontend testing
```

### Before Starting New Work:

1. **Always run**: `git pull --rebase`
2. **Check others' work**: `git log --oneline -10`
3. **Review recent changes**: `git show [recent-commit-hash]`

### Commit Frequency:

- Commit every 1-3 related files
- After completing each API endpoint
- After adding new utility functions or types

---

## 🧪 Testing Approach

**Your Testing Responsibilities**:

- API endpoint testing with request/response validation
- OpenRouter integration testing
- Error handling and edge case testing
- Environment configuration testing

**Test Files** (you own):

- `/tests/api/**/*.test.ts`
- API route testing
- OpenRouter client testing
- Utility function testing

**Example Test Structure**:

```typescript
// tests/api/chat.test.ts
describe("/api/chat", () => {
  it("handles valid chat requests", async () => {
    // Test successful API calls
  });

  it("returns proper error responses", async () => {
    // Test error handling
  });
});
```

---

## 🔒 Environment Configuration

**Required Environment Variables** (update `.env.example`):

```bash
# Added by [GEMINI]
# Description: OpenRouter API key for chat completions
OPENROUTER_API_KEY=your_key_here

# Added by [GEMINI]
# Description: OpenRouter model to use
OPENROUTER_API_MODEL=deepseek/deepseek-r1-0528:free

# Added by [GEMINI]
# Description: OpenRouter base URL
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Added by [GEMINI]
# Description: Maximum tokens per response
OPENROUTER_MAX_TOKENS=1000
```

**Environment Validation**:

- Check for required environment variables on startup
- Provide clear error messages for missing configuration
- Validate API key format and accessibility

---

## 🚀 Development Workflow

### Phase 1: Foundation (Day 1)

1. Set up OpenRouter client and authentication
2. Create basic type definitions
3. Implement environment variable validation
4. Test OpenRouter connection

### Phase 2: Core API (Day 1-2)

1. Build `/api/chat` endpoint
2. Implement request/response handling
3. Add comprehensive error handling
4. Create logging and debugging utilities

### Phase 3: Polish & Integration (Day 2-3)

1. Optimize API performance
2. Add input validation and sanitization
3. Create comprehensive type definitions
4. Test integration with frontend components

### Integration Points with Copilot:

- **Type Exports**: Export all types from `/lib/types/index.ts`
- **API Documentation**: Comment API endpoints with clear examples
- **Error Standards**: Consistent error response format for frontend

---

## 🛠️ Technical Specifications

**API Endpoint Structure**:

```typescript
// POST /api/chat
{
  // Request
  message: string;

  // Response (Success)
  response: string;
  timestamp: string;

  // Response (Error)
  error: string;
  code: string;
}
```

**OpenRouter Client Features**:

- Retry logic for failed requests
- Timeout handling
- Response streaming (if available)
- Rate limit respect
- Error categorization (network, API, validation)

**Logging Requirements**:

- Request/response logging for debugging
- Error tracking with stack traces
- Performance metrics (response times)
- API usage tracking

---

## 🔄 Integration Checkpoints

**Waiting for Copilot**:

1. Frontend components to consume API
2. User input validation requirements
3. UI error display preferences
4. Loading state coordination

**You'll Signal When Ready**:

1. API endpoint is functional and tested
2. Type definitions are complete and exported
3. Error handling covers all edge cases
4. OpenRouter integration is stable

**Success Metrics**:

- API successfully processes chat requests
- OpenRouter responses are properly formatted
- Error handling provides useful feedback
- Types enable smooth frontend integration
- Logging provides good debugging information

---

## 🐛 Error Handling Strategy

**Error Categories**:

1. **Validation Errors** (400): Invalid input format
2. **Authentication Errors** (401): Missing/invalid API key
3. **Rate Limit Errors** (429): Too many requests
4. **OpenRouter Errors** (502): External API issues
5. **Server Errors** (500): Internal application errors

**Error Response Format**:

```typescript
{
  error: string;           // User-friendly message
  code: string;            // Machine-readable error code
  details?: string;        // Additional debugging info (dev only)
  timestamp: string;       // ISO timestamp
}
```

**Logging Strategy**:

- Log all requests with sanitized data
- Log errors with full context and stack traces
- Include performance metrics
- Separate debug logs from production logs

Remember: Build a robust, secure, and performant backend that provides excellent integration points for the frontend while maintaining clear separation of concerns!
