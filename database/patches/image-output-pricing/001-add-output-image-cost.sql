-- 001-add-output-image-cost.sql
-- Purpose: Add output-image pricing prep columns and metadata support.
-- Notes: Idempotent ALTERs; safe to re-run.

BEGIN;

-- 1) model_access: output image unit price (string as in OpenRouter pricing fields)
ALTER TABLE public.model_access
    ADD COLUMN IF NOT EXISTS output_image_cost VARCHAR(20) DEFAULT '0';

-- 2) message_token_costs: future output image units and cost (prepared, not used yet)
ALTER TABLE public.message_token_costs
    ADD COLUMN IF NOT EXISTS output_image_units INTEGER DEFAULT 0;

ALTER TABLE public.message_token_costs
    ADD COLUMN IF NOT EXISTS output_image_cost DECIMAL(12,6) DEFAULT 0;

-- 3) chat_attachments: metadata jsonb for source tagging and future fields
ALTER TABLE public.chat_attachments
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMIT;
