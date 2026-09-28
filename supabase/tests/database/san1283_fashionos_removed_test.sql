-- SAN-1283 · The eight foreign FashionOS tables are gone, and nothing is left pointing at them
--
-- WHAT THIS LOCKS IN
--   1. All eight `fashionos_*` tables are absent from `public`.
--   2. No table matching `fashionos%` remains, so a ninth table added later cannot silently
--      reintroduce the cluster while this test still passes.
--   3. No foreign key from any surviving table still targets a `fashionos_*` relation.
--   4. No function body still mentions `fashionos`.
--
-- WHY THIS IS THE RIGHT PROOF SHAPE
-- The decision in SAN-1283 was REMOVE. A test that only asserted "the eight tables are gone"
-- would still pass if a dependent view, function or foreign key survived as a dangling
-- reference. Assertions 3 and 4 close that gap: the cluster must be gone *and* unreferenced.
--
-- CONTROLS
-- Assertions 5 and 6 are the controls. A database where `public` had been dropped would
-- satisfy every "absent" assertion above, so this file also proves that `public` still exists
-- and still holds the MDE tables the product depends on (`apartments`, `leads`, `showings`).
-- Without those two, "everything is gone" would be indistinguishable from "the test is wrong".
--
-- RED → GREEN
--   RED   against 20260628050558_fashionos_lead_finder_mvp_namespaced.sql (before this change):
--         assertions 1–2 fail — the eight tables exist.
--   GREEN after 20260928120000_san1283_drop_fashionos_tables.sql.
--
-- Verified by: supabase test db

begin;

select plan(13);

-- ── 1. Each of the eight tables is absent ────────────────────────────────────────────────
select hasnt_table('public', 'fashionos_activity_log',
  'SAN-1283: fashionos_activity_log is removed');
select hasnt_table('public', 'fashionos_companies',
  'SAN-1283: fashionos_companies is removed');
select hasnt_table('public', 'fashionos_lead_events',
  'SAN-1283: fashionos_lead_events is removed');
select hasnt_table('public', 'fashionos_leads',
  'SAN-1283: fashionos_leads is removed');
select hasnt_table('public', 'fashionos_outreach_drafts',
  'SAN-1283: fashionos_outreach_drafts is removed');
select hasnt_table('public', 'fashionos_people',
  'SAN-1283: fashionos_people is removed');
select hasnt_table('public', 'fashionos_sources',
  'SAN-1283: fashionos_sources is removed');
select hasnt_table('public', 'fashionos_workflow_runs',
  'SAN-1283: fashionos_workflow_runs is removed');

-- ── 2. No relation matching fashionos% survives anywhere in public ───────────────────────
-- Catches a table, view, materialized view or sequence that a future change might add.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'fashionos%'),
  0,
  'SAN-1283: no relation matching fashionos% remains in public'
);

-- ── 3. No surviving foreign key targets a fashionos relation ─────────────────────────────
-- Resolved through catalog joins rather than `confrelid::regclass::text`. The text form is
-- search_path-dependent: with `public` absent from the path it renders `public.fashionos_x`,
-- which does not match a `fashionos%` pattern, so the assertion would pass silently while a
-- dependent foreign key still existed. Joining pg_class/pg_namespace with an explicit
-- `nspname = 'public'` filter is path-independent and cannot miss that way.
select is(
  (select count(*)::int
     from pg_constraint c
     join pg_class t on t.oid = c.confrelid
     join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname like 'fashionos\_%'),
  0,
  'SAN-1283: no foreign key targets a fashionos relation'
);

-- ── 4. No function body still references fashionos ───────────────────────────────────────
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ilike '%fashionos%'),
  0,
  'SAN-1283: no function body references fashionos'
);

-- ── 5–6. Controls — the schema this test reasons about still exists ──────────────────────
select has_schema('public',
  'CONTROL: public schema still exists');

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in ('apartments', 'leads', 'showings')),
  3,
  'CONTROL: apartments, leads and showings still exist in public'
);

select * from finish();

rollback;
