# Chat Sidebar Search Feature Specification

## Overview

This specification outlines the implementation of a search feature for the chat sidebar that allows users to filter conversations by title or message content. The feature must handle both local and server-side search efficiently while respecting the current pagination model.

## ⚡ Key Decisions Summary

### Authentication Behavior

- ✅ **Local search works for ALL users** (authenticated + anonymous)
- 🔐 **Server search ONLY for authenticated users**
- 📱 Anonymous users see banner: "Sign in to search full history"

### Server Search Scope

- 🔍 Searches **ALL** user conversations in database (not just loaded 20)
- 📊 Searches both `chat_sessions.title` AND `chat_messages.content`
- 🎯 Returns up to 50 most relevant results (prevents data dumps)
- ⚡ Minimum 2 character query length (no single char searches)

### State Management

- 🗂️ Two **separate** arrays: `conversations` (normal) vs `searchResults` (search)
- 🔄 **No merging** - search results don't pollute main list
- ⏪ **Instant revert** - clearing search shows original state (no re-fetch)
- 🚫 Pagination hidden during search (search returns complete result set)

### User Flow

1. User types → Local search (instant, filters loaded conversations)
2. After 300ms → Server search (if authenticated, searches everything)
3. Display searchResults array (separate from main list)
4. Clear search → Back to original conversations array

### Common Keywords Handling

- 🛡️ Max 50 results returned (e.g., "this" might match 500+ conversations)
- 📈 Sorted by relevance (match count)
- 💬 Shows: "Found 547 conversations (showing 50 most relevant)"

## Current Architecture Analysis

### How Chat Sidebar Works

1. **Conversation Loading**

   - Authenticated users: Loads the most recent 20 conversations from the server via `/api/chat/sync?limit=20&summary_only=true`
   - Anonymous users: Shows only local conversations stored in browser localStorage
   - Pagination: Implements cursor-based pagination with `loadMoreConversations()` function
   - Messages are **lazy-loaded**: Only conversation metadata (title, preview, timestamps) is loaded initially
   - Full message content is loaded via `loadConversationMessages(id)` when a conversation is clicked

2. **Data Structure**

   - **Conversation Summary** (loaded by default):
     ```typescript
     {
       id: string;
       title: string;
       userId: string;
       messages: []; // Empty array in summary mode
       messageCount: number;
       lastMessagePreview?: string; // ~100 chars snippet
       lastMessageTimestamp?: string;
       createdAt: string;
       updatedAt: string;
     }
     ```
   - **Full Conversation** (loaded on demand):
     ```typescript
     {
       // ... all fields above, plus:
       messages: ChatMessage[]; // Complete message array with full content
     }
     ```

3. **State Management**
   - Store: `useChatStore` (Zustand with persistence)
   - Current pagination state:
     ```typescript
     sidebarPaging: {
       pageSize: 20;
       loading: boolean;
       hasMore: boolean;
       nextCursor: { ts: string; id: string } | null;
       initialized: boolean;
     }
     ```
   - Conversations are sorted by `lastMessageTimestamp` (descending)

### API Endpoints

1. **GET `/api/chat/sync`** - Paginated conversation retrieval

   - Query params: `limit`, `summary_only`, `cursor_ts`, `cursor_id`, `with_total`
   - Returns: `{ conversations: [], meta: { hasMore, nextCursor, totalCount? } }`
   - Rate limit: TierC (50/200/1000/2000 req/hr by subscription level)

2. **GET `/api/chat/messages?session_id=<id>`** - Load messages for a conversation
   - Query params: `session_id`, `since_ts` (for incremental updates)
   - Returns: `{ messages: ChatMessage[] }`
   - Rate limit: TierB (20/50/500/1000 req/hr)

## Server-Side Search Strategy - Detailed Explanation

### How Server Search Works (Step-by-Step)

#### Scenario: User has 100 conversations, only first 20 loaded

**Initial State:**

