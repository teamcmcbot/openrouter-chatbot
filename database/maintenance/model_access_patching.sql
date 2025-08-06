--Models Access

select * from model_access;
select status, count(*) from model_access group by status;

-- Check new models
select * from model_access where status='new';
select model_id from model_access where status='new';

-- To enable for Free tier and up:
-- openai/gpt-oss-20b, 
update model_access set is_free=true, is_pro=true, is_enterprise=true where model_id in ('openai/gpt-oss-20b');

-- To enable for Pro tier and up:
-- openai/gpt-oss-120b, 
update model_access set is_free=false, is_pro=true, is_enterprise=true where model_id in ('openai/gpt-oss-120b');

-- To enable for Enterprise tier:
-- anthropic/claude-opus-4.1
-- tngtech/deepseek-r1t-chimera
update model_access set is_free=false, is_pro=false, is_enterprise=true where model_id in ('anthropic/claude-opus-4.1');


-- Set new models to active
update model_access set status='active' where status='new';