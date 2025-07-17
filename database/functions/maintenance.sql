-- Maintenance and Utility Functions
-- Execute these functions for database maintenance and optimization

-- =============================================================================
-- CLEANUP OLD SESSIONS FUNCTION
-- =============================================================================

-- Function to cleanup expired and old sessions
CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
RETURNS TABLE (
    deleted_sessions INTEGER,
    deleted_activity_logs INTEGER,
    deleted_usage_records INTEGER
) AS $$
DECLARE
    session_count INTEGER := 0;
    activity_count INTEGER := 0;
    usage_count INTEGER := 0;
BEGIN
    -- Delete expired user sessions
    DELETE FROM public.user_sessions 
    WHERE expires_at < NOW() 
    OR (last_activity < NOW() - INTERVAL '30 days' AND is_active = false);
    GET DIAGNOSTICS session_count = ROW_COUNT;
    
    -- Delete old activity logs (older than 1 year)
    DELETE FROM public.user_activity_log 
    WHERE timestamp < NOW() - INTERVAL '1 year';
    GET DIAGNOSTICS activity_count = ROW_COUNT;
    
    -- Delete old usage tracking records (older than 2 years)
    DELETE FROM public.usage_tracking 
    WHERE timestamp < NOW() - INTERVAL '2 years';
    GET DIAGNOSTICS usage_count = ROW_COUNT;
    
    RETURN QUERY SELECT session_count, activity_count, usage_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- UPDATE USER PROFILE FUNCTION WITH VALIDATION
-- =============================================================================

