-- SAN-1497 · vote_tally separates real audience votes from development-test ballots
begin;
select plan(12);

insert into auth.users (id, email) values
  ('f1497000-0000-0000-0000-000000000001','tally-a@example.com'),
  ('f1497000-0000-0000-0000-000000000002','tally-b@example.com'),
  ('f1497000-0000-0000-0000-000000000003','tally-c@example.com'),
  ('f1497000-0000-0000-0000-000000000004','tally-d@example.com'),
  ('f1497000-0000-0000-0000-000000000005','tally-e@example.com'),
  ('f1497000-0000-0000-0000-000000000006','tally-f@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1497000-0000-0000-0000-000000000001','[TEST] Tally Restaurant', true),
  ('a1497000-0000-0000-0000-000000000002','[TEST] Tally Restaurant Two', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1497000-0000-0000-0000-000000000001','tally-test','restaurant','[TEST] Tally','f1497000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day','live');
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1497000-0000-0000-0000-000000000001','c1497000-0000-0000-0000-000000000001','tally-e','[TEST] Tally E','a1497000-0000-0000-0000-000000000001');

-- One clean audience vote, one pending, one blocked, plus one clean and one pending test ballot.
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status, development_test) values
  ('c1497000-0000-0000-0000-000000000001','e1497000-0000-0000-0000-000000000001','f1497000-0000-0000-0000-000000000001','audience','iph','tk-1',true,'clean',false),
  ('c1497000-0000-0000-0000-000000000001','e1497000-0000-0000-0000-000000000001','f1497000-0000-0000-0000-000000000002','audience','iph','tk-2',true,'pending',false),
  ('c1497000-0000-0000-0000-000000000001','e1497000-0000-0000-0000-000000000001','f1497000-0000-0000-0000-000000000003','audience','iph','tk-3',true,'blocked',false),
  ('c1497000-0000-0000-0000-000000000001','e1497000-0000-0000-0000-000000000001','f1497000-0000-0000-0000-000000000004','audience','iph','tk-4',true,'clean',true),
  ('c1497000-0000-0000-0000-000000000001','e1497000-0000-0000-0000-000000000001','f1497000-0000-0000-0000-000000000005','audience','iph','tk-5',true,'pending',true);

select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'audience_accepted')::int,
  1, 'only a clean, non-test ballot counts as accepted');

select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'audience_pending')::int,
  1, 'a pending non-test ballot counts as pending');

select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'audience_total')::int,
  2, 'the audience total excludes blocked AND development-test ballots');

select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'development_test_total')::int,
  2, 'development-test ballots are counted separately');

insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1497000-0000-0000-0000-000000000002','c1497000-0000-0000-0000-000000000001','tally-e2','[TEST] Tally E2','a1497000-0000-0000-0000-000000000002');
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status, development_test) values
  ('c1497000-0000-0000-0000-000000000001','e1497000-0000-0000-0000-000000000002','f1497000-0000-0000-0000-000000000006','audience','iph','tk-6',true,'clean',true);

select is(
  (public.vote_tally('e1497000-0000-0000-0000-000000000002') ->> 'audience_accepted')
    || '/' || (public.vote_tally('e1497000-0000-0000-0000-000000000002') ->> 'development_test_total'),
  '0/1', 'an entity with only a test ballot looks empty to the audience');

select is((public.vote_tally('e1497000-0000-0000-0000-000000000009') ->> 'audience_accepted')::int,
  0, 'an entity with no votes reports zero, not null');

-- The tally exposes confidential audit semantics; only server-side reads may call it.
select is(has_function_privilege('anon', 'public.vote_tally(uuid)', 'EXECUTE'),
  false, 'anonymous callers cannot execute the tally');
select is(has_function_privilege('authenticated', 'public.vote_tally(uuid)', 'EXECUTE'),
  false, 'authenticated callers cannot execute the tally directly');
select is(has_function_privilege('service_role', 'public.vote_tally(uuid)', 'EXECUTE'),
  true, 'the server role can read the canonical tally');

-- A clean paid ballot must not inflate the free audience tally.
insert into vote.votes (contest_id, entity_id, source, ip_hash, idempotency_key,
  restaurant_ballot, fraud_status, development_test)
values ('c1497000-0000-0000-0000-000000000001',
  'e1497000-0000-0000-0000-000000000001', 'paid', 'iph', 'tk-paid',
  false, 'clean', false);
select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'audience_accepted')::int,
  1, 'a clean paid ballot does not increase accepted free votes');

-- Suspicious audience ballots remain pending until they are reviewed.
update vote.votes set fraud_status = 'suspicious' where idempotency_key = 'tk-2';
select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'audience_pending')::int,
  1, 'a suspicious, non-test audience ballot remains pending');
select is((public.vote_tally('e1497000-0000-0000-0000-000000000001') ->> 'audience_total')::int,
  2, 'review state changes do not add paid, blocked, or test ballots to free audience total');

select * from finish();
rollback;
