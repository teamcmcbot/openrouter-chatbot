# TODO task list for database

## Tables

| Table Name               | Description                                                  | Triggers for this table + function it calls                                                                                                                                        | Triggers/functions for other tables that insert/update/delete this table                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| public.profiles          | Contains user profile information, extending from auth.users | update_profiles_updated_at (BEFORE INSERT OR UPDATE) → update_updated_at_column()<br>on_auth_user_profile_sync (AFTER INSERT OR UPDATE ON auth.users) → handle_user_profile_sync() | Inserts/updates to auth.users trigger on_auth_user_profile_sync, which inserts/updates public.profiles<br>Updates to public.profiles trigger update_profiles_updated_at                                      |
| public.user_activity_log | Logs user activity events                                    | None                                                                                                                                                                               | log_user_activity() function inserts records here (called from profile sync and other events)                                                                                                                |
| public.chat_sessions     | Stores metadata about user chat sessions                     | on_session_updated (BEFORE UPDATE) → update_session_timestamp()                                                                                                                    | Inserts/updates to public.chat_messages trigger on_message_change, which calls update_session_stats() to update public.chat_sessions<br>Bulk sync via sync_user_conversations() updates public.chat_sessions |
| public.chat_messages     | Contains individual chat messages                            | on_message_change (AFTER INSERT OR UPDATE OR DELETE) → update_session_stats()                                                                                                      | Inserts/updates/deletes to public.chat_messages trigger on_message_change<br>Bulk sync via sync_user_conversations() inserts/updates public.chat_messages                                                    |
| public.user_usage_daily  | Tracks daily user activity and usage statistics              | None                                                                                                                                                                               | track_user_usage() function updates/inserts records here (called after chat activity)                                                                                                                        |
| public.model_access      | Manages user access to different AI models                   | None                                                                                                                                                                               | Updated via model tier changes, but no direct triggers/functions listed                                                                                                                                      |
| public.system_cache      | Caches system-wide settings and preferences                  | None                                                                                                                                                                               | No triggers/functions; currently unused                                                                                                                                                                      |
| public.system_stats      | System statistics table                                      | None                                                                                                                                                                               | No triggers/functions; currently unused                                                                                                                                                                      |

## Functions

| Function Name                                                                                  | Description                                                                           | Table(s) it writes to                                                  | Functions it calls                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| public.update_updated_at_column()                                                              | Updates the updated_at timestamp and initializes usage stats on profile insert/update | public.profiles                                                        | None                                       |
| public.log_user_activity(...)                                                                  | Logs a user activity event for auditing                                               | public.user_activity_log                                               | None                                       |
| public.handle_user_profile_sync()                                                              | Syncs profile data from auth.users to public.profiles on insert/update                | public.profiles, public.user_activity_log                              | None                                       |
| public.sync_profile_from_auth(user_uuid UUID)                                                  | Manually syncs profile data for a given user from auth.users                          | public.profiles                                                        | None                                       |
| public.update_session_stats()                                                                  | Updates session statistics (tokens, message count) when chat messages change          | public.chat_sessions                                                   | None                                       |
| public.update_session_timestamp()                                                              | Updates session timestamps on session update                                          | public.chat_sessions                                                   | None                                       |
| public.get_user_recent_sessions(user_uuid UUID, session_limit INTEGER DEFAULT 10)              | Returns a user's recent chat sessions for API use                                     | None                                                                   | None                                       |
| public.get_session_with_messages(session_text_id TEXT, requesting_user_uuid UUID)              | Returns a chat session and its messages for a user (API)                              | None                                                                   | None                                       |
| public.sync_user_conversations(user_uuid UUID, conversations_data JSONB)                       | Bulk syncs multiple conversations for a user (API)                                    | public.chat_sessions, public.chat_messages                             | None                                       |
| public.track_user_usage(...)                                                                   | Tracks and updates daily usage stats for a user, including tokens and sessions        | public.user_usage_daily                                                | None                                       |
| public.get_user_allowed_models(user_uuid UUID)                                                 | Returns models a user is allowed to access based on their tier                        | None                                                                   | None                                       |
| public.can_user_use_model(user_uuid UUID, model_to_check VARCHAR(100))                         | Checks if a user can access a specific model                                          | None                                                                   | None                                       |
| public.update_user_tier(user_uuid UUID, new_tier VARCHAR(20))                                  | Updates a user's subscription tier                                                    | public.profiles                                                        | None                                       |
| jsonb_deep_merge(a jsonb, b jsonb)                                                             | Utility function for deep merging two JSONB objects                                   | None                                                                   | jsonb_deep_merge (recursive)               |
| public.update_user_preferences(user_uuid UUID, preference_type VARCHAR(50), preferences JSONB) | Updates a user's preferences (UI, session, model) with deep merge                     | public.profiles                                                        | jsonb_deep_merge, public.log_user_activity |
| public.get_user_complete_profile(user_uuid UUID)                                               | Returns a user's complete profile, preferences, allowed models, and usage stats       | None                                                                   | public.get_user_allowed_models             |
| public.cleanup_old_data(days_to_keep INTEGER DEFAULT 90)                                       | Cleans up old activity logs, usage data, and expired cache entries                    | public.user_activity_log, public.user_usage_daily, public.system_cache | None                                       |
| public.export_user_data(user_uuid UUID)                                                        | Exports all user data for GDPR compliance                                             | None                                                                   | None                                       |
| public.analyze_database_health()                                                               | Analyzes database health, table sizes, and index usage                                | None                                                                   | None                                       |

