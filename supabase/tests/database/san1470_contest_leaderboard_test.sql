-- SAN-1470 · accepted-audience standings: ties, zero, and test-ballot isolation
begin;
select plan(7);

insert into auth.users (id, email) values
  ('f1470000-0000-4000-8000-000000000001','lb-a@example.com'),
  ('f1470000-0000-4000-8000-000000000002','lb-b@example.com'),
  ('f1470000-0000-4000-8000-000000000003','lb-c@example.com'),
  ('f1470000-0000-4000-8000-000000000004','lb-d@example.com'),
  ('f1470000-0000-4000-8000-000000000005','lb-e@example.com'),
  ('f1470000-0000-4000-8000-000000000006','lb-f@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1470000-0000-4000-8000-000000000001','[TEST] Alpha', true),
  ('a1470000-0000-4000-8000-000000000002','[TEST] Bravo', true),
  ('a1470000-0000-4000-8000-000000000003','[TEST] Charlie', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1470000-0000-4000-8000-000000000001','lb-test','restaurant','[TEST] Leaderboard','f1470000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '1 day','live');
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1470000-0000-4000-8000-000000000001','c1470000-0000-4000-8000-000000000001','lb-a','[TEST] Alpha','a1470000-0000-4000-8000-000000000001'),
  ('e1470000-0000-4000-8000-000000000002','c1470000-0000-4000-8000-000000000001','lb-b','[TEST] Bravo','a1470000-0000-4000-8000-000000000002'),
  ('e1470000-0000-4000-8000-000000000003','c1470000-0000-4000-8000-000000000001','lb-c','[TEST] Charlie','a1470000-0000-4000-8000-000000000003');

-- Alpha 2 clean, Bravo 2 clean (tie), Charlie 1 clean, plus one development-test ballot on Charlie.
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status, development_test) values
  ('c1470000-0000-4000-8000-000000000001','e1470000-0000-4000-8000-000000000001','f1470000-0000-4000-8000-000000000001','audience','iph','lb-1',true,'clean',false),
  ('c1470000-0000-4000-8000-000000000001','e1470000-0000-4000-8000-000000000001','f1470000-0000-4000-8000-000000000002','audience','iph','lb-2',true,'clean',false),
  ('c1470000-0000-4000-8000-000000000001','e1470000-0000-4000-8000-000000000002','f1470000-0000-4000-8000-000000000003','audience','iph','lb-3',true,'clean',false),
  ('c1470000-0000-4000-8000-000000000001','e1470000-0000-4000-8000-000000000002','f1470000-0000-4000-8000-000000000004','audience','iph','lb-4',true,'clean',false),
  ('c1470000-0000-4000-8000-000000000001','e1470000-0000-4000-8000-000000000003','f1470000-0000-4000-8000-000000000005','audience','iph','lb-5',true,'clean',false),
  ('c1470000-0000-4000-8000-000000000001','e1470000-0000-4000-8000-000000000003','f1470000-0000-4000-8000-000000000006','audience','iph','lb-6',true,'clean',true);

select is(
  (select string_agg((n ->> 'rank') || ':' || (n ->> 'audience_accepted'), ' ' order by n ->> 'restaurant_name')
     from jsonb_array_elements(public.contest_public_get('lb-test') -> 'nominees') n),
  '1:2 1:2 3:1', 'two equal leaders share first place, the next is third');

select is(
  (select (n ->> 'development_test_total')::int from jsonb_array_elements(public.contest_public_get('lb-test') -> 'nominees') n
    where n ->> 'restaurant_name' = '[TEST] Charlie'),
  1, 'a development-test ballot is reported separately, never as accepted');

select is(
  (select (n ->> 'audience_accepted')::int from jsonb_array_elements(public.contest_public_get('lb-test') -> 'nominees') n
    where n ->> 'restaurant_name' = '[TEST] Charlie'),
  1, 'the test ballot does not inflate the accepted count');

select is(
  (select (n ->> 'rank')::int from jsonb_array_elements(public.contest_public_get('lb-test') -> 'nominees') n limit 1),
  1, 'the leader is ranked first');

select is(
  public.contest_public_get('no-such-contest'),
  null::jsonb, 'an unknown contest is null, not an empty leaderboard');

select is(
  has_function_privilege('anon','public.contest_public_get(text)','EXECUTE'),
  false, 'anonymous visitors cannot read standings directly');

select is(
  has_function_privilege('service_role','public.contest_public_get(text)','EXECUTE'),
  true, 'the server role reads standings');

select * from finish();
rollback;