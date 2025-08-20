-- reasoning-mode / 01_forward.sql
-- Purpose: Add reasoning fields to chat messages only. No function changes.

BEGIN;

-- 1) Columns on chat_messages (idempotent guards)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='reasoning'
  ) THEN
    ALTER TABLE public.chat_messages ADD COLUMN reasoning TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='reasoning_details'
  ) THEN
    ALTER TABLE public.chat_messages ADD COLUMN reasoning_details JSONB NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages' AND column_name='native_tokens_reasoning'
  ) THEN
    -- Removed per design: native reasoning token counts are not available in current flow
    -- ALTER TABLE public.chat_messages ADD COLUMN native_tokens_reasoning INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- No function changes in this patch by design.

COMMIT;
