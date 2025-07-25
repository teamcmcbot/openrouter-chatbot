# TODO task list for database

## Tables

1. `public.profiles` (01-complete-user-management.sql)
   - Contains user profile information, extending from `auth.users`.
   - Triggers: `update_profiles_updated_at` (BEFORE INSERT OR UPDATE), `on_auth_user_profile_sync` (AFTER INSERT OR UPDATE ON auth.users)
2. `public.user_activity_log` (01-complete-user-management.sql)
   - Logs user activity events.
   - Triggers: None
3. `public.chat_sessions` (02-complete-chat-history.sql)
   - Stores metadata about user chat sessions.
   - Triggers: `on_session_updated` (BEFORE UPDATE)
4. `public.chat_messages` (02-complete-chat-history.sql)
   - Contains individual chat messages.
   - Triggers: `on_message_change` (AFTER INSERT OR UPDATE OR DELETE)
5. `public.user_usage_daily` (03-complete-user-enhancements.sql)
   - Tracks daily user activity and usage statistics.
   - Triggers: None
6. `public.model_access` (03-complete-user-enhancements.sql)
   - Manages user access to different AI models.
   - Triggers: None
7. `public.system_cache` (04-complete-system-final.sql)
   - Caches system-wide settings and preferences.
   - Triggers: None
   - Empty table. Not used or planned for future use?
8. `public.system_stats` (04-complete-system-final.sql)
   - Triggers: None
   - Empty table. Not used or planned for future use?

## Functions

1. `public.update_updated_at_column()` (01-complete-user-management.sql)
   - Trigger function to update the `updated_at` timestamp and initialize usage stats on profile insert/update.
   - Calls: None
   - Indirectly triggered by: Inserts/updates to `public.profiles` (via trigger)
2. `public.log_user_activity(...)` (01-complete-user-management.sql)
   - Logs a user activity event to `user_activity_log` for auditing.
   - Calls: None
3. `public.handle_user_profile_sync()` (01-complete-user-management.sql)
   - Syncs profile data from `auth.users` to `public.profiles` on insert/update.
   - Calls: None
   - Indirectly triggers: `public.update_updated_at_column()` (via insert/update to `public.profiles`)
4. `public.sync_profile_from_auth(user_uuid UUID)` (01-complete-user-management.sql)
   - Manually syncs profile data for a given user from `auth.users`.
   - Calls: None
   - Indirectly triggers: `public.update_updated_at_column()` (via insert/update to `public.profiles`)
5. `public.update_session_stats()` (02-complete-chat-history.sql)
   - Trigger function to update session statistics (tokens, message count) when chat messages change.
   - Calls: None
   - Indirectly triggered by: Inserts/updates/deletes to `public.chat_messages` (via trigger)
6. `public.update_session_timestamp()` (02-complete-chat-history.sql)
   - Trigger function to update session timestamps on session update.
   - Calls: None
   - Indirectly triggered by: Updates to `public.chat_sessions` (via trigger)
7. `public.get_user_recent_sessions(user_uuid UUID, session_limit INTEGER DEFAULT 10)` (02-complete-chat-history.sql)
   - Returns a user's recent chat sessions for API use.
   - Calls: None
8. `public.get_session_with_messages(session_text_id TEXT, requesting_user_uuid UUID)` (02-complete-chat-history.sql)
   - Returns a chat session and its messages for a user (API).
   - Calls: None
9. `public.sync_user_conversations(user_uuid UUID, conversations_data JSONB)` (02-complete-chat-history.sql)
   - Bulk syncs multiple conversations for a user (API).
   - Calls: None
   - Indirectly triggers: `public.update_session_stats()` (via insert/update to `public.chat_messages`), `public.update_session_timestamp()` (via update to `public.chat_sessions`)
10. `public.track_user_usage(...)` (03-complete-user-enhancements.sql)

- Tracks and updates daily usage stats for a user, including tokens and sessions.
- Calls: None

11. `public.get_user_allowed_models(user_uuid UUID)` (03-complete-user-enhancements.sql)

- Returns models a user is allowed to access based on their tier.
- Calls: None

12. `public.can_user_use_model(user_uuid UUID, model_to_check VARCHAR(100))` (03-complete-user-enhancements.sql)

- Checks if a user can access a specific model.
- Calls: None

13. `public.update_user_tier(user_uuid UUID, new_tier VARCHAR(20))` (03-complete-user-enhancements.sql)

- Updates a user's subscription tier.
- Calls: None

14. `jsonb_deep_merge(a jsonb, b jsonb)` (04-complete-system-final.sql)

- Utility function for deep merging two JSONB objects.
- Calls: jsonb_deep_merge (recursive)

15. `public.update_user_preferences(user_uuid UUID, preference_type VARCHAR(50), preferences JSONB)` (04-complete-system-final.sql)

- Updates a user's preferences (UI, session, model) with deep merge.
- Calls: jsonb_deep_merge, public.log_user_activity
- Indirectly triggers: `public.update_updated_at_column()` (via update to `public.profiles`)

16. `public.get_user_complete_profile(user_uuid UUID)` (04-complete-system-final.sql)

- Returns a user's complete profile, preferences, allowed models, and usage stats.
- Calls: public.get_user_allowed_models

