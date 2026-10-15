-- SAN-1498 · Secure restaurant vote submission contract (Option A)
--
-- Proves the public RPC boundary against the private vote schema:
--   authorised cast -> one ballot -> persisted receipt
--   anonymous / forged identity / reuse / duplicate / closed / unapproved -> rejected
--   privileged RPC is executable by service_role only
--   legacy pageant rules are not changed by this contract
--
-- Runs on a disposable local database (supabase db reset) and rolls back all fixtures.

begin;

select plan(33);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'voter-a@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'voter-b@example.com');

insert into public.profiles (id, email)
  values ('f0000000-0000-0000-0000-000000000001', 'org@example.com');

insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c0000000-0000-0000-0000-000000000001', 'top-restaurants-open',   'restaurant', 'Open',   'f0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day', 'live'),
  ('c0000000-0000-0000-0000-000000000002', 'top-restaurants-draft',  'restaurant', 'Draft',  'f0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day', 'draft'),
  ('c0000000-0000-0000-0000-000000000003', 'top-restaurants-closed', 'restaurant', 'Closed', 'f0000000-0000-0000-0000-000000000001', now() - interval '2 day', now() - interval '1 day', 'live'),
  ('c0000000-0000-0000-0000-000000000004', 'top-restaurants-future', 'restaurant', 'Future', 'f0000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '2 day', 'live'),
  ('c0000000-0000-0000-0000-000000000005', 'reina-pageant',          'pageant',    'Pageant','f0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day', 'live');

insert into vote.entities (id, contest_id, slug, display_name, approved) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'approved-place',   'Approved Place',   true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'unapproved-place', 'Unapproved Place', false),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'draft-place',      'Draft Place',      true),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 'pageant-place',    'Pageant Place',    true);

-- ── Privileged boundary ─────────────────────────────────────────────────────
select is(has_function_privilege('service_role', 'public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), true,  'service_role can execute the vote RPC');
select is(has_function_privilege('anon',         'public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), false, 'anon cannot execute the vote RPC');
select is(has_function_privilege('authenticated','public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), false, 'authenticated cannot execute the vote RPC');
select is((
  select count(*)::int from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = 'public.cast_restaurant_vote(uuid,uuid,uuid,text,text,text,text,text)'::regprocedure
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 0, 'no PUBLIC execute on the vote RPC');

-- ── Happy path: cast, persist, receipt ──────────────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','idem-0001','iphash-1')->>'status'),
  'cast', 'authorised authenticated ballot is cast'
);
select is((select count(*)::int from vote.votes where contest_id = 'c0000000-0000-0000-0000-000000000001'), 1, 'exactly one vote row persisted');

-- ── One ballot per account per contest ──────────────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','idem-0002','iphash-1')->>'status'),
  'already_voted', 'a second ballot by the same account returns already_voted'
);
select is((select count(*)::int from vote.votes where contest_id = 'c0000000-0000-0000-0000-000000000001'), 1, 'duplicate ballot did not add a row');

-- ── Idempotent replay returns the same receipt ──────────────────────────────
select is(
  (select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','idem-0001','iphash-1')->>'status'),
  'replayed', 'same idempotency key returns the original receipt'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','idem-0001','iphash-1') $q$,
  '23505', 'IDEMPOTENCY_KEY_CONFLICT', 'reused key for a different entity is rejected'
);

-- ── Eligibility and contest state ───────────────────────────────────────────
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','idem-0003','iphash-2') $q$,
  '22023', 'ENTITY_NOT_APPROVED', 'unapproved entity is rejected'
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
  '22023', 'LEGACY_CONTEST_RULES', 'pageant contest is not changed by this contract'
);
select throws_ok(
  $q$ select public.cast_restaurant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','idem-0008','iphash-2') $q$,
  'P0002', 'ENTITY_NOT_FOUND', 'entity from another contest is rejected'
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

-- ── Read boundaries + legacy pageant writer ─────────────────────────────────
select is(has_function_privilege('service_role', 'public.vote_contest_context(uuid)', 'EXECUTE'), true, 'service_role can read contest context');
select is(has_function_privilege('authenticated', 'public.vote_contest_context(uuid)', 'EXECUTE'), false, 'authenticated cannot read contest context directly');
select is((select public.vote_contest_context('c0000000-0000-0000-0000-000000000001')->>'is_open'), 'true', 'open contest reports is_open');
select is((select public.vote_contest_context('c0000000-0000-0000-0000-000000000001')->>'kind'), 'restaurant', 'context returns the contest kind');
select is(has_function_privilege('service_role', 'public.vote_tally(uuid)', 'EXECUTE'), true, 'service_role can read the tally');
select is(has_function_privilege('anon', 'public.vote_tally(uuid)', 'EXECUTE'), false, 'anon cannot read the tally directly');
select is(has_function_privilege('service_role', 'public.cast_pageant_vote(uuid,uuid,uuid,text,text,text,text,text,text)', 'EXECUTE'), true, 'service_role can execute the pageant writer');
select is(has_function_privilege('authenticated', 'public.cast_pageant_vote(uuid,uuid,uuid,text,text,text,text,text,text)', 'EXECUTE'), false, 'authenticated cannot execute the pageant writer');
select throws_ok(
  $q$ select public.cast_pageant_vote('c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'pgidem0001','iphash-3') $q$,
  '22023', 'NOT_PAGEANT', 'pageant writer refuses a restaurant contest'
);
select is(
  (select public.cast_pageant_vote('c0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000005',null,'pgidem0002','iphash-4','anon-1')->>'status'),
  'cast', 'legacy pageant allows an anonymous ballot'
);
select is(
  (select public.cast_pageant_vote('c0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000005',null,'pgidem0003','iphash-4','anon-1')->>'status'),
  'cast', 'pageant anonymous ballots are not one-per-account'
);
select is((select (public.vote_tally('e0000000-0000-0000-0000-000000000005')->>'audience_votes')::int >= 1), true, 'tally reflects the committed pageant votes');

select * from finish();

rollback;
