-- Patch 004: Decouple message_token_costs from chat_sessions/chat_messages & remove cascading delete on user_id
-- Date: 2025-08-12
-- Rationale: Preserve immutable billing/audit cost rows when users delete conversations or individual messages.
--            Conversation/message deletion should not cascade and erase historical cost; user deletion should not
--            automatically wipe cost rows either. We retain a non-cascading FK to profiles for ownership integrity.

BEGIN;

-- Drop existing foreign key constraints if they exist (names may vary depending on initial creation order)
ALTER TABLE public.message_token_costs DROP CONSTRAINT IF EXISTS message_token_costs_session_id_fkey;
ALTER TABLE public.message_token_costs DROP CONSTRAINT IF EXISTS message_token_costs_assistant_message_id_fkey;
ALTER TABLE public.message_token_costs DROP CONSTRAINT IF EXISTS message_token_costs_user_id_fkey;

-- Re-add ONLY the user_id foreign key WITHOUT ON DELETE CASCADE (default NO ACTION)
ALTER TABLE public.message_token_costs
    ADD CONSTRAINT message_token_costs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

-- Note: We intentionally do NOT re-create FKs to chat_sessions or chat_messages to avoid blocking deletions
--       or cascading deletes that would remove audit cost records. The assistant_message_id UNIQUE constraint
--       still prevents duplicate cost rows. Downstream queries should treat session_id/assistant_message_id
--       as denormalized references that may not resolve after a deletion.

COMMIT;

-- End Patch 004
