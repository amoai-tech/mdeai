-- =============================================================================
-- SAN-1379 · Exact pilot public-read contract after SAN-1406 integrity migration
-- Run with: supabase test db
--
-- SAN-1385 owns the schema and the two-partner isolation negatives. This file proves the
-- public browse/profile read path this task builds: anon and authenticated non-members see
-- published projects and their child rows, never drafts, and cannot write.
-- =============================================================================

begin;

-- Count only the canonical pilot namespace (16 projects, 41 typologies,
-- 20 price/layout sources after both ordered SAN-1406 migrations).
-- Do not weaken to lower bounds: a seed duplication or RLS leak must fail.
select plan(10);

-- ── anon public read ─────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.development_projects where source_key like 'medellin:new-project:%'), 16, 'P1 anon sees exactly 16 catalog pilot projects');
select is((select count(*)::int from public.development_unit_types u join public.development_projects p on p.id = u.project_id where p.source_key like 'medellin:new-project:%'), 41, 'P2 anon sees exactly 41 post-integrity unit types');
select is((select count(*)::int from public.development_project_sources s join public.development_projects p on p.id = s.project_id where p.source_key like 'medellin:new-project:%'), 20, 'P3 anon sees exactly 20 pilot provenance rows');
select throws_ok(
  $$insert into public.development_projects (source_key, slug, name, publish_state)
    values ('san1379-anon', 'san1379-anon', 'Anon', 'draft')$$,
  '42501', null, 'P4 anon cannot insert projects');
reset role;

-- ── a draft is invisible to the public roles ─────────────────────────────────
insert into public.development_projects
  (id, source_key, slug, name, publish_state, source_owner, ownership_status)
values
  ('a1379000-0000-4000-8000-000000000001', 'san1379-draft', 'san1379-draft', 'Draft Project', 'draft', 'Test', 'unclaimed');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.development_projects where id = 'a1379000-0000-4000-8000-000000000001'), 0, 'P5 anon cannot read a draft project');
reset role;

-- ── an authenticated non-member gets the same published-only view ────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1379000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.development_projects where source_key like 'medellin:new-project:%'), 16, 'P6 non-member sees exactly 16 published pilot projects');
select is((select count(*)::int from public.development_projects where id = 'a1379000-0000-4000-8000-000000000001'), 0, 'P7 authenticated non-member cannot read a draft project');
select throws_ok(
  $$insert into public.development_projects (source_key, slug, name, publish_state)
    values ('san1379-auth', 'san1379-auth', 'Auth', 'draft')$$,
  '42501', null, 'P8 authenticated non-member cannot insert projects');
select is((select count(*)::int from public.development_projects where slug = 'arrayan' and publish_state = 'published'), 1, 'P9 authenticated reads a published profile by slug');
reset role;

select is(has_table_privilege('anon', 'public.development_projects', 'DELETE'), false, 'P10 anon cannot DELETE projects');

select * from finish();
rollback;
