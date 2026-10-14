-- SAN-1432 · private rental evidence is owner/admin only.
--
-- Role matrix over the three raw evidence tables: anon, an unrelated signed-in
-- renter, an unrelated broker, the owning broker, an admin and service_role; plus
-- policy presence and denied client writes. All fixtures roll back.
--
-- Run with: supabase test db
begin;

select plan(36);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES
-- ═══════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('c1432000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1432-owner-a@example.com',
   extensions.crypt('san1432-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('c1432000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1432-other-b@example.com',
   extensions.crypt('san1432-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('c1432000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1432-admin-c@example.com',
   extensions.crypt('san1432-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('c1432000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1432-renter-d@example.com',
   extensions.crypt('san1432-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values
  ('c1432000-0000-4000-8000-000000000011', 'c1432000-0000-4000-8000-000000000001',
   'SAN1432 Owner A', 'approved', now()),
  ('c1432000-0000-4000-8000-000000000012', 'c1432000-0000-4000-8000-000000000002',
   'SAN1432 Other B', 'approved', now());

insert into public.user_roles (user_id, role)
values ('c1432000-0000-4000-8000-000000000003', 'admin');

insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id, verified)
values
  ('c1432000-0000-4000-8000-000000000021', 'SAN1432 A private', 'san1432-a-private',
   'Laureles', 'inactive', 'pending', 'draft', 'c1432000-0000-4000-8000-000000000011', false),
  ('c1432000-0000-4000-8000-000000000022', 'SAN1432 A published', 'san1432-a-published',
   'Laureles', 'active', 'approved', 'published', 'c1432000-0000-4000-8000-000000000011', true),
  ('c1432000-0000-4000-8000-000000000023', 'SAN1432 B private', 'san1432-b-private',
   'Laureles', 'inactive', 'pending', 'draft', 'c1432000-0000-4000-8000-000000000012', false),
  ('c1432000-0000-4000-8000-000000000024', 'SAN1432 unowned', 'san1432-unowned',
   'Laureles', 'inactive', 'pending', 'draft', null, false);

insert into public.rental_freshness_log (listing_id, checked_at, status)
select id, now(), 'active' from public.apartments where slug like 'san1432-%';
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
select id, 'san1432/' || slug || '.jpg', 'image/jpeg', 'unverified'
  from public.apartments where slug like 'san1432-%';
insert into public.rental_grounding (apartment_id, source_type, source_url, extracted_text)
select id, 'source_page', 'https://example.com/' || slug, 'private grounding text'
  from public.apartments where slug like 'san1432-%';
insert into public.property_verifications (apartment_id, status, notes, metadata)
select id, 'verified', 'private verification note for ' || slug,
       jsonb_build_object('source', 'san1432-fixture')
  from public.apartments where slug like 'san1432-%';

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · POLICY SHAPE
-- ═══════════════════════════════════════════════════════════════════════════════
select ok(
  (select count(*) = 0 from pg_policies
    where schemaname='public'
      and policyname in ('anon_select_rental_freshness_log','authenticated_select_rental_freshness_log',
                         'anon_select_rental_listing_images','authenticated_select_rental_listing_images',
                         'rental_grounding_public_select')),
  'A1: all five permissive evidence SELECT policies are gone');
select ok(
  (select count(*) = 3 from pg_policies
    where schemaname='public'
      and policyname in ('rental_freshness_log_select_owner_or_admin',
                         'rental_listing_images_select_owner_or_admin',
                         'rental_grounding_select_owner_or_admin')),
  'A2: the three owner/admin SELECT policies exist');
select ok(
  (select bool_and(not has_table_privilege('anon', c.oid, 'SELECT'))
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('rental_freshness_log','rental_listing_images','rental_grounding')),
  'A3: anon has no SELECT grant on any evidence table');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · ANONYMOUS — no rows, even for a published apartment
-- ═══════════════════════════════════════════════════════════════════════════════
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select count(*) from public.rental_freshness_log$$,
  '42501', null, 'B1: anon has no read grant on freshness evidence');
select throws_ok($$select count(*) from public.rental_listing_images$$,
  '42501', null, 'B2: anon has no read grant on image evidence');
select throws_ok($$select count(*) from public.rental_grounding$$,
  '42501', null, 'B3: anon has no read grant on grounding evidence');
select throws_ok(
  $$insert into public.rental_freshness_log (listing_id, status)
    values ('c1432000-0000-4000-8000-000000000022', 'active')$$,
  '42501', null, 'B4: anon cannot insert freshness evidence');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · UNRELATED ACTORS — signed-in renter and other broker see nothing
-- ═══════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.rental_freshness_log), 0, 'C1: a signed-in renter reads no freshness evidence');
select is((select count(*)::int from public.rental_listing_images), 0, 'C2: a signed-in renter reads no image evidence');
select is((select count(*)::int from public.rental_grounding), 0, 'C3: a signed-in renter reads no grounding evidence');

select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.rental_freshness_log), 1, 'C4: other broker sees only its own freshness evidence');
select is((select count(*)::int from public.rental_listing_images), 1, 'C5: other broker sees only its own image evidence');
select is((select count(*)::int from public.rental_grounding), 1, 'C6: other broker sees only its own grounding evidence');
select is((select count(*)::int from public.rental_listing_images
            where listing_id = 'c1432000-0000-4000-8000-000000000022'), 0,
  'C7: other broker cannot read the published apartment of another owner');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · OWNING BROKER — sees own private + published evidence only