## Triggers

| Trigger Name               | Operations That Trigger It                               | Function Called            | Source File                     | Remarks                                                            |
| -------------------------- | -------------------------------------------------------- | -------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| update_profiles_updated_at | BEFORE INSERT OR UPDATE ON public.profiles               | update_updated_at_column() | 01-complete-user-management.sql | Ensures updated_at is set and usage stats initialized for profiles |
| on_auth_user_profile_sync  | AFTER INSERT OR UPDATE ON auth.users                     | handle_user_profile_sync() | 01-complete-user-management.sql | Syncs profile data from auth.users to public.profiles              |
| on_message_change          | AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages | update_session_stats()     | 02-complete-chat-history.sql    | Updates session statistics when chat messages change               |
| on_session_updated         | BEFORE UPDATE ON public.chat_sessions                    | update_session_timestamp() | 02-complete-chat-history.sql    | Updates session timestamps on any session update                   |

## Indexes

| Index Name                          | Table/Columns                                                                                       | Description                                                     | Source File                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------- |
| idx_profiles_email                  | public.profiles(email)                                                                              | Speeds up lookups by email for profiles                         | 01-complete-user-management.sql   |
| idx_profiles_last_active            | public.profiles(last_active)                                                                        | Optimizes queries by last active timestamp                      | 01-complete-user-management.sql   |
| idx_profiles_subscription_tier      | public.profiles(subscription_tier)                                                                  | Optimizes queries by subscription tier                          | 01-complete-user-management.sql   |
| idx_activity_log_user_id            | public.user_activity_log(user_id)                                                                   | Speeds up lookups of activity logs by user                      | 01-complete-user-management.sql   |
| idx_activity_log_timestamp          | public.user_activity_log(timestamp)                                                                 | Optimizes queries by activity timestamp                         | 01-complete-user-management.sql   |
| idx_activity_log_action             | public.user_activity_log(action)                                                                    | Optimizes queries by action type                                | 01-complete-user-management.sql   |
| idx_chat_sessions_user_id           | public.chat_sessions(user_id)                                                                       | Speeds up lookups of chat sessions by user                      | 02-complete-chat-history.sql      |
| idx_chat_sessions_updated_at        | public.chat_sessions(updated_at DESC)                                                               | Optimizes queries for most recently updated sessions            | 02-complete-chat-history.sql      |
| idx_chat_sessions_user_updated      | public.chat_sessions(user_id, updated_at DESC)                                                      | Optimizes queries for a user's most recent sessions             | 02-complete-chat-history.sql      |
| idx_chat_messages_session_id        | public.chat_messages(session_id)                                                                    | Speeds up lookups of messages by session                        | 02-complete-chat-history.sql      |
| idx_chat_messages_timestamp         | public.chat_messages(message_timestamp)                                                             | Optimizes queries by message timestamp                          | 02-complete-chat-history.sql      |
| idx_chat_messages_session_timestamp | public.chat_messages(session_id, message_timestamp)                                                 | Optimizes queries for messages in a session by timestamp        | 02-complete-chat-history.sql      |
| idx_chat_messages_completion_id     | public.chat_messages(completion_id)                                                                 | Speeds up lookups by completion ID                              | 02-complete-chat-history.sql      |
| idx_chat_messages_user_message_id   | public.chat_messages(user_message_id) WHERE user_message_id IS NOT NULL                             | Optimizes queries for user message IDs (when present)           | 02-complete-chat-history.sql      |
| idx_chat_messages_tokens_role       | public.chat_messages(role, input_tokens, output_tokens) WHERE input_tokens > 0 OR output_tokens > 0 | Optimizes queries for token usage by role                       | 02-complete-chat-history.sql      |
| idx_usage_daily_user_date           | public.user_usage_daily(user_id, usage_date DESC)                                                   | Speeds up lookups of daily usage by user and date               | 03-complete-user-enhancements.sql |
| idx_usage_daily_date                | public.user_usage_daily(usage_date DESC)                                                            | Optimizes queries by usage date                                 | 03-complete-user-enhancements.sql |
| idx_model_access_tier               | public.model_access(tier, is_active)                                                                | Optimizes queries for model access by tier and active status    | 03-complete-user-enhancements.sql |
| idx_model_access_model_id           | public.model_access(model_id, is_active)                                                            | Speeds up lookups of model access by model ID and active status | 03-complete-user-enhancements.sql |
| idx_system_cache_expires            | public.system_cache(expires_at) WHERE expires_at IS NOT NULL                                        | Optimizes queries for expiring cache entries                    | 04-complete-system-final.sql      |
| idx_system_stats_date               | public.system_stats(stat_date DESC)                                                                 | Optimizes queries for system stats by date                      | 04-complete-system-final.sql      |

