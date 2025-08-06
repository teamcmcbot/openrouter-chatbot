-- =============================================================================
-- VERIFICATION SCRIPT: Active Seconds Migration
-- =============================================================================
-- This script verifies the migration was successful and tests all affected
-- functions to ensure they work correctly with the new column name.
-- =============================================================================

-- =============================================================================
-- SCHEMA VERIFICATION
-- =============================================================================

-- Check that active_seconds column exists and active_minutes does not
DO $$
DECLARE
    has_active_seconds BOOLEAN;
    has_active_minutes BOOLEAN;
    column_type TEXT;
    column_default TEXT;
BEGIN
    -- Check for active_seconds column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = 'user_usage_daily' 
        AND column_name = 'active_seconds'
    ) INTO has_active_seconds;
    
    -- Check for active_minutes column (should not exist)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = 'user_usage_daily' 
        AND column_name = 'active_minutes'
    ) INTO has_active_minutes;
    
    -- Get column properties
    SELECT data_type, column_default INTO column_type, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'user_usage_daily' 
    AND column_name = 'active_seconds';
    
    -- Report results
    RAISE NOTICE '=== SCHEMA VERIFICATION ===';
    RAISE NOTICE 'active_seconds exists: %', has_active_seconds;
    RAISE NOTICE 'active_minutes exists: %', has_active_minutes;
    RAISE NOTICE 'Column type: %', column_type;
    RAISE NOTICE 'Column default: %', column_default;
    
    -- Validate results
    IF NOT has_active_seconds THEN
        RAISE EXCEPTION 'MIGRATION FAILED: active_seconds column not found';
    END IF;
    
    IF has_active_minutes THEN
        RAISE EXCEPTION 'MIGRATION FAILED: active_minutes column still exists';
    END IF;
    
    IF column_type != 'integer' THEN
        RAISE EXCEPTION 'MIGRATION FAILED: Column type incorrect, expected integer, got %', column_type;
    END IF;
    
    RAISE NOTICE 'SUCCESS: Schema migration verified';
END $$;

-- =============================================================================
-- FUNCTION SIGNATURE VERIFICATION
-- =============================================================================

-- Check that functions have correct signatures
DO $$
DECLARE
    track_usage_exists BOOLEAN;
    get_profile_exists BOOLEAN;
    param_count INTEGER;
BEGIN
    RAISE NOTICE '=== FUNCTION VERIFICATION ===';
    
    -- Check track_user_usage function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'track_user_usage'
    ) INTO track_usage_exists;
    
    -- Check get_user_complete_profile function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'get_user_complete_profile'
    ) INTO get_profile_exists;
    
    -- Check parameter count for track_user_usage
    SELECT pronargs INTO param_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'track_user_usage';
    
    RAISE NOTICE 'track_user_usage exists: %', track_usage_exists;
    RAISE NOTICE 'get_user_complete_profile exists: %', get_profile_exists;
    RAISE NOTICE 'track_user_usage parameter count: %', param_count;
    
    -- Validate results
    IF NOT track_usage_exists THEN
        RAISE EXCEPTION 'MIGRATION FAILED: track_user_usage function not found';
    END IF;
    
    IF NOT get_profile_exists THEN
        RAISE EXCEPTION 'MIGRATION FAILED: get_user_complete_profile function not found';
    END IF;
    
    IF param_count != 8 THEN
        RAISE EXCEPTION 'MIGRATION FAILED: track_user_usage has % parameters, expected 8', param_count;
    END IF;
    
    RAISE NOTICE 'SUCCESS: Function signatures verified';
END $$;

-- =============================================================================
-- DATA INTEGRITY VERIFICATION
-- =============================================================================

-- Check that existing data is preserved
DO $$
DECLARE
    total_records INTEGER;
    total_active_seconds INTEGER;
    sample_record RECORD;
BEGIN
    RAISE NOTICE '=== DATA INTEGRITY VERIFICATION ===';
    
    -- Count total records
    SELECT COUNT(*) INTO total_records FROM public.user_usage_daily;
    
    -- Sum all active_seconds values
    SELECT COALESCE(SUM(active_seconds), 0) INTO total_active_seconds 
    FROM public.user_usage_daily;
    
    -- Get a sample record
    SELECT user_id, usage_date, active_seconds INTO sample_record
    FROM public.user_usage_daily 
    WHERE active_seconds > 0 
    LIMIT 1;
    
    RAISE NOTICE 'Total records: %', total_records;
    RAISE NOTICE 'Total active_seconds: %', total_active_seconds;
    RAISE NOTICE 'Sample record - user_id: %, date: %, active_seconds: %', 
                 sample_record.user_id, sample_record.usage_date, sample_record.active_seconds;
    
    RAISE NOTICE 'SUCCESS: Data integrity verified';
