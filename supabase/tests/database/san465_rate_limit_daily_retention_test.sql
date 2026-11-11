-- SAN-465: daily route quotas must not reset when unrelated RPC calls purge rows.
-- Local pgTAP test uses a rolled-back counter, not live production traffic.
begin;
select plan(8);

select ok(
  pg_get_functiondef('public.check_rate_limit(text,integer,integer)'::regprocedure)
    like '%window_start < now() - interval ''48 hours''%',
  'cleanup retains active 24-hour buckets for at least 48 hours');
select ok(
  has_function_privilege('service_role','public.check_rate_limit(text,integer,integer)','execute'),
  'trusted server may reserve quota');
select ok(
  not has_function_privilege('anon','public.check_rate_limit(text,integer,integer)','execute'),
  'anonymous users cannot reserve arbitrary rate buckets');
select ok(
  not has_function_privilege('authenticated','public.check_rate_limit(text,integer,integer)','execute'),
  'signed-in clients cannot reserve arbitrary rate buckets');

select is((public.check_rate_limit('san465-daily-rollback-fixture', 2, 86400)->>'count')::integer,
  1,'first 24-hour reservation recorded');
select is((public.check_rate_limit('san465-daily-rollback-fixture', 2, 86400)->>'count')::integer,
  2,'second 24-hour reservation recorded');
select is((public.check_rate_limit('san465-daily-rollback-fixture', 2, 86400)->>'allowed')::boolean,
  false,'third 24-hour reservation denied');
select is((select count from public.rate_limit_hits
  where bucket_key='san465-daily-rollback-fixture'
  and window_start=to_timestamp((extract(epoch from now())::bigint / 86400) * 86400)),
  3,'count remains atomic even when denied');

select * from finish();
rollback;
