# API Chat Session Issue Analysis and Plan

## Current State Analysis

### Database Schema (`/database/schema/02-chat.sql`)

**Chat Sessions Table Structure:**

- `id TEXT PRIMARY KEY` - Supports client-generated IDs
- `user_id UUID` - Foreign key to profiles
- `title VARCHAR(255)` - Session title
- `is_active BOOLEAN DEFAULT true` - Active session flag
- `created_at`, `updated_at`, `last_activity` - Timestamps
- Metadata fields: `message_count`, `total_tokens`, `last_model`, etc.

**Key Functions and Triggers:**

1. `update_session_timestamp()` - Automatically updates `updated_at` and `last_activity` on session updates
2. `update_session_stats()` - Updates session statistics when messages change
3. Trigger `on_session_updated` - Calls `update_session_timestamp()` before any UPDATE

**Problem Identified:** The `update_session_timestamp()` trigger fires on ALL session updates, including `is_active` changes, which may not be desired for simple status switches.

### Current API Endpoint (`/src/app/api/chat/session/route.ts`)

**Current Capabilities:**

- GET: Retrieves single session by ID
- POST: Updates session metadata (title, message_count, total_tokens, etc.)

**Missing Capabilities:**

- No `is_active` field handling in SessionUpdateData interface
- No logic to set one session active and others inactive atomically

### Frontend Store (`/stores/useChatStore.ts`)

**Current Session Selection:**

- `switchConversation(id)` method exists
- Updates local state: sets `isActive: true` for selected conversation
- Sets `isActive: false` for all other conversations
- Does NOT sync with backend - purely local state management

**Event Flow:** When user clicks conversation in ChatSidebar → `handleConversationClick()` → `switchConversation()` → local state only

## Issues to Address

### 1. Database Function for Active Session Management

Need to create a function that can set `is_active = true` for one session and `is_active = false` for all others WITHOUT triggering `update_session_timestamp()`.

### 2. API Endpoint Enhancement

The `/api/chat/session` endpoint needs to:

- Handle `is_active` field updates
- Support atomic "set active session" operation
- Allow both title updates and active status updates

### 3. Frontend Integration

Need to modify `switchConversation()` to call the backend API when user selects a conversation.

## Proposed Solution

### Phase 1: Database Function Creation

Create a specialized function `set_active_session(user_id, session_id)` that:

- Sets target session `is_active = true`
- Sets all other user sessions `is_active = false`
- Uses direct SQL to bypass the timestamp trigger
- Maintains data consistency with proper transaction handling

### Phase 2: API Endpoint Enhancement

Modify `/api/chat/session/route.ts`:

- Add `is_active?: boolean` to `SessionUpdateData` interface
- Add logic to handle active session switching
- Support both individual field updates and atomic active switching
- Maintain backward compatibility for title updates

### Phase 3: Frontend Integration

Update `useChatStore.ts`:

- Modify `switchConversation()` to call `/api/chat/session` endpoint
- Add error handling for backend sync failures
- Maintain local state as fallback
- Add loading states for session switching

## Implementation Plan

### Step 1: Create Database Function

Create `/database/patches/active-session-management/01-active-session-function.sql`:

```sql
CREATE OR REPLACE FUNCTION public.set_active_session(
    target_user_id UUID,
    target_session_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Verify session exists and belongs to user
    IF NOT EXISTS (
        SELECT 1 FROM public.chat_sessions
        WHERE id = target_session_id AND user_id = target_user_id
    ) THEN
        RETURN FALSE;
    END IF;

    -- Update all sessions for this user in single transaction
    -- Use direct UPDATE to avoid timestamp trigger complexity
    UPDATE public.chat_sessions SET is_active = false
    WHERE user_id = target_user_id;

    UPDATE public.chat_sessions SET is_active = true
    WHERE id = target_session_id AND user_id = target_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 2: Enhance API Endpoint

- Add `is_active` support to POST handler
- Add special handling for active session switching
- Maintain atomic operations

### Step 3: Update Frontend Store

- Add API call to `switchConversation()`
- Add error handling and loading states
- Maintain local state consistency

## Testing Strategy

1. **Database Function Testing**: Verify atomic updates without unnecessary timestamp changes
2. **API Endpoint Testing**: Test both title updates and active session switching
3. **Frontend Integration Testing**: Verify seamless user experience
4. **Concurrency Testing**: Ensure proper handling of simultaneous session switches

## Risk Mitigation

1. **Backward Compatibility**: Maintain existing API interface
2. **Error Handling**: Graceful fallback to local state on API failures
3. **Data Consistency**: Use database transactions for atomic operations
4. **Performance**: Minimal overhead for session switching operations

## Success Criteria

1. ✅ User can switch active sessions from ChatSidebar
2. ✅ Backend `is_active` status updates correctly
3. ✅ Only one session per user is active at any time
4. ✅ Timestamp triggers work appropriately for meaningful updates
5. ✅ Title editing continues to work as before
6. ✅ All operations are atomic and consistent

---

_Analysis completed - ready to proceed with implementation phases._

## POST /api/chat/session