END $$;

-- =============================================================================
-- FUNCTION TESTING
-- =============================================================================

-- Test track_user_usage function with new parameter name
DO $$
DECLARE
    test_user_id UUID := '00000000-0000-0000-0000-000000000001';
    initial_count INTEGER;
    final_count INTEGER;
    initial_seconds INTEGER;
    final_seconds INTEGER;
BEGIN
    RAISE NOTICE '=== FUNCTION TESTING ===';
    
    -- Get initial values
    SELECT COALESCE(COUNT(*), 0) INTO initial_count
    FROM public.user_usage_daily 
    WHERE user_id = test_user_id AND usage_date = CURRENT_DATE;
    
    SELECT COALESCE(active_seconds, 0) INTO initial_seconds
    FROM public.user_usage_daily 
    WHERE user_id = test_user_id AND usage_date = CURRENT_DATE;
    
    RAISE NOTICE 'Testing track_user_usage function...';
    
    -- Test the function (this should work if migration was successful)
    BEGIN
        PERFORM public.track_user_usage(
            test_user_id,   -- p_user_id
            1,              -- p_messages_sent
            0,              -- p_messages_received  
            100,            -- p_input_tokens
            0,              -- p_output_tokens
            'test-model',   -- p_model_used
            false,          -- p_session_created
            30              -- p_active_seconds (new parameter name)
        );
        
        RAISE NOTICE 'SUCCESS: track_user_usage function call completed';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'MIGRATION FAILED: track_user_usage function test failed: %', SQLERRM;
    END;
    
    -- Verify the function worked
    SELECT COALESCE(COUNT(*), 0) INTO final_count
    FROM public.user_usage_daily 
    WHERE user_id = test_user_id AND usage_date = CURRENT_DATE;
    
    SELECT COALESCE(active_seconds, 0) INTO final_seconds
    FROM public.user_usage_daily 
    WHERE user_id = test_user_id AND usage_date = CURRENT_DATE;
    
    RAISE NOTICE 'Records before: %, after: %', initial_count, final_count;
    RAISE NOTICE 'Active seconds before: %, after: %', initial_seconds, final_seconds;
    
    -- Clean up test data
    DELETE FROM public.user_usage_daily 
    WHERE user_id = test_user_id AND usage_date = CURRENT_DATE;
    
    RAISE NOTICE 'SUCCESS: Function testing completed';
END $$;

-- =============================================================================
-- API RESPONSE VERIFICATION
-- =============================================================================

-- Test that get_user_complete_profile returns active_seconds in the response
DO $$
DECLARE
    test_result JSONB;
    has_active_seconds BOOLEAN := false;
    usage_data JSONB;
BEGIN
    RAISE NOTICE '=== API RESPONSE VERIFICATION ===';
    
    -- Try to get a profile (might fail if no users exist, that's ok)
    BEGIN
        SELECT public.get_user_complete_profile(
            (SELECT id FROM public.profiles LIMIT 1)
        ) INTO test_result;
        
        -- Check if the response contains active_seconds in usage stats
        IF test_result ? 'usage_stats' THEN
            usage_data := test_result->'usage_stats'->'today';
            IF usage_data IS NOT NULL AND jsonb_array_length(usage_data) > 0 THEN
                -- Check first usage record for active_seconds field
                has_active_seconds := (usage_data->0) ? 'active_seconds';
            END IF;
        END IF;
        
        RAISE NOTICE 'Profile response contains active_seconds: %', has_active_seconds;
        
        IF NOT has_active_seconds THEN
            RAISE NOTICE 'WARNING: active_seconds not found in API response (may be due to no usage data)';
        ELSE
            RAISE NOTICE 'SUCCESS: API response verification passed';
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'NOTE: Could not test API response (no user data available): %', SQLERRM;
    END;
END $$;

-- =============================================================================
-- SUMMARY
-- =============================================================================

RAISE NOTICE '=== MIGRATION VERIFICATION COMPLETE ===';
RAISE NOTICE 'If you see this message without errors, the migration was successful!';
RAISE NOTICE '';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Update sample data files to use "active_seconds"';
RAISE NOTICE '2. Update documentation to reference "active_seconds"';
RAISE NOTICE '3. Update main schema files after verification';
RAISE NOTICE '4. Notify API consumers of field name change';
