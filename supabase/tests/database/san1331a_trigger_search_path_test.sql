-- SAN-1331 · Task 138 · MDE-SEC-004 — regression suite for the residual
-- `function_search_path_mutable` advisor finding.
--
-- WHAT THIS LOCKS IN
--   1. public.trigger_set_timestamps() pins search_path to the empty string, which
--      is what clears Supabase Security Advisor lint 0011 for it.
--   2. No app-owned function in `public` is left with a role-mutable search_path,
--      so the finding cannot silently reappear through a later migration that
--      recreates a function without its SET clause. Extension-owned functions
--      (PostGIS, pgvector) are excluded on purpose — they are not app-owned and
--      cannot be altered by the migration role.
--   3. The pinning is behaviour-preserving: the BEFORE INSERT/UPDATE trigger still
--      populates its timestamp columns under an empty search_path.
--
-- Run with: supabase test db
begin;

select plan(5);

-- ═══════════════════════════════════════════════════════════════════════════════
-- A. CATALOG — the advisor finding is actually cleared by the new pin.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  coalesce(
    (select 'search_path=""' = any(p.proconfig)
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname = 'trigger_set_timestamps'),
    false),
  'A: public.trigger_set_timestamps() pins search_path to the empty string');

-- Catch-all: a future migration that recreates any app-owned public function
-- without its SET clause fails here instead of only in the live advisor.
select is(
  (select count(*)::int
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.proconfig is null
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  0, 'A: no app-owned public function has a role-mutable search_path');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B. BEHAVIOURAL — an empty search_path must not break the trigger.
--    Runs against a scratch table, all rolled back.
-- ═══════════════════════════════════════════════════════════════════════════════

create table public.__san1331a_probe (
  id           int primary key,
  "createdAt"  timestamptz,
  "updatedAt"  timestamptz,
  "createdAtZ" timestamptz,
  "updatedAtZ" timestamptz
);

create trigger __san1331a_probe_trg
  before insert or update on public.__san1331a_probe
  for each row execute function public.trigger_set_timestamps();

insert into public.__san1331a_probe(id) values (1);

select isnt(
  (select "createdAt" from public.__san1331a_probe where id = 1),
  null, 'B: BEFORE INSERT still populates "createdAt" under search_path = ''''');

select isnt(
  (select "createdAtZ" from public.__san1331a_probe where id = 1),
  null, 'B: BEFORE INSERT still populates "createdAtZ" under search_path = ''''');

update public.__san1331a_probe set "updatedAt" = null where id = 1;

select isnt(
  (select "updatedAt" from public.__san1331a_probe where id = 1),
  null, 'B: BEFORE UPDATE still populates "updatedAt" under search_path = ''''');

select * from finish();
rollback;
