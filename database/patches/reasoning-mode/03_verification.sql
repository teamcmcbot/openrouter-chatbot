-- reasoning-mode / 03_verification.sql
-- Purpose: Post-migration checks to confirm new columns behave as expected.

-- 1) Columns exist
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='reasoning') AS has_reasoning,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='reasoning_details') AS has_reasoning_details;

-- 2) No function checks (we did not modify any functions in this patch)

-- 3) Dry-run insert/select (no writes if you run in a transaction)
--    Demonstrate columns accept data
WITH s AS (
  INSERT INTO public.chat_sessions (id, user_id, title)
  VALUES ('verify_conv_reasoning', gen_random_uuid(), 'Verify Reasoning Mode')
  ON CONFLICT (id) DO NOTHING
  RETURNING id
), m AS (
  INSERT INTO public.chat_messages (
    id, session_id, role, content, model,
    total_tokens, input_tokens, output_tokens,
  reasoning, reasoning_details
  ) VALUES (
    'verify_msg_reasoning', 'verify_conv_reasoning', 'assistant', 'Hello', 'test-model',
  10, 3, 7,
  'Some chain of thought...', '{"blocks":[{"type":"think","text":"step 1"}]}'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT * FROM public.chat_messages WHERE id = 'verify_msg_reasoning';
