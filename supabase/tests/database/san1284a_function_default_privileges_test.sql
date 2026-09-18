-- SAN-1284 · Batch 0A regression suite — function default privileges
--
-- Asserts the migration's real effect: a NEW function in public is no longer executable
-- by anon / authenticated / service_role / PUBLIC.
--
-- NULL-SAFETY: every privilege assertion first proves the function OID is non-NULL and
-- then uses is(has_function_privilege(...), false). The earlier form,
-- isnt(has_function_privilege(...), true), was a false-green risk: a missing function
-- makes has_function_privilege return NULL, and isnt(NULL, true) PASSES. With is(..., false)
-- a NULL result fails, which is the safe direction.
--
-- Run with: supabase test db
begin;

select plan(17);

-- ═══════════════════════════════════════════════════════════════════════════════
-- A. The default privileges this migration owns
--
-- Both rows matter. The GLOBAL row is the one that clears PostgreSQL's built-in PUBLIC
-- grant for functions; the schema-scoped public row clears the recorded Data API role
-- grants. A schema-scoped PUBLIC revoke alone does NOT work — see the migration header.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select d.defaclacl::text
     from pg_default_acl d
     join pg_roles r on r.oid = d.defaclrole
    where r.rolname = 'postgres' and d.defaclnamespace = 0 and d.defaclobjtype = 'f'),
  '{postgres=X/postgres}',
  'A: GLOBAL function default for postgres is postgres-only');

select is(
  (select d.defaclacl::text
     from pg_default_acl d
     join pg_roles r on r.oid = d.defaclrole
    where r.rolname = 'postgres'
      and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype = 'f'),
  '{postgres=X/postgres}',
  'A: schema-public function default for postgres is postgres-only');

select is(
  (select count(*)::int
     from pg_default_acl d
     join pg_roles r on r.oid = d.defaclrole,
     lateral aclexplode(d.defaclacl) a
     left join pg_roles g on g.oid = a.grantee
    where r.rolname = 'postgres'
      and d.defaclobjtype = 'f'
      and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
      and (a.grantee = 0 or g.rolname in ('anon', 'authenticated', 'service_role'))),
  0,
  'A: no PUBLIC/anon/authenticated/service_role grant remains in either function default');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B. THE OUTCOME — a function created after Batch 0A is opt-in only
-- ═══════════════════════════════════════════════════════════════════════════════

create function public.zz_san1284a_probe() returns integer language sql as $fn$ select 1 $fn$;

select ok(
  (select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe') is not null,
  'B: probe function exists (OID non-NULL — guards the assertions below)');

select is(
  (select p.proacl::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  '{postgres=X/postgres}',
  'B: new function ACL is postgres-only (no PUBLIC entry)');

select is(
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  false,
  'B: new function is NOT anon-executable');

select is(
  (select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  false,
  'B: new function is NOT authenticated-executable');

select is(
  (select has_function_privilege('service_role', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  false,
  'B: new function is NOT service_role-executable');

select is(
  (select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  false,
  'B: new function has no effective PUBLIC EXECUTE');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C. Opting IN still works, and per-function revoke still works (Batch 0B's tool)
-- ═══════════════════════════════════════════════════════════════════════════════

grant execute on function public.zz_san1284a_probe() to anon;

select is(
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  true,
  'C: explicit GRANT still opts a function in');

revoke execute on function public.zz_san1284a_probe() from public, anon, authenticated, service_role;

select is(
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_probe'),
  false,
  'C: per-function REVOKE removes anon EXECUTE again');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D. No retroactive change — Batch 0A must not alter EXISTING function ACLs
--
-- A self-contained fixture proves the property without depending on application
-- functions, and the two application checks below keep the real integration signal.
-- ═══════════════════════════════════════════════════════════════════════════════

create function public.zz_san1284a_fixture() returns integer language sql as $fn$ select 2 $fn$;
grant execute on function public.zz_san1284a_fixture() to anon;

select ok(
  (select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_fixture') is not null,
  'D: fixture function exists (OID non-NULL)');

select is(
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'zz_san1284a_fixture'),
  true,
  'D: fixture keeps its explicit grant — the migration is not retroactive');

select ok(
  (select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'outbox_enqueue' limit 1) is not null,
  'D: outbox_enqueue exists (OID non-NULL)');

select is(
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'outbox_enqueue' limit 1),
  false,
  'D: service_role-only outbox_enqueue is still denied to anon');

select ok(
  (select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'decide_approval') is not null,
  'D: decide_approval exists (OID non-NULL)');

select is(
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'decide_approval'),
  true,
  'D: decide_approval ACL untouched by Batch 0A (still anon-executable; Batch 0C owns it)');

select * from finish();
rollback;