-- Enhanced function to update user profile with validation
CREATE OR REPLACE FUNCTION public.update_user_profile_safe(
    user_uuid UUID,
    profile_updates JSONB
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    validation_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Validate temperature range
    IF profile_updates ? 'temperature' THEN
        IF (profile_updates->>'temperature')::DECIMAL < 0.0 OR (profile_updates->>'temperature')::DECIMAL > 2.0 THEN
            validation_errors := array_append(validation_errors, 'Temperature must be between 0.0 and 2.0');
        END IF;
    END IF;
    
    -- Validate model exists in allowed models
    IF profile_updates ? 'default_model' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = user_uuid 
            AND (profile_updates->>'default_model') = ANY(p.allowed_models)
        ) THEN
            validation_errors := array_append(validation_errors, 'Default model must be in allowed models list');
        END IF;
    END IF;
    
    -- Validate email format if provided
    IF profile_updates ? 'email' THEN
        IF NOT (profile_updates->>'email') ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
            validation_errors := array_append(validation_errors, 'Invalid email format');
        END IF;
    END IF;
    
    -- Return validation errors if any
    IF array_length(validation_errors, 1) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'errors', to_jsonb(validation_errors)
        );
    END IF;
    
    -- Perform the update
    UPDATE public.profiles SET
        email = COALESCE(profile_updates->>'email', email),
        full_name = COALESCE(profile_updates->>'full_name', full_name),
        avatar_url = COALESCE(profile_updates->>'avatar_url', avatar_url),
        default_model = COALESCE(profile_updates->>'default_model', default_model),
        temperature = COALESCE((profile_updates->>'temperature')::DECIMAL, temperature),
        system_prompt = COALESCE(profile_updates->>'system_prompt', system_prompt),
        updated_at = NOW()
    WHERE id = user_uuid;
    
    -- Log the update
    PERFORM public.log_user_activity(
        user_uuid,
        'profile_updated',
        'profile',
        user_uuid,
        profile_updates
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- BULK CONVERSATION SYNC FUNCTION
-- =============================================================================

-- Function to sync multiple conversations from localStorage to database
CREATE OR REPLACE FUNCTION public.bulk_sync_conversations(
    user_uuid UUID,
    conversations_data JSONB
)
RETURNS TABLE (
    sync_summary JSONB
) AS $$
DECLARE
    conv JSONB;
    session_id UUID;
    msg JSONB;
    total_conversations INTEGER := 0;
    total_messages INTEGER := 0;
    skipped_conversations INTEGER := 0;
    error_count INTEGER := 0;
    sync_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Validate input
    IF conversations_data IS NULL OR jsonb_typeof(conversations_data) != 'array' THEN
        RETURN QUERY SELECT jsonb_build_object(
            'success', false,
            'error', 'Invalid conversations data format'
        );
        RETURN;
    END IF;
    
    -- Loop through conversations
    FOR conv IN SELECT * FROM jsonb_array_elements(conversations_data)
    LOOP
        BEGIN
            -- Check if conversation already exists
            IF EXISTS (
                SELECT 1 FROM public.chat_sessions 
                WHERE user_id = user_uuid 
                AND title = (conv->>'title')
                AND created_at = (conv->>'createdAt')::TIMESTAMPTZ
            ) THEN
                skipped_conversations := skipped_conversations + 1;
                CONTINUE;
            END IF;
            
            -- Create session
            INSERT INTO public.chat_sessions (
                user_id,
                title,
                created_at,
                updated_at,
                last_activity,
                is_active
            ) VALUES (
                user_uuid,
                COALESCE(conv->>'title', 'Untitled Conversation'),
                COALESCE((conv->>'createdAt')::TIMESTAMPTZ, NOW()),
                COALESCE((conv->>'updatedAt')::TIMESTAMPTZ, NOW()),
                COALESCE((conv->>'updatedAt')::TIMESTAMPTZ, NOW()),
                COALESCE((conv->>'isActive')::BOOLEAN, true)
            ) RETURNING id INTO session_id;
            
            total_conversations := total_conversations + 1;
            
            -- Insert messages
            FOR msg IN SELECT * FROM jsonb_array_elements(conv->'messages')
            LOOP
                INSERT INTO public.chat_messages (
                    session_id,
                    role,
                    content,
                    model,
                    tokens,
                    timestamp,
                    is_error
                ) VALUES (
                    session_id,
                    COALESCE(msg->>'role', 'user'),
                    COALESCE(msg->>'content', ''),
                    msg->>'model',
                    COALESCE((msg->>'tokens')::INTEGER, 0),
                    COALESCE((msg->>'timestamp')::TIMESTAMPTZ, NOW()),
                    COALESCE((msg->>'isError')::BOOLEAN, false)
                );
                
                total_messages := total_messages + 1;
            END LOOP;
            
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            sync_errors := array_append(sync_errors, 
                format('Error syncing conversation "%s": %s', 
                    COALESCE(conv->>'title', 'Unknown'), SQLERRM));
        END;
    END LOOP;
    
    -- Update user stats
    PERFORM public.update_user_usage_stats(user_uuid, total_messages * 50); -- Estimate tokens
    
    -- Log the sync operation
    PERFORM public.log_user_activity(
        user_uuid,
        'conversations_synced',
        'chat_sessions',
        NULL,
        jsonb_build_object(
            'total_conversations', total_conversations,
            'total_messages', total_messages,
            'skipped', skipped_conversations,
            'errors', error_count
        )
    );
    
    RETURN QUERY SELECT jsonb_build_object(
        'success', error_count = 0,
        'total_conversations', total_conversations,
        'total_messages', total_messages,
        'skipped_conversations', skipped_conversations,
        'error_count', error_count,
        'errors', to_jsonb(sync_errors),
        'synced_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- USER STATISTICS AGGREGATION FUNCTION
-- =============================================================================

-- Function to get comprehensive user statistics
CREATE OR REPLACE FUNCTION public.get_user_statistics(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'created_at', p.created_at,
            'last_active', p.last_active,
            'subscription_tier', p.subscription_tier,
            'credits', p.credits,
            'account_status', p.account_status
        ),
        'usage', jsonb_build_object(
            'total_sessions', (
                SELECT COUNT(*) FROM public.chat_sessions 
                WHERE user_id = user_uuid
            ),
            'total_messages', (
                SELECT COUNT(*) FROM public.chat_messages m
                JOIN public.chat_sessions s ON m.session_id = s.id
                WHERE s.user_id = user_uuid
            ),
            'total_tokens', (
                SELECT COALESCE(SUM(m.tokens), 0) FROM public.chat_messages m
                JOIN public.chat_sessions s ON m.session_id = s.id
                WHERE s.user_id = user_uuid
            ),
            'active_sessions', (
                SELECT COUNT(*) FROM public.chat_sessions 
                WHERE user_id = user_uuid AND is_active = true
            ),
            'favorite_models', (
                SELECT jsonb_agg(model_id ORDER BY usage_count DESC)
                FROM public.user_model_preferences
                WHERE user_id = user_uuid AND is_favorite = true
                LIMIT 5
            ),
            'usage_stats', p.usage_stats
        ),
        'activity', jsonb_build_object(
            'recent_activity', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'action', action,
                        'timestamp', timestamp,
                        'success', success
                    ) ORDER BY timestamp DESC
                )
                FROM (
                    SELECT action, timestamp, success
                    FROM public.user_activity_log
                    WHERE user_id = user_uuid
                    ORDER BY timestamp DESC
                    LIMIT 10
                ) recent
            ),
            'login_count', (
                SELECT COUNT(*) FROM public.user_activity_log
                WHERE user_id = user_uuid AND action = 'login'
            ),
            'last_login', (
                SELECT MAX(timestamp) FROM public.user_activity_log
                WHERE user_id = user_uuid AND action = 'login'
            )
        ),
        'preferences', jsonb_build_object(
            'saved_prompts_count', (
                SELECT COUNT(*) FROM public.user_saved_prompts
                WHERE user_id = user_uuid
            ),
            'model_preferences_count', (
                SELECT COUNT(*) FROM public.user_model_preferences
                WHERE user_id = user_uuid
            ),
            'custom_themes_count', (
                SELECT COUNT(*) FROM public.user_custom_themes
                WHERE user_id = user_uuid
            )
        )
    ) INTO result
    FROM public.profiles p
    WHERE p.id = user_uuid;
    
    RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- DATABASE HEALTH CHECK FUNCTION
