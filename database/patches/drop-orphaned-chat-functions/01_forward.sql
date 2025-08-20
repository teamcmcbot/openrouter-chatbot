-- drop-orphaned-chat-functions / 01_forward.sql
-- Purpose: Fully drop unused chat functions from the database.
-- Functions removed from canonical schema in 2025-08; this patch deletes any existing copies in live DB.

BEGIN;

-- Drop with explicit signatures, idempotent
DROP FUNCTION IF EXISTS public.get_session_with_messages(text, uuid);
DROP FUNCTION IF EXISTS public.sync_user_conversations(uuid, jsonb);

COMMIT;
