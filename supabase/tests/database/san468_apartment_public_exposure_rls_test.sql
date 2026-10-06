-- SAN-468 §4.1 — apartments public exposure: RLS allow/deny for anon, the owning broker,
-- a different broker, and the fail-closed inventory shapes.
--
-- WHAT THIS LOCKS IN
--   1. RLS is enabled on public.apartments.
--   2. Anonymous clients see only `status = 'active'` inventory, and never a draft,
--      paused, rejected, or fail-closed external candidate row — even by exact UUID.
--   3. Anonymous row writes are denied by RLS; anon DML grants are retained for the
--      existing SAN-1054 behaviour contract. TRUNCATE/REFERENCES/TRIGGER are revoked
--      because PostgreSQL does not enforce them through RLS.
--   4. The owning broker can read all of its own states and update its own row.
--   5. A different broker cannot read or update another broker's private draft,
--      and an owning broker cannot insert an apartment under another landlord.
--
-- The public predicate remains `status = 'active'`; tightening it to approved +
-- published is SAN-386's canonical search-eligibility call (SAN-468 §4.2).
--
-- Run with: supabase test db
begin;

select plan(25);

-- ── Fixtures (transaction-owned, rolled back) ────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a4680000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san468-broker-a@example.com',
   extensions.crypt('san468-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a4680000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san468-broker-b@example.com',
   extensions.crypt('san468-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a4680000-0000-4000-8000-000000000011', 'a4680000-0000-4000-8000-000000000001',
   'SAN468 Broker A', 'approved'),
  ('a4680000-0000-4000-8000-000000000012', 'a4680000-0000-4000-8000-000000000002',
   'SAN468 Broker B', 'approved');

insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, metadata)
values
  ('b4680000-0000-4000-8000-000000000001', 'SAN468 public listing', 'san468-public',
   'Laureles', 'active', 'approved', 'published',
   'a4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('b4680000-0000-4000-8000-000000000002', 'SAN468 A draft', 'san468-a-draft',
   'Laureles', 'inactive', 'pending', 'draft',
   'a4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('b4680000-0000-4000-8000-000000000003', 'SAN468 A paused', 'san468-a-paused',
   'Laureles', 'inactive', 'approved', 'paused',
   'a4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('b4680000-0000-4000-8000-000000000004', 'SAN468 A rejected', 'san468-a-rejected',
   'Laureles', 'inactive', 'rejected', 'draft',
   'a4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('b4680000-0000-4000-8000-000000000005', 'SAN468 external candidate', 'san468-candidate',
   'Laureles', 'inactive', 'pending', 'draft', null,
   '{"inventory_kind":"external_candidate"}'::jsonb),
  ('b4680000-0000-4000-8000-000000000006', 'SAN468 B draft', 'san468-b-draft',
   'Laureles', 'inactive', 'pending', 'draft',
   'a4680000-0000-4000-8000-000000000012', '{}'::jsonb);

-- ── Catalog ──────────────────────────────────────────────────────────────────
select is(
  (select relrowsecurity from pg_class where oid = 'public.apartments'::regclass),
  true, 'C1: RLS is enabled on public.apartments');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'apartments'
      and policyname = 'anyone_can_view_active_apartments'),
  1, 'C2: the public SELECT policy exists');

select ok(
  not has_table_privilege('anon', 'public.apartments', 'TRUNCATE'),
  'C3: anon lacks TRUNCATE on apartments');

select ok(
  not has_table_privilege('anon', 'public.apartments', 'REFERENCES'),
  'C4: anon lacks REFERENCES on apartments');

select ok(
  not has_table_privilege('anon', 'public.apartments', 'TRIGGER'),
  'C5: anon lacks TRIGGER on apartments');

-- ── Anonymous ────────────────────────────────────────────────────────────────
set local role anon;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000001'), 1,
  'A1: anon can read the active published listing');

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000002'), 0,
  'A2: anon cannot read a draft by exact UUID');

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000003'), 0,
  'A3: anon cannot read a paused listing by exact UUID');

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000004'), 0,
  'A4: anon cannot read a rejected listing by exact UUID');

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000005'), 0,
  'A5: anon cannot read a fail-closed external candidate');

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000006'), 0,
  'A6: anon cannot read another broker draft');

select throws_ok(
  $$insert into public.apartments (title, slug, neighborhood)
    values ('SAN468 anon insert', 'san468-anon-insert', 'Laureles')$$,
  '42501', null::text, 'A7: anon INSERT is denied');

with anon_update as (
  update public.apartments set title = 'SAN468 anon update'
    where id = 'b4680000-0000-4000-8000-000000000001'
  returning 1
)
select is((select count(*)::int from anon_update), 0,
  'A8: anon UPDATE is filtered to zero rows by RLS');

with anon_delete as (
  delete from public.apartments where id = 'b4680000-0000-4000-8000-000000000001'
  returning 1
)
select is((select count(*)::int from anon_delete), 0,
  'A9: anon DELETE is filtered to zero rows by RLS');

reset role;

-- ── Broker A ─────────────────────────────────────────────────────────────────
set local role authenticated;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub', 'a4680000-0000-4000-8000-000000000001', true);

select is(public.is_admin(), false, 'A10: broker A is not an admin');

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000001'), 1,
  'A11: broker A can read the public listing');
select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000002'), 1,
  'A12: broker A can read its own draft');
select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000003'), 1,
  'A13: broker A can read its own paused listing');
select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000004'), 1,
  'A14: broker A can read its own rejected listing');
select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000006'), 0,
  'A15: broker A cannot read broker B draft');

select lives_ok(
  $$update public.apartments set title = 'SAN468 A draft updated'
    where id = 'b4680000-0000-4000-8000-000000000002'$$,
  'A16: broker A can update its own draft');

with updated as (
  update public.apartments set title = 'SAN468 hijack'
    where id = 'b4680000-0000-4000-8000-000000000006'
  returning 1
)
select is((select count(*)::int from updated), 0,
  'A17: broker A cannot update broker B draft');

select throws_ok(
  $$insert into public.apartments (title, slug, neighborhood, landlord_id)
    values ('SAN468 forged', 'san468-forged', 'Laureles',
            'a4680000-0000-4000-8000-000000000012')$$,
  '42501', null::text, 'A18: broker A cannot insert under broker B landlord');

reset role;

-- ── Broker B ─────────────────────────────────────────────────────────────────
set local role authenticated;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub', 'a4680000-0000-4000-8000-000000000002', true);

select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000006'), 1,
  'B1: broker B can read its own draft');
select is((select count(*)::int from public.apartments
           where id = 'b4680000-0000-4000-8000-000000000002'), 0,
  'B2: broker B cannot read broker A draft');

reset role;

select * from finish();
rollback;
