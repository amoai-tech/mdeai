-- SAN-1498 · Secure restaurant vote submission contract (Option A)
--
-- Restaurant-only. Proves the public boundary against the private vote schema:
--   authorised restaurant ballot -> one row -> persisted receipt
--   anonymous / forged / duplicate / non-restaurant / closed / unapproved -> rejected
--   privileged RPCs are executable by service_role only
--   no pageant RPC is introduced; historical pageant data/tables are untouched
--
-- Runs on a disposable local database (supabase db reset); all fixtures roll back.

begin;

select plan(39);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'voter-a@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'voter-b@example.com'),
  ('a0000000-0000-0000-0000-000000000003', 'voter-c@example.com'),
  ('a0000000-0000-0000-0000-000000000004', 'voter-d@example.com'),
  ('a0000000-0000-0000-0000-000000000005', 'voter-e@example.com'),
  ('a0000000-0000-0000-0000-000000000006', 'voter-f@example.com'),
  ('a0000000-0000-0000-0000-000000000007', 'voter-g@example.com');

insert into public.profiles (id, email)
  values ('f0000000-0000-0000-0000-000000000001', 'org@example.com');

insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c0000000-0000-0000-0000-000000000001', 'top-restaurants-open',   'restaurant', 'Open',    'f0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day', 'live'),
  ('c0000000-0000-0000-0000-000000000002', 'top-restaurants-draft',  'restaurant', 'Draft',   'f0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day', 'draft'),
  ('c0000000-0000-0000-0000-000000000003', 'top-restaurants-closed', 'restaurant', 'Closed',  'f0000000-0000-0000-0000-000000000001', now() - interval '2 day', now() - interval '1 day', 'live'),
  ('c0000000-0000-0000-0000-000000000004', 'top-restaurants-future', 'restaurant', 'Future',  'f0000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '2 day', 'live'),
  ('c0000000-0000-0000-0000-000000000005', 'legacy-pageant',         'pageant',    'Legacy',  'f0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day', 'live');

insert into vote.entities (id, contest_id, slug, display_name, approved) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'approved-place',   'Approved Place',   true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'unapproved-place', 'Unapproved Place', false),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'draft-place',      'Draft Place',      true);

-- ── Privileged boundary: one restaurant writer ──────────────────────────────
select is(has_function_privilege('service_role', 'public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), true,  'service_role can execute the restaurant vote RPC');
select is(has_function_privilege('anon',         'public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), false, 'anon cannot execute the restaurant vote RPC');
select is(has_function_privilege('authenticated','public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), false, 'authenticated cannot execute the restaurant vote RPC');
select is((
  select count(*)::int from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = 'public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)'::regprocedure
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 0, 'no PUBLIC execute on the restaurant vote RPC');

-- ── Happy path: cast, persist, receipt ──────────────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','idem-0001','iphash-1')->>'status'),
  'cast', 'authorised authenticated restaurant ballot is cast'
);
select is((select count(*)::int from vote.votes where contest_id = 'c0000000-0000-0000-0000-000000000001'), 1, 'exactly one ballot row persisted');

-- ── One final ballot per account per contest ────────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','idem-0002','iphash-1')->>'status'),
  'already_voted', 'a second restaurant ballot by the same account returns already_voted'
);
select is((select count(*)::int from vote.votes where contest_id = 'c0000000-0000-0000-0000-000000000001'), 1, 'duplicate restaurant ballot did not add a row');

-- ── Idempotent replay returns the same receipt ──────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','idem-0001','iphash-1')->>'status'),
  'replayed', 'same idempotency key returns the original receipt'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','idem-0001','iphash-1') $q$,
  '23505', 'IDEMPOTENCY_KEY_CONFLICT', 'reused key for a different restaurant is rejected'
);

-- ── Restaurant eligibility and contest state ────────────────────────────────
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','idem-0003','iphash-2') $q$,
  '22023', 'RESTAURANT_NOT_APPROVED', 'unapproved restaurant entry is rejected'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','idem-0004','iphash-2') $q$,
  '22023', 'CONTEST_NOT_OPEN', 'draft contest is rejected'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','idem-0005','iphash-2') $q$,
  '22023', 'CONTEST_CLOSED', 'closed contest is rejected'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','idem-0006','iphash-2') $q$,
  '22023', 'CONTEST_NOT_STARTED', 'future contest is rejected'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','idem-0007','iphash-2') $q$,
  '22023', 'CONTEST_NOT_RESTAURANT', 'a non-restaurant contest is rejected'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','idem-0008','iphash-2') $q$,
  'P0002', 'RESTAURANT_NOT_FOUND', 'a restaurant from another contest is rejected'
);

-- ── Identity cannot be forged ───────────────────────────────────────────────
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'idem-0009','iphash-2') $q$,
  '42501', 'AUTH_REQUIRED', 'anonymous ballot is rejected'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000ff','idem-0010','iphash-2') $q$,
  '42501', 'AUTH_USER_NOT_FOUND', 'unknown user id is rejected'
);

-- ── A second account is a distinct voter ────────────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','idem-0011','iphash-2')->>'status'),
  'cast', 'a different account casts its own ballot'
);
select is((select count(*)::int from vote.votes where contest_id = 'c0000000-0000-0000-0000-000000000001'), 2, 'two distinct accounts produced two rows');

