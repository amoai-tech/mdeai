-- fashionos_* exposure regression suite
--
-- Locks in: the eight fashionos_* tables are no longer readable or writable by end-user roles,
-- and no app-owned table in `public` is ever left in the dangerous combination of
-- RLS-disabled + end-user grants again.
--
-- Run with: supabase test db
begin;

select plan(8);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CATCH-ALL — the invariant, not just today's tables.
--
-- The defect was not "these eight tables"; it was that Supabase's default ACL grants anon and
-- authenticated full DML on every table `postgres` creates in `public`, and nothing forced the
-- author to add RLS. A table with grants and no RLS is world-readable AND world-writable over
-- PostgREST. This assertion fails if any future migration repeats it.
-- Extension-owned tables are excluded: PostGIS owns `spatial_ref_sys`, and the correct fix for
-- that one is relocating the extension, not enabling RLS on it.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not c.relrowsecurity
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
      and (   has_table_privilege('anon', c.oid, 'SELECT')
           or has_table_privilege('anon', c.oid, 'INSERT')
           or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE')
           or has_table_privilege('authenticated', c.oid, 'SELECT')
           or has_table_privilege('authenticated', c.oid, 'INSERT')
           or has_table_privilege('authenticated', c.oid, 'UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'C: no app-owned public table is RLS-disabled while end-user roles hold DML');

-- ═══════════════════════════════════════════════════════════════════════════════
-- THE EIGHT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname like 'fashionos\_%' and c.relrowsecurity),
  8, 'R: all eight fashionos_* tables have RLS enabled');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname like 'fashionos\_%'
      and (   has_table_privilege('anon', c.oid, 'SELECT')
           or has_table_privilege('anon', c.oid, 'INSERT')
           or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE'))),
  0, 'R: anon holds no privilege on any fashionos_* table');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname like 'fashionos\_%'
      and (   has_table_privilege('authenticated', c.oid, 'SELECT')
           or has_table_privilege('authenticated', c.oid, 'INSERT')
           or has_table_privilege('authenticated', c.oid, 'UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'R: authenticated holds no privilege on any fashionos_* table');

-- service_role is the intended backend path: it carries BYPASSRLS, so it must keep access.
select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname like 'fashionos\_%'
      and has_table_privilege('service_role', c.oid, 'SELECT')),
  8, 'R: service_role retains SELECT on all eight (backend path preserved)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- BEHAVIOURAL — the real refusal, as the real roles.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select throws_ok($$select count(*) from public.fashionos_leads$$, '42501', null,
                 'X: anon DENIED SELECT on fashionos_leads');
reset role;

set local role authenticated;
select throws_ok($$insert into public.fashionos_outreach_drafts (draft_text) values ('probe')$$,
                 '42501', null,
                 'X: authenticated DENIED INSERT into fashionos_outreach_drafts');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCOPE GUARD — the deliberate exception is still deliberate.
-- spatial_ref_sys is postgis extension-owned; this migration must not have altered it.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_class c
     join pg_depend d on d.objid = c.oid and d.deptype = 'e'
     join pg_extension e on e.oid = d.refobjid
    where c.relnamespace = 'public'::regnamespace
      and c.relname = 'spatial_ref_sys'
      and e.extname = 'postgis'),
  1, 'S: spatial_ref_sys still postgis-owned and untouched');

select * from finish();
rollback;
