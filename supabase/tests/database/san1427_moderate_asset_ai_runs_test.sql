-- SAN-1427: real local Postgres audit inserts for contestant photos.
-- All test data is fictional and rolled back.
begin;
set local search_path = public, extensions;
select plan(4);

insert into auth.users(id,email,aud,role)
values('b1427000-0000-4000-8000-000000000001',
       'san1427-photo-test@example.invalid','authenticated','authenticated');

insert into public.ai_runs(user_id,agent_name,agent_type,input_data,status,duration_ms,input_tokens,output_tokens)
values('b1427000-0000-4000-8000-000000000001','moderate-asset','general_concierge',
       '{"storage_path":"fixture/private.png","has_bio":false}'::jsonb,'success',12,10,4);

select is((select count(*)::int from public.ai_runs where agent_name='moderate-asset' and user_id='b1427000-0000-4000-8000-000000000001'),
  1,'valid successful photo moderation audit persists');

insert into public.ai_runs(user_id,agent_name,agent_type,input_data,status,duration_ms,input_tokens,output_tokens)
values('b1427000-0000-4000-8000-000000000001','moderate-asset','general_concierge',
       '{"storage_path":"fixture/private.png","has_bio":true}'::jsonb,'error',12,0,0);

select is((select count(*)::int from public.ai_runs where status='error' and agent_name='moderate-asset' and user_id='b1427000-0000-4000-8000-000000000001'),
  1,'Gemini outage audit persists with valid error enum');

select throws_ok(
  $$insert into public.ai_runs(user_id,agent_name,status)
    values('b1427000-0000-4000-8000-000000000001','moderate-asset','success')$$,
  '23502',null,'old sparse AI audit insert is rejected by required columns');

select is((select count(*)::int from public.ai_runs where agent_name='moderate-asset' and user_id='b1427000-0000-4000-8000-000000000001'),
  2,'failed sparse write does not create an audit record');

select * from finish();
rollback;