```
Database (Supabase):
  - User has 100 conversations in chat_sessions table
  - Each conversation has multiple messages in chat_messages table

Client (Browser):
  conversations: [conv1, conv2, ..., conv20] ← Only 20 loaded
  sidebarPaging: { hasMore: true, nextCursor: {...} }
```

**User Types "bug fix" in Search:**

**Step 1 - Local Search (Immediate):**

```typescript
// Searches ONLY the 20 loaded conversations
localResults = conversations.filter(
  (conv) =>
    conv.title.includes("bug fix") ||
    conv.lastMessagePreview?.includes("bug fix")
);
// Maybe finds 2 matches from the 20 loaded conversations
```

**Step 2 - Server Search (After 300ms):**

```typescript
// API call to server
GET /api/chat/search?q=bug+fix&limit=50

// Server searches ALL 100 conversations + ALL their messages:
SELECT DISTINCT cs.*
FROM chat_sessions cs
LEFT JOIN chat_messages cm ON cs.id = cm.session_id
WHERE cs.user_id = 'user123'
  AND (
    cs.title ILIKE '%bug fix%'
    OR cm.content ILIKE '%bug fix%'
  )
ORDER BY
  (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id AND content ILIKE '%bug fix%') DESC
LIMIT 50;

// Server finds 15 conversations that match (from all 100)
// Returns conversation summaries (NOT full messages, just metadata)
```

**Step 3 - Display Results:**

```typescript
// Store searchResults separately
searchResults = [
  { id: 'conv5', title: 'Bug fix in login', matchCount: 3, ... },
  { id: 'conv47', title: 'Auth bug', matchCount: 2, ... },
  { id: 'conv89', title: 'Testing', matchCount: 5, ... }, // Not in original 20!
  // ... 12 more results
];

// Sidebar now displays searchResults (15 conversations)
// Original conversations array unchanged (still has 20)
```

**Step 4 - User Clears Search:**

```typescript
// Clear search state
searchMode = "inactive";
searchQuery = "";
searchResults = []; // Empty the search results

// Sidebar reverts to original conversations array
// Still shows the same 20 conversations that were loaded
// User can click "Load more" to get the next 20
```

### Visual Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     NORMAL MODE (No Search)                      │
├─────────────────────────────────────────────────────────────────┤
│  conversations: [conv1...conv20]  ← Main list (paginated)       │
│  searchResults: []                ← Empty                        │
│  searchMode: 'inactive'                                          │
│                                                                   │
│  Sidebar displays: conversations array                           │
│  Shows: "Load more..." button                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ User types "bug fix"
┌─────────────────────────────────────────────────────────────────┐
│                    SEARCH MODE (Active Search)                   │
├─────────────────────────────────────────────────────────────────┤
│  conversations: [conv1...conv20]  ← Unchanged!                  │
│  searchResults: [conv5, conv47, conv89...] ← 15 from server     │
│  searchMode: 'server'                                            │
│  searchQuery: 'bug fix'                                          │
│                                                                   │
│  Sidebar displays: searchResults array (15 conversations)        │
│  Shows: "Found 15 conversations" banner                          │
│  Hides: "Load more..." button                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ User clears search
┌─────────────────────────────────────────────────────────────────┐
│                BACK TO NORMAL MODE (Search Cleared)              │
├─────────────────────────────────────────────────────────────────┤
│  conversations: [conv1...conv20]  ← Still the same 20!          │
│  searchResults: []                ← Cleared                      │
│  searchMode: 'inactive'                                          │
│                                                                   │
│  Sidebar displays: conversations array (back to original 20)     │
│  Shows: "Load more..." button again                              │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points About Server Search:

1. **Searches EVERYTHING**: All 100 conversations + all their messages in the database
2. **Returns SUMMARIES**: Not full message content, just conversation metadata + match info
3. **Separate Storage**: searchResults array is independent of conversations array
4. **No Merging**: We don't merge server results into the main list (cleaner state management)
5. **Easy Revert**: Clearing search doesn't require API calls - just switch back to conversations array
6. **Limited Results**: Max 50 results to prevent overwhelming the user and the UI
7. **Relevance Sorted**: Results sorted by number of matches (most relevant first)

