# /api/chat/sync Endpoint Flow

## Overview

This document traces the complete path when the `/api/chat/sync` endpoint is called. It covers how the endpoint is triggered in the frontend, the payload sent, what database tables are modified, and which triggers and functions execute downstream.

## Database Schema

For full database schema, refer to create sqls in the `database` directory.

- [01-complete-user-management.sql](../database/01-complete-user-management.sql)
- [02-complete-chat-history.sql](../database/02-complete-chat-history.sql)
- [03-complete-user-enhancements.sql](../database/03-complete-user-enhancements.sql)
- [04-complete-system-final.sql](../database/04-complete-system-final.sql)

## When is `/api/chat/sync` Triggered?

- **After sending a message** – `sendMessage` in `useChatStore` schedules a sync once the assistant reply is stored. The behaviour was implemented in the auto-sync fix.
- **After editing a conversation title** – `updateConversationTitle` schedules a sync 100 ms after the title update.
- **During sign‑in** – the `useChatSync` hook performs a sync to upload any locally stored conversations when the user session becomes authenticated.

Relevant excerpt from the auto-sync fix documentation:

```
- ✅ After assistant response successfully completes …
- ✅ When conversation titles are updated manually …
```

[/docs/phase-2-auto-sync-fix.md](../docs/phase-2-auto-sync-fix.md) (lines 10–29).

## Payload Sent to the Endpoint

`syncConversations` collects all conversations that belong to the logged‑in user and POSTs them in a JSON body:

```ts
await fetch("/api/chat/sync", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ conversations: userConversations }),
});
```

[/stores/useChatStore.ts](../stores/useChatStore.ts) (lines 934-940)

Each conversation object conforms to `Conversation` in `stores/types/chat.ts` and contains an array of `ChatMessage` items:

```ts
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  userId?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalTokens: number;
  …
}
```

[/stores/types/chat.ts](../stores/types/chat.ts) (lines 5-18)

`ChatMessage` includes token metadata that is also synced:

```ts
export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  user_message_id?: string;
  model?: string;
  contentType?: "text" | "markdown";
  completion_id?: string;
  error?: boolean;
}
```

[/lib/types/chat.ts](../lib/types/chat.ts) (lines 3-18)

## Endpoint Logic

Inside `src/app/api/chat/sync/route.ts`, the POST handler iterates over each conversation and performs upserts:

1. **Upsert into `chat_sessions`** using the conversation ID and metadata.
2. **Upsert messages into `chat_messages`** for that session.

If any error occurs per conversation, it is recorded in the `syncResults` object returned to the client.

[/src/app/api/chat/sync/route.ts](../src/app/api/chat/sync/route.ts) (lines 60-128)

## Database Effects

The direct upserts in the endpoint cause several triggers and functions to run:

1. **Trigger `on_message_change`** on `chat_messages` fires for every inserted or updated message.
   - Executes `update_session_stats()` which recalculates message count, tokens and last preview for the session.
   - Within this function, if the new row is a `user` or `assistant` message, it calls `track_user_usage()` to increment usage statistics.
     【F:database/02-complete-chat-history.sql†L220-L268】
2. **Trigger `on_session_updated`** on `chat_sessions` runs before each session update and sets `updated_at` and `last_activity`.
   【F:database/02-complete-chat-history.sql†L360-L372】
3. **`track_user_usage()`** inserts or updates a row in `user_usage_daily` and also updates the `usage_stats` JSON in `profiles`.
   【F:database/03-complete-user-enhancements.sql†L143-L210】

Because the sync endpoint upserts **all** conversations and messages provided by the client, these triggers execute even for rows that have not actually changed. Updating an existing message again passes its token counts into `track_user_usage()`, which increments totals in `user_usage_daily` and `profiles` a second time. This can inflate analytics such as `api_user_summary` and `daily usage` views.

## Suggestions

- Avoid unnecessary updates by checking whether a message or session already exists and whether any fields changed before upserting.
- Alternatively, call the database function `sync_user_conversations()` (defined in the schema) which could be extended to handle deduplication within PostgreSQL.
- Review the trigger logic in `update_session_stats()` so that updates that do not modify token counts do not call `track_user_usage()` again.

