# GET /api/chat/search

## Overview

Server-side conversation search endpoint that searches across all user conversations and messages. Supports searching in conversation titles, last message previews, and full message content.

**Implementation**: Phase 2 of Chat Sidebar Search feature (see `/specs/chat_sidebar_search.md`)

## Authentication & Authorization

- **Middleware**: `withProtectedAuth` + `withTieredRateLimit(tierB)`
- **Authentication**: Required (authenticated users only)
- **Rate Limiting**: TierB (storage/DB operations)
  - Anonymous: N/A (not accessible)
  - Free: 50 requests/hour
  - Pro: 500 requests/hour
  - Enterprise: 1,000 requests/hour

## Request

### Method

```
GET /api/chat/search
```

### Query Parameters

| Parameter | Type   | Required | Default | Description                               |
| --------- | ------ | -------- | ------- | ----------------------------------------- |
| `q`       | string | Yes      | -       | Search query (min 2 chars, max 100 chars) |
| `limit`   | number | No       | 50      | Max results to return (max 100)           |

### Example Request

```bash
curl -X GET 'https://your-domain.com/api/chat/search?q=bug%20fix&limit=50' \
  -H 'Cookie: your-session-cookie' \
  -H 'Content-Type: application/json'
```

## Response

### Success Response (200 OK)

```typescript
{
  results: SearchResult[];
  totalMatches: number;
  executionTimeMs: number;
  query: string;
}

interface SearchResult {
  id: string;                          // Conversation ID
  title: string;                       // Conversation title
  lastMessagePreview: string | null;   // ~100 char preview of last message
  messageCount: number;                // Total messages in conversation
  lastMessageTimestamp: string;        // ISO 8601 timestamp
  matchType: 'title' | 'preview' | 'content'; // Where the match was found
}
```

#### Example Response

```json
{
  "results": [
    {
      "id": "conv_123_abc",
      "title": "Bug fix in authentication",
      "lastMessagePreview": "I found the issue in the login handler...",
      "messageCount": 12,
      "lastMessageTimestamp": "2025-10-26T14:30:00.000Z",
      "matchType": "title"
    },
    {
      "id": "conv_456_def",
      "title": "Code review",
      "lastMessagePreview": "The bug fix looks good, but...",
      "messageCount": 8,
      "lastMessageTimestamp": "2025-10-25T09:15:00.000Z",
      "matchType": "content"
    }
  ],
  "totalMatches": 2,
  "executionTimeMs": 145,
  "query": "bug fix"
}
```

### Error Responses

#### 400 Bad Request - Missing Query

```json
{
  "error": "Search query is required",
  "code": "MISSING_QUERY"
}
```

#### 400 Bad Request - Query Too Short

```json
{
  "error": "Search query must be at least 2 characters",
  "code": "QUERY_TOO_SHORT"
}
```

#### 401 Unauthorized

```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

#### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600
}
```

#### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

## Response Headers

All responses include standard headers:

```
x-request-id: unique-request-identifier
x-ratelimit-limit: 500
x-ratelimit-remaining: 495
x-ratelimit-reset: 2025-10-26T15:00:00.000Z
```

When rate limit is exceeded:

```
retry-after: 3600
```

## Search Behavior

### Search Scope

The endpoint searches across:

1. **Conversation titles** - Full title text
2. **Last message previews** - ~100 character preview stored in `chat_sessions.last_message_preview`
3. **Full message content** - All user and assistant message content in `chat_messages`

### Search Algorithm

- **Pattern matching**: Uses PostgreSQL `ILIKE` for case-insensitive pattern matching
- **Query format**: `%{query}%` (substring match)
- **Sorting**: Results sorted by `last_message_timestamp DESC` (most recent first)
- **Deduplication**: Conversations matching in multiple places (title + content) appear once
- **Result limit**: Maximum 50 results (configurable, hard cap at 100)

### Database Optimization

The endpoint uses optimized indexes for performance:

1. **`idx_chat_sessions_user_title_pattern`** - B-tree index on (user_id, title text_pattern_ops)
2. **`idx_chat_sessions_user_search`** - Composite index with INCLUDE clause for metadata
3. **`idx_chat_messages_session_content`** - Join optimization index

**Note**: `idx_chat_messages_content_pattern` was removed due to PostgreSQL B-tree size limits (~2,700 bytes). Long assistant responses exceeded this limit. Sequential scan with user_id filter is fast enough for typical usage (<10,000 messages per user).