### Handling "Common Keywords" Problem:

If user searches for "this" and it matches 500+ conversations:

```typescript
// Server query with LIMIT
SELECT ... LIMIT 50;  // Only return top 50

// Response shows:
{
  results: [...50 conversations...],
  totalMatches: 547,  // Total count
  message: "Showing 50 most relevant results. Try being more specific."
}

// UI displays:
"Found 547 conversations containing 'this' (showing 50 most relevant)"
```

User experience:

- Not overwhelmed with 500+ results
- Gets most relevant 50 conversations
- Encouraged to refine search
- Can still find what they need from top 50 results

## Implementation Strategy

### Phase 1: Local Search (Client-Side Only)

**Scope**: Search within loaded conversation summaries and any messages that have been fetched.

**Search Targets**:

1. Conversation titles (always available)
2. Last message preview (~100 chars, always available)
3. Full message content (only if messages have been loaded for that conversation)

**UI Components**:

```tsx
<ChatSidebar>
  {/* Add search bar below "New Chat" button */}
  <div className="px-4 py-2">
    <SearchInput
      placeholder="Search conversations..."
      value={searchQuery}
      onChange={handleSearchChange}
      onClear={handleClearSearch}
    />
  </div>

  {/* Show search status */}
  {searchQuery && (
    <div className="px-4 py-2 text-xs text-gray-600">
      {searchResults.length} result(s) found
      {hasUnloadedMessages && (
        <button onClick={handleServerSearch}>Search all messages...</button>
      )}
    </div>
  )}

  {/* Filtered conversation list */}
  <ConversationList conversations={displayedConversations} />
</ChatSidebar>
```

**Local Search Algorithm**:

```typescript
function performLocalSearch(query: string, conversations: Conversation[]) {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) return conversations;

  return conversations.filter((conv) => {
    // 1. Search in title
    if (conv.title.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    // 2. Search in last message preview
    if (conv.lastMessagePreview?.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    // 3. Search in loaded messages (if any)
    if (conv.messages && conv.messages.length > 0) {
      return conv.messages.some((msg) =>
        msg.content.toLowerCase().includes(normalizedQuery)
      );
    }

    return false;
  });
}
```

**Behavior**:

- ✅ Real-time filtering as user types (debounced 300ms)
- ✅ Works offline for loaded data
- ✅ No API calls for basic searches
- ✅ Shows clear indication when results are limited to local data
- ⚠️ Limited to loaded conversations and their messages

### Phase 2: Server-Side Search (Full Text Search)

**Scope**: Deep search across **ALL** user conversations and messages stored in the database (not just the loaded 20).

**Important Notes**:

- 🔐 **Authentication Required**: Server-side search is ONLY available for authenticated users
- 🚫 **Anonymous Users**: Will only have local search functionality (Phase 1)
- 🔍 **Search Scope**: Searches ALL conversations in `chat_sessions` and ALL messages in `chat_messages` for that user
- 📊 **Result Handling**: Returns a separate, filtered dataset that temporarily replaces the sidebar view

**New API Endpoint**: `GET /api/chat/search`

```typescript
// Request
GET /api/chat/search?q=<query>&limit=50&search_messages=true&min_query_length=2

// Response
{
  results: [
    {
      conversationId: string,
      title: string,
      lastMessageTimestamp: string,
      messageCount: number,
      matchType: 'title' | 'message' | 'both',
      matchCount: number, // how many messages matched
      relevanceScore: number, // for sorting
      preview: string, // first matching snippet with context
    }
  ],
  totalMatches: number, // total conversations matched
  searchQuery: string,
  searchedMessagesCount: number, // total messages searched
  executionTimeMs: number,
}
```

**Database Implementation**:

Option A: Simple ILIKE pattern matching (quick to implement)

