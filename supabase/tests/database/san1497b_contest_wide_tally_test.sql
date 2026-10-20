-- SAN-1497 · one nominee gaining a ballot changes every contender's normalized score
--
-- recompute_entity_tally() divides by the contest's maximum audience count, but the trigger only
-- recomputes the entity whose ballot changed. When that entity becomes the new maximum, every other
-- contender's denominator changed while their stored weighted_total did not.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('f1499000-0000-0000-0000-000000000001','wide-a@example.com'),
  ('f1499000-0000-0000-0000-000000000002','wide-b@example.com'),
  ('f1499000-0000-0000-0000-000000000003','wide-c@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1499000-0000-0000-0000-000000000001','[TEST] Wide A', true),
  ('a1499000-0000-0000-0000-000000000002','[TEST] Wide B', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1499000-0000-0000-0000-000000000001','wide-test','restaurant','[TEST] Wide','f1499000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day','live');
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1499000-0000-0000-0000-000000000001','c1499000-0000-0000-0000-000000000001','wide-a','[TEST] Wide A','a1499000-0000-0000-0000-000000000001'),
  ('e1499000-0000-0000-0000-000000000002','c1499000-0000-0000-0000-000000000001','wide-b','[TEST] Wide B','a1499000-0000-0000-0000-000000000002');

-- One ballot each: both normalise to 1.000, so both score 0.5.
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status, development_test) values
  ('c1499000-0000-0000-0000-000000000001','e1499000-0000-0000-0000-000000000001','f1499000-0000-0000-0000-000000000001','audience','iph','wd-1',true,'pending',false),
  ('c1499000-0000-0000-0000-000000000001','e1499000-0000-0000-0000-000000000002','f1499000-0000-0000-0000-000000000002','audience','iph','wd-2',true,'pending',false);

select is((select round(weighted_total::numeric, 3)::text from vote.entity_tally where entity_id = 'e1499000-0000-0000-0000-000000000002'),
  '0.500', 'both contenders start at 0.500 when the contest maximum is 1');

-- A gains a second ballot: the contest maximum becomes 2, so B's normalised score halves.
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status, development_test) values
  ('c1499000-0000-0000-0000-000000000001','e1499000-0000-0000-0000-000000000001','f1499000-0000-0000-0000-000000000003','audience','iph','wd-3',true,'pending',false);

select is((select round(weighted_total::numeric, 3)::text from vote.entity_tally where entity_id = 'e1499000-0000-0000-0000-000000000002'),
  '0.250', 'a contender that did not change still re-normalises against the new maximum');

select is((select round(weighted_total::numeric, 3)::text from vote.entity_tally where entity_id = 'e1499000-0000-0000-0000-000000000001'),
  '0.500', 'the leading contender keeps a full score at the new maximum');

select * from finish();
rollback;