-- ── Private contestant data stays private ───────────────────────────────────
select is(has_table_privilege('anon', 'vote.entities', 'SELECT'), false, 'anon still cannot read vote.entities');

-- ── Read boundaries + restaurant-only scope ─────────────────────────────────
select is(has_function_privilege('service_role', 'public.vote_contest_context(uuid)', 'EXECUTE'), true, 'service_role can read contest context');
select is(has_function_privilege('authenticated', 'public.vote_contest_context(uuid)', 'EXECUTE'), false, 'authenticated cannot read contest context directly');
select is((select public.vote_contest_context('c0000000-0000-0000-0000-000000000001')->>'is_open'), 'true', 'open restaurant contest reports is_open');
select is((select public.vote_contest_context('c0000000-0000-0000-0000-000000000001')->>'kind'), 'restaurant', 'context returns the restaurant kind');
select is(has_function_privilege('service_role', 'public.vote_tally(uuid)', 'EXECUTE'), true, 'service_role can read the tally');
select is(has_function_privilege('anon', 'public.vote_tally(uuid)', 'EXECUTE'), false, 'anon cannot read the tally directly');
select is(to_regprocedure('public.cast_pageant_vote(uuid,uuid,uuid,text,text,text,text,text,text)'), null, 'no pageant RPC is introduced');


-- ── Database-enforced uniqueness + nonce replay protection ──────────────────
select is(to_regclass('vote.vote_votes_one_restaurant_ballot_idx') is not null, true, 'restaurant-scoped unique index exists');
select is((
  select count(*)::int from information_schema.columns
  where table_schema = 'vote' and table_name = 'votes' and column_name = 'restaurant_ballot'
), 1, 'restaurant_ballot flag column exists');
select is(has_function_privilege('service_role', 'public.vote_consume_nonce(uuid)', 'EXECUTE'), true, 'service_role can consume a nonce');
select is(has_function_privilege('authenticated', 'public.vote_consume_nonce(uuid)', 'EXECUTE'), false, 'authenticated cannot consume a nonce');
select is((select public.vote_consume_nonce('11111111-1111-1111-1111-111111111111')), true, 'a fresh nonce is consumed once');
select is((select public.vote_consume_nonce('11111111-1111-1111-1111-111111111111')), false, 'replaying the same nonce is rejected');
select is((select public.vote_tally('e0000000-0000-0000-0000-000000000001')->>'audience_total') is not null, true, 'tally exposes audience_total only (no legacy weighted fields)');
select is((select public.vote_tally('e0000000-0000-0000-0000-000000000001')->>'weighted_total'), null, 'tally does not expose weighted_total');

-- ── Real service_role execution of the boundary ─────────────────────────────
set local role service_role;
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','idem-0012','iphash-3')->>'status'),
  'cast', 'service_role can execute the restaurant writer'
);
reset role;

-- ── Device reuse is scored at write time ────────────────────────────────────
insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, device_hash, idempotency_key, restaurant_ballot, fraud_status) values
  ('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005','audience','iph','dev-x','dev-0005',true,'pending'),
  ('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006','audience','iph','dev-x','dev-0006',true,'pending'),
  ('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000007','audience','iph','dev-x','dev-0007',true,'pending');
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','idem-0013','iphash-4','dev-x')->>'fraud_status'),
  'suspicious', 'device reuse marks the ballot suspicious at write time'
);
select is((
  select count(*)::int from vote.fraud_signals fs
  join vote.votes v on v.id = fs.vote_id
  where v.idempotency_key = 'idem-0013' and fs.rules_hit @> array['device_reuse']
), 1, 'device reuse writes a fraud signal');

select * from finish();

rollback;