17. `public.cleanup_old_data(days_to_keep INTEGER DEFAULT 90)` (04-complete-system-final.sql)

- Cleans up old activity logs, usage data, and expired cache entries.
- Calls: None

18. `public.export_user_data(user_uuid UUID)` (04-complete-system-final.sql)

- Exports all user data for GDPR compliance.
- Calls: None

19. `public.analyze_database_health()` (04-complete-system-final.sql)

- Analyzes database health, table sizes, and index usage.
- Calls: None

## Triggers

1. `update_profiles_updated_at` (BEFORE INSERT OR UPDATE ON `public.profiles`) (01-complete-user-management.sql)
   - Ensures `updated_at` is set and usage stats initialized for profiles.
2. `on_auth_user_profile_sync` (AFTER INSERT OR UPDATE ON `auth.users`) (01-complete-user-management.sql)
   - Automatically syncs profile data from `auth.users` to `public.profiles`.
3. `on_message_change` (AFTER INSERT OR UPDATE OR DELETE ON `public.chat_messages`) (02-complete-chat-history.sql)
   - Updates session statistics when chat messages are inserted, updated, or deleted.
4. `on_session_updated` (BEFORE UPDATE ON `public.chat_sessions`) (02-complete-chat-history.sql)
   - Updates session timestamps on any session update.

## Indexes

1. `idx_profiles_email` ON `public.profiles`(email) (01-complete-user-management.sql)
   - Speeds up lookups by email for profiles.
2. `idx_profiles_last_active` ON `public.profiles`(last_active) (01-complete-user-management.sql)
   - Optimizes queries by last active timestamp.
3. `idx_profiles_subscription_tier` ON `public.profiles`(subscription_tier) (01-complete-user-management.sql)
   - Optimizes queries by subscription tier.
4. `idx_activity_log_user_id` ON `public.user_activity_log`(user_id) (01-complete-user-management.sql)
   - Speeds up lookups of activity logs by user.
5. `idx_activity_log_timestamp` ON `public.user_activity_log`(timestamp) (01-complete-user-management.sql)
   - Optimizes queries by activity timestamp.
6. `idx_activity_log_action` ON `public.user_activity_log`(action) (01-complete-user-management.sql)
   - Optimizes queries by action type.
7. `idx_chat_sessions_user_id` ON `public.chat_sessions`(user_id) (02-complete-chat-history.sql)
   - Speeds up lookups of chat sessions by user.
8. `idx_chat_sessions_updated_at` ON `public.chat_sessions`(updated_at DESC) (02-complete-chat-history.sql)
   - Optimizes queries for most recently updated sessions.
9. `idx_chat_sessions_user_updated` ON `public.chat_sessions`(user_id, updated_at DESC) (02-complete-chat-history.sql)
   - Optimizes queries for a user's most recent sessions.
10. `idx_chat_messages_session_id` ON `public.chat_messages`(session_id) (02-complete-chat-history.sql)

- Speeds up lookups of messages by session.

11. `idx_chat_messages_timestamp` ON `public.chat_messages`(message_timestamp) (02-complete-chat-history.sql)

- Optimizes queries by message timestamp.

12. `idx_chat_messages_session_timestamp` ON `public.chat_messages`(session_id, message_timestamp) (02-complete-chat-history.sql)

- Optimizes queries for messages in a session by timestamp.

13. `idx_chat_messages_completion_id` ON `public.chat_messages`(completion_id) (02-complete-chat-history.sql)

- Speeds up lookups by completion ID.

14. `idx_chat_messages_user_message_id` ON `public.chat_messages`(user_message_id) WHERE user_message_id IS NOT NULL (02-complete-chat-history.sql)

- Optimizes queries for user message IDs (when present).

15. `idx_chat_messages_tokens_role` ON `public.chat_messages`(role, input_tokens, output_tokens) WHERE input_tokens > 0 OR output_tokens > 0 (02-complete-chat-history.sql)

- Optimizes queries for token usage by role.

16. `idx_usage_daily_user_date` ON `public.user_usage_daily`(user_id, usage_date DESC) (03-complete-user-enhancements.sql)

- Speeds up lookups of daily usage by user and date.

17. `idx_usage_daily_date` ON `public.user_usage_daily`(usage_date DESC) (03-complete-user-enhancements.sql)

- Optimizes queries by usage date.

18. `idx_model_access_tier` ON `public.model_access`(tier, is_active) (03-complete-user-enhancements.sql)

- Optimizes queries for model access by tier and active status.

19. `idx_model_access_model_id` ON `public.model_access`(model_id, is_active) (03-complete-user-enhancements.sql)

- Speeds up lookups of model access by model ID and active status.

20. `idx_system_cache_expires` ON `public.system_cache`(expires_at) WHERE expires_at IS NOT NULL (04-complete-system-final.sql)

- Optimizes queries for expiring cache entries.

21. `idx_system_stats_date` ON `public.system_stats`(stat_date DESC) (04-complete-system-final.sql)

- Optimizes queries for system stats by date.

## Views

1. `public.api_user_summary` (04-complete-system-final.sql)
   - Provides a summary of API usage per user, including session counts and recent usage.
   - Gets data from `public.profiles`, `public.chat_sessions`, and `public.user_usage_daily`.

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
