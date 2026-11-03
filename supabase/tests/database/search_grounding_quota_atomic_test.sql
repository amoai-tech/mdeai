-- SAN-124: trusted-server search reservations enforce a strict UTC-day cap.
begin;
select plan(13);

delete from public.search_grounding_quota_log
where date = (now() at time zone 'utc')::date;

select has_function('public', 'reserve_search_grounding_quota', array['integer'],
                    'atomic reservation RPC exists');
select ok(has_function_privilege('service_role', 'public.reserve_search_grounding_quota(integer)', 'execute'),
          'server-side service role may reserve');
select ok(not has_function_privilege('anon', 'public.reserve_search_grounding_quota(integer)', 'execute'),
          'anonymous user cannot reserve');
select ok(not has_function_privilege('authenticated', 'public.reserve_search_grounding_quota(integer)', 'execute'),
          'ordinary user cannot reserve');

set local role anon;
select throws_ok('select public.reserve_search_grounding_quota(2)', '42501', null,
                 'anonymous RPC execution denied');
reset role;

set local role authenticated;
select throws_ok('select public.reserve_search_grounding_quota(2)', '42501', null,
                 'authenticated RPC execution denied');
reset role;

select is(public.reserve_search_grounding_quota(2), true, 'first call reserved');
select is(public.reserve_search_grounding_quota(2), true, 'second call reserved');
select is(public.reserve_search_grounding_quota(2), false, 'third call rejected at limit');
select is((select count from public.search_grounding_quota_log
           where date = (now() at time zone 'utc')::date), 2,
          'failed reservation does not increment counter');
select is(public.reserve_search_grounding_quota(0), false, 'zero cap rejects');
select is(public.reserve_search_grounding_quota(-1), false, 'negative cap rejects');
select is((select count from public.search_grounding_quota_log
           where date = (now() at time zone 'utc')::date), 2,
          'bad caps do not change counter');

select * from finish();
rollback;
