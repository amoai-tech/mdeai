-- SAN-468 §4.2 + SAN-386 canonical public eligibility — pgTAP allow/deny proof.
--
-- Proves the one public-eligibility contract (public.rental_listing_is_public) and
-- that the tightened RLS uses it for anonymous clients, authenticated renters, and
-- the owning broker. Covers: canonical published, draft, rejected, paused,
-- external/unverified candidate, test fixture, and an active-but-unapproved,
-- unowned row, which must never become public inventory.
--
-- Run with: supabase test db
begin;

select plan(24);

-- Catalog + predicate unit checks -------------------------------------------
select has_function(
  'public', 'rental_listing_is_public',
  array['text', 'text', 'text', 'uuid', 'jsonb'],
  'F1: canonical eligibility predicate exists');

select is(
  public.rental_listing_is_public(
    'active', 'approved', 'published',
    'd4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  true,
  'F2: active + approved + published + owned is public');

select is(
  public.rental_listing_is_public(
    'active', 'approved', 'published',
    'd4680000-0000-4000-8000-000000000011',
    '{"inventory_kind":"external_candidate"}'::jsonb),
  false,
  'F3: an unverified external candidate is never public');

select is(
  public.rental_listing_is_public(
    'active', 'approved', 'published',
    'd4680000-0000-4000-8000-000000000011',
    '{"is_test_fixture":true}'::jsonb),
  false,
  'F4: a test fixture is never public');

select is(
  public.rental_listing_is_public(
    'active', 'pending', 'draft', null, '{}'::jsonb),
  false,
  'F5: active but unapproved/unpublished/unowned is never public');

select ok(
  has_function_privilege('anon',
    'public.rental_listing_is_public(text,text,text,uuid,jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.rental_listing_is_public(text,text,text,uuid,jsonb)', 'EXECUTE'),
  'F6: the predicate is executable by anon and authenticated');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'property_verifications'
      and policyname = 'property_verifications_select_public'),
  1,
  'F7: verification reads use the scoped visibility policy');

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('c4680000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san468-el-broker-a@example.com',
   extensions.crypt('san468-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('c4680000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san468-el-renter@example.com',
   extensions.crypt('san468-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('d4680000-0000-4000-8000-000000000011', 'c4680000-0000-4000-8000-000000000001',
   'SAN468 Eligibility Broker A', 'approved');

insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, metadata)
values
  ('e4680000-0000-4000-8000-000000000001', 'SAN468 canonical', 'san468-el-canonical',
   'Laureles', 'active', 'approved', 'published',
   'd4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('e4680000-0000-4000-8000-000000000002', 'SAN468 draft', 'san468-el-draft',
   'Laureles', 'inactive', 'pending', 'draft',
   'd4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('e4680000-0000-4000-8000-000000000003', 'SAN468 rejected', 'san468-el-rejected',
   'Laureles', 'inactive', 'rejected', 'draft',
   'd4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('e4680000-0000-4000-8000-000000000004', 'SAN468 paused', 'san468-el-paused',
   'Laureles', 'inactive', 'approved', 'paused',
   'd4680000-0000-4000-8000-000000000011', '{}'::jsonb),
  ('e4680000-0000-4000-8000-000000000005', 'SAN468 external', 'san468-el-external',
   'Laureles', 'active', 'approved', 'published',
   'd4680000-0000-4000-8000-000000000011',
   '{"inventory_kind":"external_candidate","allowed_action":"view_original_listing"}'::jsonb),
  ('e4680000-0000-4000-8000-000000000006', 'SAN468 fixture', 'san468-el-fixture',
   'Laureles', 'active', 'approved', 'published',
   'd4680000-0000-4000-8000-000000000011', '{"is_test_fixture":true}'::jsonb),
  ('e4680000-0000-4000-8000-000000000007', 'SAN468 active unowned', 'san468-el-unowned',
   'Laureles', 'active', 'pending', 'draft', null, '{}'::jsonb);

insert into public.property_verifications (apartment_id, status, notes)
values
  ('e4680000-0000-4000-8000-000000000001', 'verified', 'public listing verification'),
  ('e4680000-0000-4000-8000-000000000002', 'pending', 'private draft verification');

-- Anonymous ------------------------------------------------------------------
set local role anon;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000001'), 1,
  'A1: anon sees the canonical published listing');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000002'), 0,
  'A2: anon cannot see a draft');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000003'), 0,
  'A3: anon cannot see a rejected listing');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000004'), 0,
  'A4: anon cannot see a paused listing');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000005'), 0,
  'A5: anon cannot see an unverified external candidate');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000006'), 0,
  'A6: anon cannot see a test fixture');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000007'), 0,
  'A7: anon cannot see an active-but-unapproved/unowned row');
select is((select count(*)::int from public.property_verifications
           where apartment_id = 'e4680000-0000-4000-8000-000000000001'), 1,
  'A8: anon can read verification for a public listing');
select is((select count(*)::int from public.property_verifications
           where apartment_id = 'e4680000-0000-4000-8000-000000000002'), 0,
  'A9: anon cannot read verification for a private draft');
reset role;

-- Authenticated renter (no landlord profile) ---------------------------------
set local role authenticated;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub', 'c4680000-0000-4000-8000-000000000003', true);

select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000001'), 1,
  'R1: a renter sees the canonical published listing');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000002'), 0,
  'R2: a renter cannot see someone else''s draft');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000005'), 0,
  'R3: a renter cannot see an unverified external candidate');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000007'), 0,
  'R4: a renter cannot see an active-but-unapproved row');
reset role;

-- Owning broker --------------------------------------------------------------
set local role authenticated;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub', 'c4680000-0000-4000-8000-000000000001', true);

select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000001'), 1,
  'O1: the owner sees its canonical published listing');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000002'), 1,
  'O2: the owner still sees its own draft');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000003'), 1,
  'O3: the owner still sees its own rejected listing');
select is((select count(*)::int from public.apartments
           where id = 'e4680000-0000-4000-8000-000000000004'), 1,
  'O4: the owner still sees its own paused listing');
reset role;

select * from finish();
rollback;