-- ═══════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.rental_freshness_log), 2, 'D1: owner sees its own freshness evidence (private + published)');
select is((select count(*)::int from public.rental_listing_images), 2, 'D2: owner sees its own image evidence');
select is((select count(*)::int from public.rental_grounding), 2, 'D3: owner sees its own grounding evidence');

select throws_ok(
  $$insert into public.rental_listing_images (listing_id, storage_path, rights_status)
    values ('c1432000-0000-4000-8000-000000000021', 'x.jpg', 'unverified')$$,
  '42501', null, 'D4: owner cannot write evidence directly');
select throws_ok(
  $$update public.rental_freshness_log set status='stale'
     where listing_id = 'c1432000-0000-4000-8000-000000000021'$$,
  '42501', null, 'D5: owner cannot update evidence directly');
select throws_ok(
  $$delete from public.rental_grounding
     where apartment_id = 'c1432000-0000-4000-8000-000000000021'$$,
  '42501', null, 'D6: owner cannot delete evidence directly');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · ADMIN AND SERVICE ROLE
-- ═══════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.rental_freshness_log), 4, 'E1: admin sees all freshness evidence');
select is((select count(*)::int from public.rental_listing_images), 4, 'E2: admin sees all image evidence');
select is((select count(*)::int from public.rental_grounding), 4, 'E3: admin sees all grounding evidence');
reset role;

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.rental_freshness_log), 4, 'E4: service_role sees all freshness evidence');
select is((select count(*)::int from public.rental_listing_images), 4, 'E5: service_role sees all image evidence');
select is((select count(*)::int from public.rental_grounding), 4, 'E6: service_role sees all grounding evidence');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · PROPERTY_VERIFICATIONS — no broad public read (2026-10-14 follow-up)
-- ═══════════════════════════════════════════════════════════════════════════════
select ok(
  (select count(*) = 0 from pg_policies
    where schemaname='public' and tablename='property_verifications'
      and policyname='property_verifications_select_public'),
  'F1: the broad public verification-read policy is gone');
select ok(
  (select count(*) = 1 from pg_policies
    where schemaname='public' and tablename='property_verifications'
      and policyname='property_verifications_select_owner_or_admin'),
  'F2: the owner/admin SELECT policy remains');
select ok(
  not has_table_privilege('anon', 'public.property_verifications', 'SELECT'),
  'F3: anon has no SELECT grant on property_verifications');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select count(*) from public.property_verifications$$,
  '42501', null, 'F4: anon cannot read verification evidence');
select throws_ok(
  $$insert into public.property_verifications (apartment_id, status)
    values ('c1432000-0000-4000-8000-000000000022', 'pending')$$,
  '42501', null, 'F5: anon cannot insert verification evidence');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.property_verifications), 0,
  'F6: an unrelated signed-in renter reads no verification evidence');
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.property_verifications), 1,
  'F7: another broker sees only its own verification row');
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.property_verifications), 2,
  'F8: the owning broker sees its own verification rows');
select set_config('request.jwt.claim.sub', 'c1432000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.property_verifications
            where apartment_id in (select id from public.apartments where slug like 'san1432-%')), 4,
  'F9: an admin sees all fixture verification evidence');
reset role;

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.property_verifications
            where apartment_id in (select id from public.apartments where slug like 'san1432-%')), 4,
  'F10: service_role sees all fixture verification evidence');
reset role;

select * from finish();
rollback;