-- =============================================================================

-- Function to check database health and performance
CREATE OR REPLACE FUNCTION public.database_health_check()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details JSONB
) AS $$
BEGIN
    -- Check table row counts
    RETURN QUERY SELECT 
        'table_sizes' as check_name,
        'info' as status,
        jsonb_build_object(
            'profiles', (SELECT COUNT(*) FROM public.profiles),
            'chat_sessions', (SELECT COUNT(*) FROM public.chat_sessions),
            'chat_messages', (SELECT COUNT(*) FROM public.chat_messages),
            'user_activity_log', (SELECT COUNT(*) FROM public.user_activity_log),
            'usage_tracking', (SELECT COUNT(*) FROM public.usage_tracking)
        ) as details;
    
    -- Check for orphaned records
    RETURN QUERY SELECT 
        'orphaned_sessions' as check_name,
        CASE WHEN orphaned_count > 0 THEN 'warning' ELSE 'ok' END as status,
        jsonb_build_object('count', orphaned_count) as details
    FROM (
        SELECT COUNT(*) as orphaned_count
        FROM public.chat_sessions s
        LEFT JOIN public.profiles p ON s.user_id = p.id
        WHERE p.id IS NULL
    ) orphaned;
    
    -- Check for sessions without messages
    RETURN QUERY SELECT 
        'empty_sessions' as check_name,
        CASE WHEN empty_count > 100 THEN 'warning' ELSE 'ok' END as status,
        jsonb_build_object('count', empty_count) as details
    FROM (
        SELECT COUNT(*) as empty_count
        FROM public.chat_sessions s
        LEFT JOIN public.chat_messages m ON s.id = m.session_id
        WHERE m.id IS NULL
    ) empty;
    
    -- Check recent activity
    RETURN QUERY SELECT 
        'recent_activity' as check_name,
        'info' as status,
        jsonb_build_object(
            'active_users_today', (
                SELECT COUNT(DISTINCT user_id) 
                FROM public.user_activity_log 
                WHERE timestamp > CURRENT_DATE
            ),
            'messages_today', (
                SELECT COUNT(*) 
                FROM public.chat_messages 
                WHERE timestamp > CURRENT_DATE
            ),
            'new_users_today', (
                SELECT COUNT(*) 
                FROM public.profiles 
                WHERE created_at > CURRENT_DATE
            )
        ) as details;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