```sql
-- Search in titles
SELECT * FROM chat_sessions
WHERE user_id = $1 AND title ILIKE '%' || $2 || '%'
LIMIT 20;

-- Search in messages
SELECT DISTINCT cs.*
FROM chat_sessions cs
JOIN chat_messages cm ON cs.id = cm.session_id
WHERE cs.user_id = $1 AND cm.content ILIKE '%' || $2 || '%'
LIMIT 20;
```

Option B: PostgreSQL Full Text Search (better performance, relevance ranking)

```sql
-- Add tsvector columns and indexes
ALTER TABLE chat_sessions
ADD COLUMN title_search tsvector GENERATED ALWAYS AS (
  to_tsvector('english', title)
) STORED;

ALTER TABLE chat_messages
ADD COLUMN content_search tsvector GENERATED ALWAYS AS (
  to_tsvector('english', content)
) STORED;

CREATE INDEX idx_sessions_search ON chat_sessions USING GIN (title_search);
CREATE INDEX idx_messages_search ON chat_messages USING GIN (content_search);

-- Search query with ranking
SELECT cs.*, ts_rank(cs.title_search, query) as rank
FROM chat_sessions cs, to_tsquery('english', $2) query
WHERE cs.user_id = $1 AND cs.title_search @@ query
ORDER BY rank DESC
LIMIT 20;
```

**Recommendation**: Start with Option A (ILIKE) for MVP, migrate to Option B if performance issues arise.

**Query Constraints** (to prevent performance issues):

- Minimum query length: 2 characters (reject single character searches)
- Maximum query length: 100 characters
- Result limit: Default 50 conversations (prevents massive result dumps)
- Message search limit: Search last 1000 messages per conversation max (or 10,000 total messages per user)
- Timeout: 5 second query timeout

**Handling Common Keywords** (e.g., "This", "the", "and"):

- Return paginated results (50 at a time)
- Sort by relevance (conversations with more matches ranked higher)
- Show match count: "Found 127 conversations containing 'this' (showing top 50)"
- Add warning for very generic terms: "Your search is very common. Try being more specific."

### Phase 3: Search State Management & UX Flow

**Challenge**: Managing two different data views - normal pagination vs search results.

## State Management Strategy

The store will maintain separate states for normal browsing vs searching:

```typescript
// Add to useChatStore
interface ChatState {
  // ... existing state ...

  // Search-specific state
  searchMode: "inactive" | "local" | "server"; // Current search mode
  searchQuery: string; // Current search term
  searchResults: Conversation[]; // Server search results (separate from main list)
  searchMetadata: {
    totalMatches: number;
    executionTimeMs: number;
    isLoading: boolean;
    error: string | null;
  } | null;
}
```

## UX Flow - Step by Step

### For Authenticated Users:

```
1. User types in search bar (>= 2 chars)
   ↓
2. Local search activates immediately (searchMode: 'local')
   - Filters the currently loaded conversations array
   - Shows: "Found X results in loaded conversations"
   ↓
3. After 300ms debounce, auto-trigger server search (searchMode: 'server')
   - Shows loading indicator
   - API call to /api/chat/search with full user query
   ↓
4. Server returns matching conversations
   - Store them in searchResults array (separate from conversations array)
   - Display searchResults in sidebar (NOT merged with conversations)
   - Shows: "Found X conversations matching 'query' across all your history"
   ↓
5. User clicks a search result
   - Load that conversation normally (same as clicking any conversation)
   - Conversation stays highlighted in search results
   ↓
6. User clears search (clicks X or deletes text)
   - searchMode: 'inactive'
   - searchQuery: ''
   - searchResults: [] (cleared)
   - Sidebar reverts to original conversations array (the initial 20)
   - Normal pagination state is restored
   ↓
7. User can continue using "Load more" as before
```

### For Anonymous Users:

```
1. User types in search bar
   ↓
2. Local search only (searchMode: 'local')
   - Filters the conversations array in-place
   - Shows: "Found X results in local conversations"
   ↓
3. Show info banner (if search is active):
   - "Searching locally only. Sign in to search all your conversations."
   ↓
4. User clears search
   - Sidebar shows all local conversations again
```