## Relevant Scenario Summary

The steps in _DB_StepThrough.md_ describe the same flow:

```
1. API endpoint `/api/chat/sync` performs direct upserts …
2. These upserts trigger `on_message_change` and `on_session_updated` …
3. Triggers execute `update_session_stats()` and `update_session_timestamp()` …
4. Backend/API may call `track_user_usage()` to update daily usage stats …
```

[/docs/database/DB_StepThrough.md](../docs/database/DB_StepThrough.md) (lines 272-277)

---

This analysis shows how the sync endpoint currently writes every row, causing all downstream triggers to fire even when data is unchanged. Adjusting the sync strategy or trigger logic would prevent inflated analytics.

## Debugging the issue in supabase

```sql
select * from profiles;
-- f319ca56-4197-477c-92e7-e6e2d95884be teamcmcbot
-- bc764bc1-e02e-415e-97f3-36f5bdf7777e zhenwei
-- 6324e1ee-1a7b-450c-8c9f-130e895696c2 mcdvotes

select * from chat_sessions where user_id='6324e1ee-1a7b-450c-8c9f-130e895696c2';
-- created_at: ok..
-- updated_at: when is this updated? on every sync? when title change? when new messages is added to this conversation?  --> 2025-07-24 16:14:12.217066+00
-- last_activity: difference with updated_at? Seems to be exact same functionality as updated_at  --> 2025-07-24 16:14:12.217066+00
-- last_message_timestamp: ok.. -> 2025-07-24 16:14:11.378+00
select count(*) from chat_sessions where user_id='6324e1ee-1a7b-450c-8c9f-130e895696c2'; -- 2
select id from chat_sessions where user_id='6324e1ee-1a7b-450c-8c9f-130e895696c2';

select * from chat_messages where session_id in (select id from chat_sessions where user_id='6324e1ee-1a7b-450c-8c9f-130e895696c2') order by session_id, message_timestamp asc;
-- TODO: Do not update input_tokens value for role=assistance

select * from user_usage_daily where user_id='6324e1ee-1a7b-450c-8c9f-130e895696c2' order by usage_date desc;
-- usage_date 2025-07-24
-- messsage_sent 2, message_received 2
-- input_tokens 10, output_tokens 1038, total_tokens 1048 --> This is because they are adding the sum of (input_tokens + output_tokens) in chat_mesages without considering message_timestamp? They are probably using updated_at or last_activity timestamp from the sessions tables to link to the messages table..?
-- models_used: {"moonshotai/kimi-k2:free":1,"google/gemini-2.5-flash-lite":1}
-- sessions_created: 0 how???
-- active_minutes: 4 how is this calculated?
-- estimated_cost: TODO: need something to keep model_access updated periodically to openrouter models.
--

select * from api_user_summary;
-- This view is just mainly profiles table + messages_today, tokens_today + total_sessions?
-- how and when is this view updated? Or is it calculated on the fly when you run the view?
-- message_today 0, tokens_today 0, total_sessions 2
```

## Notes to self

- The `sync` endpoint is primarily used to upload conversations when a user signs in with existing local data.
- for each messages, it trggers the `on_message_change` trigger which updates the session stats and calls `track_user_usage()`.

```sql
  -- Trigger to update session stats when messages change
  CREATE OR REPLACE TRIGGER on_message_change
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();
```

