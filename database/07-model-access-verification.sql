-- =============================================================================
-- MODEL ACCESS VERIFICATION
-- =============================================================================
-- Verification script to ensure migration completed successfully

DO $$
DECLARE
    model_count INTEGER;
    function_exists BOOLEAN;
    policy_count INTEGER;
    view_exists BOOLEAN;
    allowed_models_exists BOOLEAN;
    default_model_nullable BOOLEAN;
BEGIN
    -- Check if new model_access table exists and has data
    SELECT COUNT(*) INTO model_count FROM public.model_access;

    -- Check if functions exist with correct names (no v2)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_name = 'get_user_allowed_models'
        AND routine_schema = 'public'
    ) INTO function_exists;

    -- Check if RLS policies exist
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('model_access', 'model_sync_log');

    -- Check if API view was recreated
    SELECT EXISTS (
        SELECT 1 FROM pg_views
        WHERE schemaname = 'public'
          AND viewname = 'api_user_summary'
    ) INTO view_exists;

    -- Check if allowed_models column was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'allowed_models'
    ) INTO allowed_models_exists;

    -- Check if default_model is nullable
    SELECT is_nullable = 'YES' INTO default_model_nullable
    FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'default_model';

    -- Verification results
    RAISE NOTICE '============================================';
    RAISE NOTICE 'MODEL ACCESS MIGRATION VERIFICATION';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Model Access Table: % models configured', model_count;
    RAISE NOTICE 'Functions: %', CASE WHEN function_exists THEN 'Updated (same names)' ELSE 'MISSING' END;
    RAISE NOTICE 'RLS Policies: % policies active', policy_count;
    RAISE NOTICE 'API View Exists: %', CASE WHEN view_exists THEN 'Yes ✓' ELSE 'MISSING' END;
    RAISE NOTICE 'Allowed Models Column: %', CASE WHEN allowed_models_exists THEN 'STILL EXISTS (ERROR)' ELSE 'Removed ✓' END;
    RAISE NOTICE 'Default Model Nullable: %', CASE WHEN default_model_nullable THEN 'Yes ✓' ELSE 'No (ERROR)' END;


    IF model_count > 0 AND function_exists AND policy_count >= 2 AND view_exists AND NOT allowed_models_exists AND default_model_nullable THEN
        RAISE NOTICE 'Status: ✅ Migration completed successfully';
    ELSE
        RAISE NOTICE 'Status: ❌ Migration incomplete - check errors above';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Update /api/models endpoint to use database';
    RAISE NOTICE '2. Create sync job endpoint';
    RAISE NOTICE '3. Run initial model sync';
    RAISE NOTICE '4. Configure model tier access via admin interface';
    RAISE NOTICE '============================================';
END $$;
