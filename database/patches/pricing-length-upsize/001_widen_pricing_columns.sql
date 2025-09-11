-- Patch: Widen pricing-related VARCHAR columns from 20 to 32
-- Context: Model sync failing due to pricing strings length 22 (e.g., completion/prompt costs)
-- This patch enlarges all pricing columns in public.model_access to VARCHAR(32).
-- Safe / idempotent: only alters if current atttypmod corresponds to length 20.

DO $$
DECLARE
    cols TEXT[] := ARRAY[
        'prompt_price',
        'completion_price',
        'request_price',
        'image_price',
        'output_image_price',
        'web_search_price',
        'internal_reasoning_price',
        'input_cache_read_price',
        'input_cache_write_price'
    ];
    col TEXT;
    current_len INT;
BEGIN
    FOREACH col IN ARRAY cols LOOP
        SELECT CASE WHEN atttypmod > 0 THEN atttypmod - 4 ELSE NULL END INTO current_len
        FROM pg_attribute
        WHERE attrelid = 'public.model_access'::regclass
          AND attname = col
          AND NOT attisdropped;

        -- Only adjust if column exists and currently length 20
        IF current_len = 20 THEN
            EXECUTE format('ALTER TABLE public.model_access ALTER COLUMN %I TYPE VARCHAR(32);', col);
        END IF;
    END LOOP;
END $$;

-- Verification query suggestion (manual):
-- SELECT attname, atttypmod-4 AS length FROM pg_attribute WHERE attrelid='public.model_access'::regclass AND attname LIKE '%price%';
