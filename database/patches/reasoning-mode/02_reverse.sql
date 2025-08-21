-- reasoning-mode / 02_reverse.sql
-- Purpose: Reverse the forward migration for reasoning fields. No function changes.

BEGIN;

-- Drop columns if they exist (safe reverse)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='reasoning'
  ) THEN
    ALTER TABLE public.chat_messages DROP COLUMN reasoning;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='reasoning_details'
  ) THEN
    ALTER TABLE public.chat_messages DROP COLUMN reasoning_details;
  END IF;

    -- No native_tokens_reasoning column to drop (intentionally omitted in forward)
END $$;

-- No function changes in this reverse patch by design.

COMMIT;
