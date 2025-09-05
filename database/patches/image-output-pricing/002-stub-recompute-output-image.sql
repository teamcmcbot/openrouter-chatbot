-- 002-stub-recompute-output-image.sql
-- Purpose: Provide a no-op stub for output image cost recompute to ease rollout order.
-- Notes: Replace body in later phases.

CREATE OR REPLACE FUNCTION public.recompute_output_image_cost_for_assistant_message(
    p_assistant_message_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- No-op stub for now. Will be implemented when output-image pricing is enabled.
    RETURN;
END;
$$;
