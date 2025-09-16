select model_id,is_free,is_pro,is_enterprise,output_image_price from model_access where is_free=true or is_pro=true or is_enterprise=true;
select status, count(*) from model_access group by status;
update model_access set status='active';

-- free models 
update model_access set status='active', is_free=true where model_id in ('z-ai/glm-4.5-air:free','moonshotai/kimi-k2:free','deepseek/deepseek-chat-v3.1:free','deepseek/deepseek-r1-0528:free','google/gemini-2.0-flash-exp:free','google/gemini-2.5-flash-lite');

-- pro models
update model_access set status='active', is_pro=true where model_id in ('z-ai/glm-4.5-air:free','moonshotai/kimi-k2:free','deepseek/deepseek-chat-v3.1:free','deepseek/deepseek-r1-0528:free','google/gemini-2.0-flash-exp:free','google/gemini-2.5-flash-lite','mistralai/magistral-small-2506','openai/gpt-4o-mini');

-- enterprise models
update model_access set status='active', is_enterprise=true where model_id in ('z-ai/glm-4.5-air:free','moonshotai/kimi-k2:free','deepseek/deepseek-chat-v3.1:free','deepseek/deepseek-r1-0528:free','google/gemini-2.0-flash-exp:free','google/gemini-2.5-flash-lite','mistralai/magistral-small-2506','openai/gpt-4o-mini','anthropic/claude-3-haiku','x-ai/grok-3-mini','openai/gpt-5','openai/gpt-5-nano','openai/gpt-5-mini','google/gemini-2.5-flash-image-preview');

--google/gemini-2.5-flash-image-preview output image price
update model_access set output_image_price='0.00003' where model_id='google/gemini-2.5-flash-image-preview';

select * from profiles;
update profiles set account_type='admin', subscription_tier='enterprise' where id='';
update profiles set subscription_tier='pro' where id='';