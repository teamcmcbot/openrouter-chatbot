-- Patch: Fix boolean vs integer comparison in update_user_tier()
-- - Changes tier_updated from BOOLEAN to INTEGER (updated_count)
-- - Correctly captures old_tier before UPDATE
-- - Keeps signature and return shape stable

CREATE OR REPLACE FUNCTION public.update_user_tier(
    user_uuid UUID,
    new_tier VARCHAR(20)
)
RETURNS JSONB AS $$
DECLARE
    old_tier VARCHAR(20);
    updated_count INTEGER := 0;
BEGIN
    -- Validate tier (admin tier is managed via profiles.account_type)
    IF new_tier NOT IN ('free', 'pro', 'enterprise') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid tier. Must be: free, pro, or enterprise'
        );
    END IF;

    -- Capture previous tier (for logging) and ensure user existence
    SELECT subscription_tier INTO old_tier
    FROM public.profiles
    WHERE id = user_uuid;

    -- Update subscription_tier
    UPDATE public.profiles
    SET subscription_tier = new_tier,
        updated_at = NOW()
    WHERE id = user_uuid;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Log the tier change
    PERFORM public.log_user_activity(
        user_uuid,
        'tier_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'old_tier', old_tier,
            'new_tier', new_tier
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'old_tier', old_tier,
        'new_tier', new_tier,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