## Implementation Details

### Display Logic in ChatSidebar:

```typescript
function ChatSidebar() {
  const {
    conversations, // Normal paginated list (20, 40, 60...)
    searchMode,
    searchQuery,
    searchResults, // Separate search results from server
    searchMetadata,
  } = useChatStore();

  // Determine what to display
  const displayedConversations = useMemo(() => {
    if (searchMode === "inactive" || !searchQuery) {
      // Normal mode: show paginated conversations
      return conversations;
    }

    if (searchMode === "local") {
      // Local search: filter conversations array
      return conversations.filter(
        (conv) =>
          conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          conv.lastMessagePreview
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
    }

    if (searchMode === "server") {
      // Server search: show separate searchResults array
      return searchResults;
    }
  }, [conversations, searchMode, searchQuery, searchResults]);

  // Hide pagination when searching
  const showPagination = searchMode === "inactive";

  return (
    <div>
      <SearchBar />

      {searchMode === "server" && (
        <SearchStatus
          totalMatches={searchMetadata?.totalMatches}
          executionTime={searchMetadata?.executionTimeMs}
        />
      )}

      <ConversationList conversations={displayedConversations} />

      {showPagination && <LoadMoreButton />}
    </div>
  );
}
```

### Search State Management:

```typescript
// In useChatStore actions
searchConversations: async (query: string) => {
  const { user } = useAuthStore.getState();

  // Validation
  if (query.length < 2) {
    set({ searchMode: 'inactive', searchQuery: '', searchResults: [] });
    return;
  }

  // For anonymous users, only local search
  if (!user) {
    set({ searchMode: 'local', searchQuery: query });
    return;
  }

  // For authenticated users, do both
  set({
    searchMode: 'local',
    searchQuery: query,
    searchMetadata: { isLoading: true, error: null }
  });

  try {
    // Server search
    const response = await fetch(
      `/api/chat/search?q=${encodeURIComponent(query)}&limit=50`
    );
    const data = await response.json();

    set({
      searchMode: 'server',
      searchResults: data.results, // Separate array!
      searchMetadata: {
        totalMatches: data.totalMatches,
        executionTimeMs: data.executionTimeMs,
        isLoading: false,
        error: null,
      }
    });
  } catch (error) {
    set({
      searchMetadata: {
        isLoading: false,
        error: error.message,
      }
    });
  }
},

clearSearch: () => {
  set({
    searchMode: 'inactive',
    searchQuery: '',
    searchResults: [],
    searchMetadata: null,
  });
  // conversations array remains unchanged - back to original 20
},
```

## Key Benefits of This Approach:

1. ✅ **Clean Separation**: Search results don't pollute the main conversations array
2. ✅ **Easy to Revert**: Clearing search instantly shows original state (no re-fetching)
3. ✅ **Memory Efficient**: searchResults is only populated during active search
4. ✅ **No Merge Conflicts**: Original pagination state is preserved
5. ✅ **Clear UX**: User knows when they're viewing search results vs normal list
6. ✅ **Anonymous Support**: Local search works without authentication

## Handling Edge Cases:

### Common Keywords (e.g., "this", "the"):

- Server returns top 50 matches by relevance
- Show: "Found 247 conversations containing 'this' (showing most relevant 50)"
- User can refine search for better results
- No "load more" in search mode to keep it simple

### Clearing Search:

- Instant revert to the conversations array (still has the original 20 loaded)
- No API call needed
- User can continue browsing/paginating normally

### Switching Between Results:

- If user had loaded 40 conversations (via "Load more")
- Then searches and finds 15 results
- Then clears search → Back to 40 conversations (state preserved)

### New Messages During Search:

- New messages update the conversations array (normal flow)
- If search is active, searchResults array is NOT updated (frozen snapshot)
- User must re-search to see updated results (or clear search to see normal flow)

## Implementation Plan

### Step 1: Add Search UI Component ✅

- [ ] Create `SearchInput` component with debounced input
- [ ] Add search bar to `ChatSidebar` above conversation list
- [ ] Implement clear button and search status display

