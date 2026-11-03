-- SAN-1469 · account-scoped receipt recovery. Self-contained; rolled back.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('f1469000-0000-0000-0000-000000000001','my-vote-a@example.com'),
  ('f1469000-0000-0000-0000-000000000002','my-vote-b@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1469000-0000-0000-0000-000000000001','[TEST] My Vote Restaurant', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1469000-0000-0000-0000-000000000001','my-vote-test','restaurant','My Vote Test','f1469000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day','live');
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1469000-0000-0000-0000-000000000001','c1469000-0000-0000-0000-000000000001','my-vote-e','[TEST] My Vote E','a1469000-0000-0000-0000-000000000001');
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status) values
  ('c1469000-0000-0000-0000-000000000001','e1469000-0000-0000-0000-000000000001','f1469000-0000-0000-0000-000000000001','audience','iph','my-vote-key-a',true,'clean');

select is(public.vote_my_receipt('c1469000-0000-0000-0000-000000000001','f1469000-0000-0000-0000-000000000001')->>'entity_id', 'e1469000-0000-0000-0000-000000000001', 'the voter gets their own ballot');
select is(public.vote_my_receipt('c1469000-0000-0000-0000-000000000001','f1469000-0000-0000-0000-000000000001')->>'restaurant_name', '[TEST] My Vote Restaurant', 'the receipt names the voted restaurant');
select is(public.vote_my_receipt('c1469000-0000-0000-0000-000000000001','f1469000-0000-0000-0000-000000000002'), null, 'another account sees no ballot');
select is(public.vote_my_receipt('00000000-0000-0000-0000-000000000000','f1469000-0000-0000-0000-000000000001'), null, 'another contest returns no ballot');
select is(has_function_privilege('anon', 'public.vote_my_receipt(uuid, uuid)', 'EXECUTE'), false, 'anon cannot execute');
set local role authenticated;
select throws_ok($q$ select public.vote_my_receipt('c1469000-0000-0000-0000-000000000001','f1469000-0000-0000-0000-000000000001') $q$, '42501', null, 'authenticated is denied at execution time');
reset role;

select * from finish();
rollback;