## Views

| View Name               | Description                                                                         | Tables/Views it reads from                                     | Source File                  |
| ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- |
| public.api_user_summary | Provides a summary of API usage per user, including session counts and recent usage | public.profiles, public.chat_sessions, public.user_usage_daily | 04-complete-system-final.sql |

## Scenarios

- User Sign in for the first time
- Existing user signs in
- User sends a message and receives a response
- User edits titles of conversations
- User delete a conversation
- User clear all conversations

## API Endpoints

- what is the API endpoint for user sign in?
- /api/chat/
- /api/chat/clear-all
- /api/chat/messages
- /api/chat/sessions
- /api/chat/sync

## Scenario: User Sign in for the first time

1. User inserted in `auth.users` (by Supabase Auth).
2. Triggers `on_auth_user_profile_sync` (AFTER INSERT OR UPDATE ON `auth.users`).
3. Trigger executes function `handle_user_profile_sync()`.
4. Function checks if user exists in `public.profiles`.
5. User does not exist, inserts user record into `public.profiles`.
6. Calls function `log_user_activity()` to log a `profile_created` event.
7. Function inserts a `profile_created` record into table `public.user_activity_log`.
8. BEFORE INSERT trigger `update_profiles_updated_at` fires on `public.profiles`.
9. Trigger executes function `update_updated_at_column()` to set `updated_at` and initialize `usage_stats`.

## Scenario: Existing user signs in

1. User record in `auth.users` is updated (by Supabase Auth).
2. Triggers `on_auth_user_profile_sync` (AFTER INSERT OR UPDATE ON `auth.users`).
3. Trigger executes function `handle_user_profile_sync()`.
4. Function checks if user exists in `public.profiles`.
5. User exists, updates profile fields in `public.profiles` (email, full_name, avatar_url, last_active, updated_at).
6. If profile was updated, calls function `log_user_activity()` to log a `profile_synced` event (if no recent sync or email changed).
7. Function inserts a `profile_synced` record into table `public.user_activity_log`.
8. BEFORE UPDATE trigger `update_profiles_updated_at` fires on `public.profiles`.
9. Trigger executes function `update_updated_at_column()` to set `updated_at`.

## Scenario: User sends a message and receives a response

1. New message inserted into `public.chat_messages` (via `/api/chat/messages`).
2. AFTER INSERT trigger `on_message_change` fires on `public.chat_messages`.
3. Trigger executes function `update_session_stats()` to update session statistics in `public.chat_sessions` (message_count, total_tokens, last_message_preview, last_message_timestamp).
4. BEFORE UPDATE trigger `on_session_updated` fires on `public.chat_sessions`.
5. Trigger executes function `update_session_timestamp()` to update `updated_at` and `last_activity` in `public.chat_sessions`.
6. Backend/API calls function `track_user_usage()` to update daily usage stats in `public.user_usage_daily` (messages_sent, messages_received, input_tokens, output_tokens, total_tokens, models_used, sessions_created, active_minutes).

## Scenario: User edits titles of conversations

1. Title updated in `public.chat_sessions` (via `/api/chat/sessions`).
2. BEFORE UPDATE trigger `on_session_updated` fires on `public.chat_sessions`.
3. Trigger executes function `update_session_timestamp()` to update `updated_at` and `last_activity` in `public.chat_sessions`.

## Scenario: User deletes a conversation

1. Conversation deleted from `public.chat_sessions` (via `/api/chat/sessions`).
2. All related messages deleted from `public.chat_messages` (cascade or manual).
3. AFTER DELETE trigger `on_message_change` fires on `public.chat_messages` for each deleted message.
4. Trigger executes function `update_session_stats()` (if session still exists).

## Scenario: User clears all conversations

1. All conversations deleted from `public.chat_sessions` (via `/api/chat/clear-all`).
2. All related messages deleted from `public.chat_messages`.
3. AFTER DELETE trigger `on_message_change` fires on `public.chat_messages` for each deleted message.
4. Trigger executes function `update_session_stats()` (if session still exists).

## Scenario: Sync conversations (bulk)

1. API endpoint `/api/chat/sync` performs direct upserts to `public.chat_sessions` and `public.chat_messages` using the Supabase client (not the Postgres function `sync_user_conversations`).
2. These upserts trigger the database triggers: `on_message_change` (on `chat_messages`) and `on_session_updated` (on `chat_sessions`).
3. Triggers execute `update_session_stats()` and `update_session_timestamp()` for each affected session/message.
4. Backend/API may call function `track_user_usage()` to update daily usage stats in `public.user_usage_daily`.