### Step 2: Implement Local Search ✅

- [ ] Add `searchQuery` state to `useChatStore`
- [ ] Create `searchLocalConversations()` action
- [ ] Add computed selector `getFilteredConversations()`
- [ ] Wire up search input to filter conversation display

### Step 3: Create Server Search API ✅

- [ ] Create `/api/chat/search/route.ts`
- [ ] Implement ILIKE-based search on `chat_sessions` and `chat_messages`
- [ ] Add authentication and rate limiting (TierC)
- [ ] Handle pagination for results

### Step 4: Integrate Server Search ✅

- [ ] Add `searchServerConversations()` action to store
- [ ] Implement progressive search (local → server)
- [ ] Add loading states and error handling
- [ ] Display match highlighting in results

### Step 5: Polish & Optimize ✅

- [ ] Add keyboard shortcuts (Cmd/Ctrl+F to focus search)
- [ ] Implement result highlighting
- [ ] Add search history/suggestions (optional)
- [ ] Performance testing with large conversation sets
- [ ] Add telemetry for search usage patterns

## Edge Cases & Considerations

### 1. Pagination During Search

- **Issue**: "Load more" should respect search filter
- **Solution**: Hide "Load more" button entirely when search is active (searchMode !== 'inactive')
- **Rationale**:
  - Server search returns up to 50 most relevant results (no pagination needed)
  - Local search filters the already-loaded conversations (no more to load)
  - Keeps UX simple and predictable

### 2. Real-time Updates

- **Issue**: New messages arrive while searching
- **Solution**: Add new messages to search index incrementally; show "X new results" badge

### 3. Anonymous Users

- **Issue**: No server-side search available
- **Solution**:
  - Local search works perfectly fine for anonymous users
  - Show info banner: "🔍 Searching local conversations only. Sign in to search your full conversation history."
  - Banner only appears when search is active and user is anonymous

### 4. Performance

- **Issue**: Searching thousands of messages could be slow
- **Solution**:
  - Limit server search to last 1000 messages per user
  - Add database indexes on frequently searched columns
  - Consider adding search result caching (Redis)

### 5. Special Characters

- **Issue**: Search queries with quotes, wildcards, etc.
- **Solution**: Sanitize input, escape SQL special characters

### 6. Empty Results

- **Issue**: User gets no results
- **Solution**: Show helpful message:

  ```
  No conversations found for "query"

  Tips:
  - Try different keywords
  - Check spelling
  - Use shorter search terms
  ```

## Security Considerations

1. **Authorization**: Ensure users can only search their own conversations
2. **Rate Limiting**: Apply TierC limits to search endpoint (50-2000 req/hr)
3. **SQL Injection**: Use parameterized queries, sanitize input
4. **Data Exposure**: Don't leak conversation metadata from other users

## Performance Targets

- **Local Search**: < 50ms response time
- **Server Search**: < 500ms response time (p95)
- **Database Query**: < 200ms execution time
- **Search Index Size**: < 1MB per 1000 conversations

## Success Metrics

1. **Usage**: % of users who use search feature weekly
2. **Success Rate**: % of searches that result in clicking a conversation
3. **Performance**: p95 search response time
4. **Abandonment**: % of searches cleared without action

## Future Enhancements

1. **Advanced Filters**: Filter by date range, model used, token count
2. **Semantic Search**: Use embeddings for meaning-based search
3. **Search Operators**: Support "exact phrases", -exclude, OR logic
4. **Export Results**: Allow exporting search results to JSON/CSV
5. **Search Suggestions**: Auto-complete based on common queries

---

## Questions for Product Team

Before proceeding with implementation, please clarify:

1. **Priority**: Should we implement local search first, or full server search from the start?
2. **UX**: Which progressive search option (1, 2, or 3) aligns best with product vision?
3. **Scope**: Should we search message metadata (model names, timestamps) or just text content?
4. **Performance**: What's the acceptable latency for server search? Should we show loading states?
5. **Analytics**: Do we need to track search queries for improving the feature?

