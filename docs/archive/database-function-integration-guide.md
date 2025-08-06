# Database Function Integration Guide

## Overview

This document explains how the database functions are integrated with the API endpoints and when they are triggered in the token enhancement feature.

## Corrected Database Integration Flow

### 1. Sync API - Direct Database Operations

**Location**: [`/api/chat/sync`](../src/app/api/chat/sync/route.ts) POST endpoint

**How It Actually Works**:

- **Direct Supabase upserts** to `chat_sessions` and `chat_messages` tables
- **No database functions called** - uses direct SQL operations via Supabase client
- **Enhanced with new token fields** (`input_tokens`, `output_tokens`, `user_message_id`)

**Actual Code Implementation**:

```typescript
// Direct upsert to chat_sessions table
const { error: sessionError } = await supabase.from("chat_sessions").upsert({
  id: databaseId,
  user_id: user.id,
  title: conversation.title,
  // ... other fields
});

// Direct upsert to chat_messages table with new token fields
const messagesData = conversation.messages.map((message: ChatMessage) => ({
  id: message.id,
  session_id: databaseId,
  role: message.role,
  content: message.content,
  total_tokens: message.total_tokens || 0,
  input_tokens: message.input_tokens || 0, // NEW
  output_tokens: message.output_tokens || 0, // NEW
  user_message_id: message.user_message_id, // NEW
  // ... other fields
}));

const { error: messagesError } = await supabase
  .from("chat_messages")
  .upsert(messagesData);
```

### 2. `update_session_stats()` Function (Original Name)

**Location**: Updated in [`database/05-token-enhancement-migration.sql`](../database/05-token-enhancement-migration.sql)

**Triggered By**:

- Database trigger `on_message_change` on `chat_messages` table (INSERT/UPDATE/DELETE)

**When It's Called**:

- Automatically when any message is added, updated, or deleted via the sync API
- Runs in background without explicit API calls

**What It Does**:

- Updates `chat_sessions` statistics (message count, total tokens)
- **ENHANCED**: Now handles separate input/output token tracking
- **ENHANCED**: Calls `track_user_usage()` with detailed token breakdown
- Maintains session metadata automatically

**Trigger Setup**:

```sql
-- Uses original trigger name (no "enhanced" suffix)
DROP TRIGGER IF EXISTS on_message_change ON public.chat_messages;
CREATE TRIGGER on_message_change
    AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();
```

### 3. `track_user_usage()` Function

**Location**: Existing function in [`database/03-complete-user-enhancements.sql`](../database/03-complete-user-enhancements.sql)

**Triggered By**:

- Called by `update_session_stats()` function when new messages are processed
- Can be called directly by API endpoints

**What It Does**:

- Tracks daily usage statistics in `user_usage_daily` table
- **ENHANCED**: Now receives separate input/output token data
- Integrates with existing analytics infrastructure

## Actual Data Flow

```
User sends message → Chat API → OpenRouter → Response with tokens
                                    ↓
Frontend updates user message with input_tokens ← API returns request_id
                                    ↓
Frontend creates assistant message with output_tokens
                                    ↓
User syncs to database → /api/chat/sync → Direct upsert to chat_messages
                                    ↓
Database trigger fires → on_message_change → update_session_stats()
                                    ↓
Analytics updated → track_user_usage() → user_usage_daily table
```

## Key Corrections

### ❌ What I Initially Got Wrong

- Assumed `sync_user_conversations()` function was being used
- Created "enhanced" versions of functions with new names
- Misunderstood the sync API implementation

### ✅ What Actually Happens

- Sync API does **direct database upserts** via Supabase client
- **Original function names** are preserved and enhanced
- **Database triggers** handle the analytics automatically

## Migration Safety

### Database Changes

- **Same function names**: `update_session_stats()` (not "enhanced")
- **Same trigger names**: `on_message_change` (not "enhanced")
- **Enhanced functionality**: Handles new token fields seamlessly
- **Zero downtime**: Functions replaced with `CREATE OR REPLACE`

### API Integration

- **No API changes needed**: Sync API already handles new token fields
- **Direct upserts work**: Database accepts new columns with defaults
- **Automatic analytics**: Triggers fire when data is inserted

## Testing the Corrected Integration

### 1. Send a Test Message

```bash
curl -X POST /api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "model": "gpt-3.5-turbo"}'
```

### 2. Check Database After Sync

```sql
-- Verify new columns exist and have data
SELECT id, role, input_tokens, output_tokens, user_message_id
FROM chat_messages
ORDER BY message_timestamp DESC
LIMIT 5;
```

### 3. Verify Trigger Function Works

```sql
-- Check that session stats are updated automatically
SELECT id, message_count, total_tokens, last_message_timestamp
FROM chat_sessions
ORDER BY updated_at DESC
LIMIT 5;
```

### 4. Verify Analytics Integration

```sql
-- Check analytics integration via trigger
SELECT user_id, usage_date, input_tokens, output_tokens, total_tokens
FROM user_usage_daily
WHERE usage_date = CURRENT_DATE;
```

## Conclusion

The database integration is simpler than initially designed:

1. **Sync API** does direct database operations (no function calls)
2. **Database triggers** handle analytics automatically
3. **Original function names** are preserved and enhanced
4. **Zero breaking changes** to existing functionality

The migration enhances existing functions rather than creating new ones, ensuring seamless integration with the current architecture.
