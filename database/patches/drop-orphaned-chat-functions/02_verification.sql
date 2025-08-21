-- drop-orphaned-chat-functions / 02_verification.sql
-- Purpose: Verify the orphaned chat functions are absent.

SELECT 
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_session_with_messages'
      AND pg_get_function_identity_arguments(p.oid) = 'session_text_id text, requesting_user_uuid uuid'
  ) AS get_session_with_messages_absent,
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'sync_user_conversations'
      AND pg_get_function_identity_arguments(p.oid) = 'user_uuid uuid, conversations_data jsonb'
  ) AS sync_user_conversations_absent;
