-- SAN-1482 · vote schema recovery replay test
--
-- Proves that a fresh rebuild from supabase/migrations/** reproduces the ten private
-- vote tables, the three SECURITY DEFINER helpers, their triggers, RLS and the SAN-1484
-- hardening. Runs only when the recovered schema is present; it is the durable parity
-- guard for 20261014194842_recover_vote_schema.sql.
--
-- Run with: supabase test db

begin;

select plan(21);

select is(
  (select count(*)::int from pg_namespace where nspname = 'vote'),
  1, 'vote schema exists'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vote' and c.relkind = 'r'),
  11, 'vote has exactly eleven tables (ten recovered + contest_audit)'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vote' and c.relkind = 'r'
      and c.relname in ('contests','categories','entities','votes','entity_tally',
                        'fraud_signals','judges','judge_scores','scoring_criteria','paid_vote_orders')),
  10, 'all ten expected vote tables exist'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vote'
      and p.proname in ('recompute_entity_tally','trigger_recompute_on_vote','trigger_recompute_on_judge_score')),
  3, 'the three vote helpers exist'
);

select is(
  (select count(*)::int from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal and p.pronamespace = 'vote'::regnamespace
      and tg.tgname in ('tr_recompute_tally_on_vote','tr_recompute_tally_on_judge_score')),
  2, 'both tally triggers are bound'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vote' and c.relkind = 'r' and c.relrowsecurity),
  11, 'RLS is enabled on all eleven vote tables'
);

-- SAN-1484 hardening must survive the fresh rebuild
select is(has_table_privilege('anon','vote.entities','SELECT'), false, 'anon cannot select vote.entities');
select is(has_table_privilege('authenticated','vote.entities','SELECT'), false, 'authenticated cannot select vote.entities');
select is(has_table_privilege('authenticated','vote.entities','INSERT'), false, 'authenticated cannot insert vote.entities');
select is(has_table_privilege('authenticated','vote.entities','UPDATE'), false, 'authenticated cannot update vote.entities');
select is(has_column_privilege('anon','vote.entities','id_front_url','SELECT'), false, 'anon cannot read identity-document columns');
select is(
  (select count(*)::int from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.pronamespace = 'vote'::regnamespace
     and p.proname in ('recompute_entity_tally','trigger_recompute_on_vote','trigger_recompute_on_judge_score')
     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'no PUBLIC execute on the vote helpers'
);
select is(has_function_privilege('postgres','vote.recompute_entity_tally(uuid)','EXECUTE'), true, 'owner keeps execute');
select is(
  (select count(*)::int from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.pronamespace = 'vote'::regnamespace
     and p.proname in ('recompute_entity_tally','trigger_recompute_on_vote','trigger_recompute_on_judge_score')
     and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE'),
  0, 'no end-user execute on the vote helpers'
);

-- expected public read parity (unchanged by SAN-1484)
select is(has_schema_privilege('anon','vote','USAGE'), true, 'anon has vote schema usage');
select is(has_schema_privilege('authenticated','vote','USAGE'), true, 'authenticated has vote schema usage');
select is(has_table_privilege('anon','vote.contests','SELECT'), true, 'anon can select contests (public read parity)');
select is(has_table_privilege('authenticated','vote.entity_tally','SELECT'), true, 'authenticated can select entity_tally (public read parity)');

-- helper definitions preserved
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vote' and p.prosecdef),
  3, 'all three helpers remain SECURITY DEFINER'
);
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vote' and c.relkind = 'i'),
  50, 'vote has the expected fifty indexes'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'vote'),
  29, 'vote has the expected twenty-nine RLS policies'
);

select * from finish();
rollback;