### Performance Characteristics

- **Title/preview search**: ~10-50ms (uses B-tree index)
- **Content search**: ~50-400ms (sequential scan, no index)
- **Total response time**: ~100-200ms for typical users

### Fallback Behavior

The endpoint attempts to call a `search_conversations()` database function first, but falls back to direct SQL queries if the function doesn't exist:

```sql
-- Step 1: Search titles and previews
SELECT * FROM chat_sessions
WHERE user_id = $1
  AND (title ILIKE $2 OR last_message_preview ILIKE $2)
ORDER BY last_message_timestamp DESC
LIMIT 50;

-- Step 2: Search message content
SELECT DISTINCT session_id FROM chat_messages
WHERE role IN ('user', 'assistant')
  AND content ILIKE $2
LIMIT 50;

-- Step 3: Fetch session details for content matches
SELECT * FROM chat_sessions
WHERE user_id = $1 AND id = ANY($3::uuid[]);

-- Step 4: Combine and deduplicate
```

## Usage Examples

### Basic Search

```typescript
const response = await fetch("/api/chat/search?q=authentication");
const data = await response.json();

console.log(`Found ${data.totalMatches} conversations`);
data.results.forEach((result) => {
  console.log(`${result.title} - ${result.matchType}`);
});
```

### Search with Custom Limit

```typescript
const response = await fetch("/api/chat/search?q=bug&limit=10");
const data = await response.json();
```

### Error Handling

```typescript
try {
  const response = await fetch("/api/chat/search?q=test");

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 429) {
      console.error("Rate limit exceeded, retry after:", error.retryAfter);
    } else if (response.status === 400) {
      console.error("Invalid query:", error.message);
    }

    return;
  }

  const data = await response.json();
  // Handle results...
} catch (error) {
  console.error("Network error:", error);
}
```

## Integration with Chat Sidebar

This endpoint is used by the Chat Sidebar Search feature (see `/docs/features/chat-sidebar-search.md`):

1. **Authenticated users** trigger server search after 800ms debounce
2. Search results are stored in separate `searchResults` array in Zustand store
3. Results replace the normal conversation list during search
4. Clearing search reverts to original conversation list (no re-fetch)

### Client-Side Usage

```typescript
// In useChatStore
performServerSearch: async (query: string) => {
  set({ searchLoading: true, searchError: null });

  try {
    const response = await fetch(
      `/api/chat/search?q=${encodeURIComponent(query)}&limit=50`
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();

    set({
      searchResults: data.results,
      searchLoading: false,
    });
  } catch (error) {
    set({
      searchError: error.message,
      searchLoading: false,
    });
  }
};
```

## Security Considerations

1. **Authorization**: Users can only search their own conversations (filtered by `user_id`)
2. **Rate Limiting**: TierB limits prevent abuse (50-1000 req/hr depending on tier)
3. **Input Validation**: Query length validated (min 2, max 100 characters)
4. **SQL Injection**: Uses parameterized queries, input is URL-encoded
5. **Data Exposure**: No conversation data from other users is ever returned

## Related Documentation

- [Chat Sidebar Search Feature](/docs/features/chat-sidebar-search.md) - Complete feature documentation
- [Chat Sessions API](/docs/api/chat-sessions.md) - List all conversations
- [Chat Messages API](/docs/api/chat-messages.md) - Load conversation messages
- [Chat Sync API](/docs/api/chat-sync.md) - Synchronize conversations
- [Rate Limiting](/docs/api/rate-limiting.md) - Rate limit details

## Database Schema

### Tables Used

- `chat_sessions` - Conversation metadata (title, preview, timestamps)
- `chat_messages` - Full message content (user and assistant messages)

### Indexes

- `idx_chat_sessions_user_title_pattern` - Title search optimization
- `idx_chat_sessions_user_search` - Composite with INCLUDE for metadata
- `idx_chat_messages_session_content` - Join optimization

See `/database/patches/conversation-search/01-add-search-indexes.sql` for index definitions.

## Changelog

| Date       | Version | Changes                                         |
| ---------- | ------- | ----------------------------------------------- |
| 2025-10-23 | 1.0.0   | Initial implementation (Phase 2)                |
| 2025-10-23 | 1.0.1   | Added fallback SQL queries for compatibility    |
| 2025-10-24 | 1.0.2   | Removed content index due to B-tree size limits |
| 2025-10-26 | 1.0.3   | Documentation created                           |
