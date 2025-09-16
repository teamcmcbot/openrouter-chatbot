-- Invoke cleanup (adjust days as needed)
SELECT public.cleanup_old_data(30) AS cleanup_result; -- returns JSON summary

-- Optional post-cleanup visibility checks
SELECT count(*) AS activity_rows FROM user_activity_log;
SELECT count(*) AS usage_rows FROM user_usage_daily;
SELECT count(*) AS anon_usage_rows FROM anonymous_usage_daily;
SELECT count(*) AS anon_model_usage_rows FROM anonymous_model_usage_daily;
SELECT count(*) AS anon_error_rows FROM anonymous_error_events;
SELECT count(*) AS cost_rows FROM message_token_costs;
SELECT count(*) AS cta_event_rows FROM cta_events;
SELECT count(*) AS sync_log_rows FROM model_sync_log;

-- Example: look at remaining oldest timestamps (spot validation)
SELECT 'user_activity_log' AS table, MIN(timestamp) AS oldest FROM user_activity_log UNION ALL
SELECT 'user_usage_daily', MIN(usage_date) FROM user_usage_daily UNION ALL
SELECT 'anonymous_usage_daily', MIN(usage_date) FROM anonymous_usage_daily UNION ALL
SELECT 'anonymous_model_usage_daily', MIN(usage_date) FROM anonymous_model_usage_daily UNION ALL
SELECT 'anonymous_error_events', MIN(event_timestamp) FROM anonymous_error_events UNION ALL
SELECT 'message_token_costs', MIN(message_timestamp) FROM message_token_costs UNION ALL
SELECT 'cta_events', MIN(created_at) FROM cta_events UNION ALL
SELECT 'model_sync_log', MIN(COALESCE(sync_completed_at, sync_started_at)) FROM model_sync_log;