## Technical Dependencies

- No new external packages required
- Database schema changes: None for MVP (ILIKE), Optional indexes for full-text search
- API changes: New `/api/chat/search` endpoint
- Store changes: New actions and state for search

## Estimated Effort

- **Phase 1 (Local Search)**: 2-3 days
- **Phase 2 (Server Search)**: 3-4 days
- **Phase 3 (Smart Behavior)**: 2-3 days
- **Testing & Polish**: 2 days

**Total**: ~9-12 days for full implementation

---

## Complete Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                                  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                    User types in search: "bug fix"
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLIENT STATE (Store)                              │
├──────────────────────────────────────────────────────────────────────────┤
│  conversations: [conv1...conv20]     ← Main list (20 loaded)            │
│  searchQuery: "bug fix"              ← User input                         │
│  searchMode: "local" → "server"      ← Progresses automatically          │
│  searchResults: []                   ← Will be populated                  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴──────────────┐
                    │                              │
                    ▼                              ▼
        ┌─────────────────────┐      ┌──────────────────────────┐
        │  LOCAL SEARCH        │      │  SERVER SEARCH           │
        │  (Immediate)         │      │  (After 300ms)           │
        └─────────────────────┘      └──────────────────────────┘
                    │                              │
        Filter loaded 20 convs          API: GET /api/chat/search
        Title + preview only                      │
        No API call                               ▼
                    │                  ┌──────────────────────────┐
                    │                  │  DATABASE QUERY          │
                    │                  │  (Supabase)              │
                    │                  ├──────────────────────────┤
                    │                  │  SELECT FROM:            │
                    │                  │  - chat_sessions (100)   │
                    │                  │  - chat_messages (1000s) │
                    │                  │                          │
                    │                  │  WHERE:                  │
                    │                  │  - user_id = current     │
                    │                  │  - title ILIKE '%bug%'   │
                    │                  │  - content ILIKE '%bug%' │
                    │                  │                          │
                    │                  │  ORDER BY: match_count   │
                    │                  │  LIMIT: 50               │
                    │                  └──────────────────────────┘
                    │                              │
                    │                   Returns 15 conversations
                    │                              │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    STORE UPDATED (Search Results)                         │
├──────────────────────────────────────────────────────────────────────────┤
│  conversations: [conv1...conv20]     ← Unchanged                         │
│  searchQuery: "bug fix"              ← Active                             │
│  searchMode: "server"                ← Server search complete             │
│  searchResults: [conv5, conv47...]   ← 15 results from server           │
│  searchMetadata: { totalMatches: 15, executionTimeMs: 234 }             │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         UI RENDERING                                      │
├──────────────────────────────────────────────────────────────────────────┤
│  ChatSidebar displays:                                                    │
│  - searchResults array (15 conversations) ← NOT conversations array      │
│  - "Found 15 conversations" banner                                        │
│  - Hide "Load more" button                                                │
│  - Show "Clear search" (X) button                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                    User clicks "Clear search" (X)
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    STORE RESET (Search Cleared)                           │
├──────────────────────────────────────────────────────────────────────────┤
│  conversations: [conv1...conv20]     ← Still has original 20            │
│  searchQuery: ""                     ← Cleared                            │
│  searchMode: "inactive"              ← Back to normal                     │
│  searchResults: []                   ← Cleared                            │
│  searchMetadata: null                ← Reset                              │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    UI BACK TO NORMAL                                      │
├──────────────────────────────────────────────────────────────────────────┤
│  ChatSidebar displays:                                                    │
│  - conversations array (original 20) ← Back to normal                    │
│  - "Load more" button visible                                             │
│  - User can continue paginating                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

## Quick Reference for Developers

### State Structure

```typescript
// useChatStore state additions
{
  // Normal mode
  conversations: Conversation[];        // Main paginated list (20, 40, 60...)
  sidebarPaging: { hasMore, nextCursor, ... };

  // Search mode
  searchMode: 'inactive' | 'local' | 'server';
  searchQuery: string;
  searchResults: Conversation[];        // Separate search results from server
  searchMetadata: {
    totalMatches: number;
    executionTimeMs: number;
    isLoading: boolean;
    error: string | null;
  } | null;
}
```

