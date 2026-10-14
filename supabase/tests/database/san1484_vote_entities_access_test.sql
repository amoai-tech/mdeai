-- SAN-1484 · Phase A regression suite — private contest data is not end-user readable
--
-- WHAT THIS LOCKS IN
--   1. anon and authenticated hold no table-wide select/insert/update on vote.entities.
--   2. No PUBLIC grant lets an end-user role read vote.entities.
--   3. anon and authenticated cannot execute the three vote security-definer helpers.
--   4. The owner still can, and the vote triggers are still bound.
--
-- WHY IT IS SAFE (see the migration header): the vote schema is not exposed by PostgREST, the
-- identity columns hold no values today, and PostgreSQL checks trigger-function execute at
-- create time, not fire time (proven in 20260920130000_san1284c).
--
-- ENVIRONMENT NOTE
--   The vote schema is production-only today; SAN-1482 recovers it into versioned migrations.
--   On a fresh rebuild it does not exist, so this suite plans zero tests and asserts nothing
--   rather than failing on a schema the rebuild cannot create yet. It runs in full wherever the
--   schema exists (a production-like database, or after SAN-1482).
--
-- Run with: supabase test db

begin;

select plan(
  case when to_regclass('vote.entities') is null then 0 else 14 end
);

-- ── vote.entities table privileges ───────────────────────────────────────────────
select is(
  has_table_privilege('anon', 'vote.entities', 'SELECT'),
  false, 'anon cannot select vote.entities'
) where to_regclass('vote.entities') is not null;

select is(
  has_table_privilege('authenticated', 'vote.entities', 'SELECT'),
  false, 'authenticated cannot select vote.entities'
) where to_regclass('vote.entities') is not null;

select is(
  has_table_privilege('authenticated', 'vote.entities', 'INSERT'),
  false, 'authenticated cannot insert vote.entities'
) where to_regclass('vote.entities') is not null;

select is(
  has_table_privilege('authenticated', 'vote.entities', 'UPDATE'),
  false, 'authenticated cannot update vote.entities'
) where to_regclass('vote.entities') is not null;

select is(
  (select count(*)::int
     from aclexplode((select relacl from pg_class where oid = 'vote.entities'::regclass)) a
    where a.grantee = 0 and a.privilege_type = 'SELECT'),
  0, 'no PUBLIC select grant remains on vote.entities'
) where to_regclass('vote.entities') is not null;

-- ── vote definer helpers: end-user execute removed ───────────────────────────────
select is(
  has_function_privilege('anon', 'vote.recompute_entity_tally(uuid)', 'EXECUTE'),
  false, 'anon cannot execute recompute_entity_tally'
) where to_regprocedure('vote.recompute_entity_tally(uuid)') is not null;

select is(
  has_function_privilege('authenticated', 'vote.recompute_entity_tally(uuid)', 'EXECUTE'),
  false, 'authenticated cannot execute recompute_entity_tally'
) where to_regprocedure('vote.recompute_entity_tally(uuid)') is not null;

select is(
  has_function_privilege('anon', 'vote.trigger_recompute_on_vote()', 'EXECUTE'),
  false, 'anon cannot execute trigger_recompute_on_vote'
) where to_regprocedure('vote.trigger_recompute_on_vote()') is not null;

select is(
  has_function_privilege('authenticated', 'vote.trigger_recompute_on_vote()', 'EXECUTE'),
  false, 'authenticated cannot execute trigger_recompute_on_vote'
) where to_regprocedure('vote.trigger_recompute_on_vote()') is not null;

select is(
  has_function_privilege('anon', 'vote.trigger_recompute_on_judge_score()', 'EXECUTE'),
  false, 'anon cannot execute trigger_recompute_on_judge_score'
) where to_regprocedure('vote.trigger_recompute_on_judge_score()') is not null;

select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'vote'::regnamespace
      and p.proname in ('recompute_entity_tally', 'trigger_recompute_on_vote', 'trigger_recompute_on_judge_score')
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'no PUBLIC execute grant remains on the vote helpers'
) where to_regclass('vote.entities') is not null;

-- ── preserved access ─────────────────────────────────────────────────────────────
select is(
  has_function_privilege('postgres', 'vote.recompute_entity_tally(uuid)', 'EXECUTE'),
  true, 'owner postgres keeps execute on recompute_entity_tally'
) where to_regprocedure('vote.recompute_entity_tally(uuid)') is not null;

select cmp_ok(
  (select count(*)::int from pg_trigger tg
    where not tg.tgisinternal
      and tg.tgfoid in (
        to_regprocedure('vote.trigger_recompute_on_vote()'),
        to_regprocedure('vote.trigger_recompute_on_judge_score()')
      )),
  '>=', 1, 'vote triggers are still bound to their helper functions'
) where to_regclass('vote.entities') is not null;

-- ── direct invocation denied ─────────────────────────────────────────────────────
set local role anon;
select throws_ok(
  $$select vote.recompute_entity_tally('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501', null, 'anon direct call to recompute_entity_tally is denied'
) where to_regprocedure('vote.recompute_entity_tally(uuid)') is not null;
reset role;

select * from finish();
rollback;
