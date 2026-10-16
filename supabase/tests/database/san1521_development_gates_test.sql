-- SAN-1521 · Development business gates: launch preserves the gates, development relaxes them.
-- Rolled back entirely; production defaults to 'launch'.
begin;

select plan(25);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001','g1@example.com'),
  ('a1000000-0000-0000-0000-000000000002','g2@example.com'),
  ('a1000000-0000-0000-0000-000000000003','g3@example.com'),
  ('a1000000-0000-0000-0000-000000000004','g4@example.com'),
  ('a1000000-0000-0000-0000-000000000005','g5@example.com'),
  ('a1000000-0000-0000-0000-000000000006','g6@example.com'),
  ('a1000000-0000-0000-0000-000000000007','g7@example.com'),
  ('a1000000-0000-0000-0000-000000000008','g8@example.com');
insert into public.profiles (id, email) values ('f1000000-0000-0000-0000-000000000001','gorge@example.com');

insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1000000-0000-0000-0000-000000000001','g-open','restaurant','Open','f1000000-0000-0000-0000-000000000001', now()-interval '1 day', now()+interval '1 day','live'),
  ('c1000000-0000-0000-0000-000000000002','g-draft','restaurant','Draft','f1000000-0000-0000-0000-000000000001', now()-interval '1 day', now()+interval '1 day','draft'),
  ('c1000000-0000-0000-0000-000000000003','g-closed','restaurant','Closed','f1000000-0000-0000-0000-000000000001', now()-interval '2 day', now()-interval '1 day','live'),
  ('c1000000-0000-0000-0000-000000000004','g-future','restaurant','Future','f1000000-0000-0000-0000-000000000001', now()+interval '1 day', now()+interval '2 day','live');

insert into vote.entities (id, contest_id, slug, display_name, approved) values
  ('e1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','g-appr','Approved',true),
  ('e1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','g-unap','Unapproved',false),
  ('e1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000002','g-draft-e','Draft E',true),
  ('e1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000003','g-closed-e','Closed E',true),
  ('e1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000004','g-future-e','Future E',true);

-- ── Launch (default): business gates enforced ───────────────────────────────
select is(private.mde_application_phase(), 'development', 'seeded phase is development (development-now)');
update public.app_runtime_config set value='launch', updated_at=now() where key='application_phase';
select is(private.mde_application_phase(), 'launch', 'phase can be set to launch');
select throws_ok($q$ select public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','lkey-0001','iph') $q$, '22023','RESTAURANT_NOT_APPROVED','launch rejects unapproved entry');
select throws_ok($q$ select public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000002','lkey-0002','iph') $q$, '22023','CONTEST_NOT_OPEN','launch rejects draft contest');
select throws_ok($q$ select public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000003','lkey-0003','iph') $q$, '22023','CONTEST_CLOSED','launch rejects closed contest');
select throws_ok($q$ select public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000004','lkey-0004','iph') $q$, '22023','CONTEST_NOT_STARTED','launch rejects future contest');
select is((public.vote_contest_context('c1000000-0000-0000-0000-000000000002')->>'voting_available'), 'false', 'launch: draft is not votable');

-- ── Development: gates relaxed ──────────────────────────────────────────────
update public.app_runtime_config set value='development', updated_at=now() where key='application_phase';
select is(private.mde_application_phase(), 'development', 'phase switched to development');
select is((public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','lkey-0001','iph')->>'status'), 'cast', 'development accepts unapproved entry');
select is((public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000002','lkey-0002','iph')->>'status'), 'cast', 'development accepts draft contest');
select is((public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000003','lkey-0003','iph')->>'status'), 'cast', 'development accepts after end date');
select is((public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000004','lkey-0004','iph')->>'status'), 'cast', 'development accepts before start date');
select is((public.vote_contest_context('c1000000-0000-0000-0000-000000000002')->>'voting_available'), 'true', 'development: draft is votable');
select is((public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','lkey-0005','iph')->>'status'), 'already_voted', 'development still enforces one ballot per account');
select is(((public.vote_tally('e1000000-0000-0000-0000-000000000002')->>'development_test_total')::int >= 1), true, 'development tally exposes a development-only count');
select is((public.vote_tally('e1000000-0000-0000-0000-000000000002')->>'audience_accepted'), '0', 'accepted stays clean-only during development');

-- Device reuse: detected and logged, but weight stays 1 in development.
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, device_hash, idempotency_key, restaurant_ballot, fraud_status, weight) values
  ('c1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000005','audience','iph','dev-y','lkey-0006',true,'pending',1),
  ('c1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000006','audience','iph','dev-y','lkey-0007',true,'pending',1),
  ('c1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000007','audience','iph','dev-y','lkey-0008',true,'pending',1);
select is((public.cast_restaurant_vote('c1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000008','lkey-0009','iph','dev-y')->>'fraud_status'), 'pending', 'development does not suppress a device-reuse ballot');
select is((select weight::text from vote.votes where idempotency_key='lkey-0009'), '1.000', 'development keeps weight 1 for flagged ballots');
select is((select count(*)::int from vote.fraud_signals fs join vote.votes v on v.id=fs.vote_id where v.idempotency_key='lkey-0009' and fs.rules_hit @> array['device_reuse']), 1, 'device-reuse signal is still recorded');


-- ── Authorization matrix: visibility + writes by role and phase ──────────────
insert into public.restaurants (name, is_active) values ('IT Inactive Gate', false);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002"}', true);

set local role anon;
select is((select count(*)::int from public.restaurants where not is_active), 1, 'development: anon sees inactive restaurants');
reset role;

update public.app_runtime_config set value='launch', updated_at=now() where key='application_phase';
set local role anon;
select is((select count(*)::int from public.restaurants where not is_active), 0, 'launch: anon cannot see inactive restaurants');
select throws_ok($q$ insert into public.restaurants (name) values ('IT anon write') $q$, '42501', null, 'launch: anon cannot write restaurants');
reset role;
update public.app_runtime_config set value='development', updated_at=now() where key='application_phase';

set local role authenticated;
select throws_ok($q$ insert into public.restaurants (name) values ('IT denied') $q$, '42501', null, 'ordinary authenticated user cannot write restaurants');
reset role;

insert into public.user_roles (user_id, role) values ('a1000000-0000-0000-0000-000000000001', 'admin');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', true);
set local role authenticated;
select lives_ok($q$ insert into public.restaurants (name, is_active) values ('IT admin restaurant', false) $q$, 'super admin can create an inactive restaurant');
select lives_ok($q$ update public.restaurants set is_verified = true where name = 'IT admin restaurant' $q$, 'super admin can update a restaurant');
reset role;

select * from finish();
rollback;