### Display Logic

```typescript
// What to show in sidebar
const displayConversations =
  searchMode === "inactive"
    ? conversations // Normal: show paginated list
    : searchMode === "local"
    ? filteredLocal // Local: filter loaded list
    : searchMode === "server"
    ? searchResults // Server: show search results
    : conversations; // Fallback

const showLoadMore = searchMode === "inactive"; // Hide during search
```

### API Endpoints

| Endpoint             | Method | Purpose                     | Auth Required | Rate Limit |
| -------------------- | ------ | --------------------------- | ------------- | ---------- |
| `/api/chat/sync`     | GET    | Get paginated conversations | Yes           | TierC      |
| `/api/chat/search`   | GET    | Search all conversations    | Yes           | TierC      |
| `/api/chat/messages` | GET    | Load conversation messages  | Yes           | TierB      |

### Search Query Params

```typescript
GET /api/chat/search?q={query}&limit=50&search_messages=true

// Required:
q: string (min 2 chars, max 100 chars)

// Optional:
limit: number (default 50, max 100)
search_messages: boolean (default true)
```

### Database Query (Reference)

```sql
-- Search both titles and messages
SELECT DISTINCT cs.*,
  COUNT(cm.id) FILTER (WHERE cm.content ILIKE '%' || $2 || '%') as match_count
FROM chat_sessions cs
LEFT JOIN chat_messages cm ON cs.id = cm.session_id
WHERE cs.user_id = $1
  AND (
    cs.title ILIKE '%' || $2 || '%'
    OR cm.content ILIKE '%' || $2 || '%'
  )
GROUP BY cs.id
ORDER BY match_count DESC, cs.last_message_timestamp DESC
LIMIT 50;
```

### Component Integration

```tsx
// ChatSidebar.tsx
<SearchBar
  value={searchQuery}
  onChange={handleSearch}
  onClear={clearSearch}
  placeholder="Search conversations..."
  disabled={!isHydrated}
/>;

{
  isAuthenticated && searchMode === "local" && (
    <SearchModeBanner>
      Searching {conversations.length} loaded conversations... Server search in
      progress ⏳
    </SearchModeBanner>
  );
}

{
  !isAuthenticated && searchQuery && (
    <AnonymousBanner>
      🔍 Searching local only. Sign in for full history search.
    </AnonymousBanner>
  );
}

{
  searchMode === "server" && searchMetadata && (
    <SearchResultsBanner>
      Found {searchMetadata.totalMatches} conversations (
      {displayConversations.length} shown)
    </SearchResultsBanner>
  );
}
```

---

## Answers to Your Questions

### Q1: Does server search ALL conversations or just loaded ones?

**A:** Server searches **ALL** conversations in the database (all 100 if user has 100), not just the loaded 20.

### Q2: How are results returned and displayed?

**A:** Results are stored in a **separate `searchResults` array** in the store. The sidebar switches to display `searchResults` instead of `conversations` during search. The original `conversations` array remains unchanged.

### Q3: What happens when user clears search?

**A:** The sidebar instantly switches back to displaying the `conversations` array (still has the original 20 loaded). No API call needed. User can continue paginating normally.

### Q4: What about common keywords returning huge results?

**A:**

- Server query includes `LIMIT 50` (returns max 50 conversations)
- Results sorted by relevance (match count)
- UI shows: "Found 547 conversations (showing 50 most relevant)"
- User encouraged to refine search for better results
- No performance issues from massive result sets

### Q5: Does local search work for anonymous users?

**A:** Yes! Local search filters the `conversations` array (which is stored in localStorage for anonymous users). Server search is disabled, with a banner prompting them to sign in.

---

**Status**: Specification complete with all clarifications
**Next Steps**: Ready for implementation - start with Phase 1 (Local Search)