```sql
-- Function to update session statistics when messages change
CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_stats RECORD;
    total_input_tokens INTEGER := 0;
    total_output_tokens INTEGER := 0;
BEGIN
    -- Determine which session to update
    IF TG_OP = 'DELETE' THEN
        -- Use OLD record for DELETE operations
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = OLD.session_id
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = OLD.session_id
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = OLD.session_id;

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = OLD.session_id;
    ELSE
        -- Use NEW record for INSERT/UPDATE operations
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = NEW.session_id
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = NEW.session_id
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = NEW.session_id;

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = NEW.session_id;

        -- Update user_usage_daily with detailed token tracking
        IF NEW.role IN ('user', 'assistant') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END, -- messages_sent
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END, -- messages_received
                CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.input_tokens, 0) ELSE 0 END, -- input_tokens
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.output_tokens, 0) ELSE 0 END, -- output_tokens
                NEW.model, -- model_used
                false, -- session_created
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_time, 0) ELSE 0 END -- active_minutes
            );
        END IF;
    END IF;

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

```sql
-- Function to track user usage
CREATE OR REPLACE FUNCTION public.track_user_usage(
    p_user_id UUID,
    p_messages_sent INTEGER DEFAULT 0,
    p_messages_received INTEGER DEFAULT 0,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_session_created BOOLEAN DEFAULT false,
    p_active_minutes INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
    today_date DATE := CURRENT_DATE;
    model_usage JSONB;
BEGIN
    -- Get current model usage for today
    SELECT models_used INTO model_usage
    FROM public.user_usage_daily
    WHERE user_id = p_user_id AND usage_date = today_date;

    -- Update model usage if a model was used
    IF p_model_used IS NOT NULL THEN
        IF model_usage IS NULL THEN
            model_usage := jsonb_build_object(p_model_used, 1);
        ELSE
            model_usage := jsonb_set(
                model_usage,
                ARRAY[p_model_used],
                (COALESCE((model_usage->>p_model_used)::integer, 0) + 1)::text::jsonb
            );
        END IF;
    END IF;

    -- Insert or update daily usage
    INSERT INTO public.user_usage_daily (
        user_id, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, total_tokens, models_used,
        sessions_created, active_minutes
    ) VALUES (
        p_user_id, today_date, p_messages_sent, p_messages_received,
        p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
        COALESCE(model_usage, '{}'::jsonb),
        CASE WHEN p_session_created THEN 1 ELSE 0 END,
        p_active_minutes
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        messages_sent = user_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = user_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = user_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = user_usage_daily.output_tokens + EXCLUDED.output_tokens,
        total_tokens = user_usage_daily.total_tokens + EXCLUDED.total_tokens,
        models_used = COALESCE(EXCLUDED.models_used, user_usage_daily.models_used),
        sessions_created = user_usage_daily.sessions_created + EXCLUDED.sessions_created,
        active_minutes = user_usage_daily.active_minutes + EXCLUDED.active_minutes,
        updated_at = NOW();

    -- Update profile usage stats
    UPDATE public.profiles SET
        usage_stats = jsonb_set(
            jsonb_set(
                jsonb_set(
                    usage_stats,
                    '{total_messages}',
                    ((COALESCE((usage_stats->>'total_messages')::integer, 0) + p_messages_sent + p_messages_received))::text::jsonb
                ),
                '{total_tokens}',
                ((COALESCE((usage_stats->>'total_tokens')::integer, 0) + p_input_tokens + p_output_tokens))::text::jsonb
            ),
            '{sessions_created}',
            ((COALESCE((usage_stats->>'sessions_created')::integer, 0) + CASE WHEN p_session_created THEN 1 ELSE 0 END))::text::jsonb
        ),
        last_active = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

```sql
-- Trigger to update session timestamp on updates
CREATE OR REPLACE TRIGGER on_session_updated
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_session_timestamp();
```

```sql
-- Function to update session timestamp on updates
CREATE OR REPLACE FUNCTION public.update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Things to fix ordered by priority

~~1. input_tokens should not be updated for assistant messages, this is causing the calculation of input/output/total tokens in user_usage_daily to be incorrect.~~

2. Sync endpoints should only be used for 1 scenario: when user has existing conversations while unauthenticated, and then signs in, we should sync NEW conversations from local storage to supabase. This shoud be an insert only operation, IF for any reason intentional or untintentional the local storage contains existing conversations in DB, we must not update them, we should only insert new conversations. TODO: check if functon sync_user_conversations() is doing this correctly, currently this function is not used anywhere in the codebase.

3. The chat endpoint when receiving a successful assistant response, should asynchronously call the messages or sessions endpoint to update database with the new message, we should not wait for frontend to call the sync endpoint. A successful assistant response means we are updating 2 new messages (user,assistant) with their relevant metadata AND sessions table with the new message count, total tokens, last model, last message preview, last message timestamp, updated_at. TODO: what about unsuccessful assistant responses? Do we update database? If not, when they retry, do the current code retry with the same message with the same metadata?
