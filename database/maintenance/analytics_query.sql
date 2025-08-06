select * from public.profiles;
-- f319ca56-4197-477c-92e7-e6e2d95884be
-- {"last_reset":"2025-07-17 08:23:07.148825+00","total_tokens":597218,"total_messages":1164,"sessions_created":0}
-- {"last_reset":"2025-07-17 08:23:07.148825+00","total_tokens":597796,"total_messages":1166,"sessions_created":1}
-- {"theme":"dark","auto_save":true,"sidebar_width":280,"show_token_count":true,"code_highlighting":true}
-- {"auto_title":true,"max_history":10,"save_anonymous":false}

select * from user_activity_log; -- This is only for profile sync, profile created?
select * from user_activity_log where user_id='f319ca56-4197-477c-92e7-e6e2d95884be' order by timestamp desc;

select * from user_usage_daily; -- user's daily message sent/received, tokens in/out, sessions created, active mins (elasped time). estimated_cost not calculated
select * from user_usage_daily where user_id='f319ca56-4197-477c-92e7-e6e2d95884be' order by updated_at desc;

select * from api_user_summary;
select * from api_user_summary where id='f319ca56-4197-477c-92e7-e6e2d95884be';
-- {"theme":"dark","auto_save":true,"sidebar_width":280,"show_token_count":true,"code_highlighting":true}
-- {"auto_title":true,"max_history":10,"save_anonymous":false}
-- is allowed_models configured / calculated anywhere? how?
-- message_today, tokens_today, total_sessions (is this based on chat_sessions count?)

select * from chat_sessions where user_id='f319ca56-4197-477c-92e7-e6e2d95884be';
select * from chat_messages where session_id='conv_1754390327587_7dfsd9nbh';
-- BUG: The POST /api/chat/mesasage endpoint is not inserting input_tokens for role='user' messages. Need to also remove input_tokens in role='assistant'
-- To check, if content_type is correctly mapped? text or markdown.