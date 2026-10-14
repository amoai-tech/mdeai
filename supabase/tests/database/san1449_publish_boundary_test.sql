-- SAN-1449 · the self-attested publish path must not be bypassable.
-- Run with: supabase test db
begin;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email)
values ('f1450000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1449b-owner@example.com');
insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('f1450000-0000-4000-8000-000000000011', 'f1450000-0000-4000-8000-000000000001', 'SAN1449B Owner', 'pending', null);

-- A1: a direct INSERT that tries to start published/verified is clamped.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1450000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, available_to, latitude, longitude, metadata)
values ('f1450000-0000-4000-8000-000000000021', 'Bypass', 'san1449b-bypass', 'Laureles', 'Calle 9 #1-1',
   'active', 'approved', 'published', 'f1450000-0000-4000-8000-000000000011', true, 2500000, 'COP',
   (now() at time zone 'America/Bogota')::date + 10, null, 6.2447, -75.5916, '{"custom_key":"kept"}'::jsonb);
reset role;
select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
     from public.apartments where id = 'f1450000-0000-4000-8000-000000000021'),
  'inactive/pending/draft/false',
  'A1: a direct client INSERT cannot create a published or verified listing');
-- A7: the clamp only touches workflow/trust columns; operator metadata is preserved.
select is(
  (select metadata->>'custom_key' from public.apartments where id = 'f1450000-0000-4000-8000-000000000021'),
  'kept',
  'A7: custom metadata survives a direct INSERT (the RPC overwrites provenance on publish)');

-- Trusted rows for the provenance checks.
insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, latitude, longitude, metadata)
values
  ('f1450000-0000-4000-8000-000000000022', 'External', 'san1449b-external', 'Laureles', 'Calle 9 #1-2',
   'inactive','pending','draft','f1450000-0000-4000-8000-000000000011', false, 2500000,'COP',
   (now() at time zone 'America/Bogota')::date + 10, 6.2447, -75.5916,
   '{"inventory_kind":"external_candidate","allowed_action":"view_original_listing"}'::jsonb),
  ('f1450000-0000-4000-8000-000000000023', 'Fixture', 'san1449b-fixture', 'Laureles', 'Calle 9 #1-3',
   'inactive','pending','draft','f1450000-0000-4000-8000-000000000011', false, 2500000,'COP',
   (now() at time zone 'America/Bogota')::date + 10, 6.2447, -75.5916,
   '{"is_test_fixture":"true"}'::jsonb);

-- A2: an external candidate cannot be reclassified by its authenticated owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1450000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$update public.apartments
       set metadata = '{"inventory_kind":"self_attested"}'::jsonb
     where id = 'f1450000-0000-4000-8000-000000000022'$q$,
  '42501', 'listing provenance is database-controlled',
  'A2: an external candidate cannot be reclassified by its owner');
reset role;

-- A3: a fixture cannot be unclassified either.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1450000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$update public.apartments set metadata = '{}'::jsonb where id = 'f1450000-0000-4000-8000-000000000023'$q$,
  '42501', 'listing provenance is database-controlled',
  'A3: a test fixture cannot be unclassified by its owner');
reset role;

-- A4: a gallery row alone is not enough — the cards read apartments.images.
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('f1450000-0000-4000-8000-000000000021', 'san1449b/gallery.jpg', 'image/jpeg', 'unverified');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1450000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.publish_self_attested_rental('f1450000-0000-4000-8000-000000000021', true, true)$q$,
  '23514', null,
  'A4: a listing without a displayable apartments.images photo is refused');
reset role;

-- A5/A6: with a display image it publishes and is explicitly not verified.
update public.apartments set images = array['https://example.com/san1449b.jpg']
 where id = 'f1450000-0000-4000-8000-000000000021';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1450000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.publish_self_attested_rental('f1450000-0000-4000-8000-000000000021', true, true)$q$,
  'A5: the listing publishes once it has a display image');
reset role;
select is(
  (select verified::text from public.apartments where id = 'f1450000-0000-4000-8000-000000000021'),
  'false', 'A6: self-attested publication leaves the listing not independently verified');

select * from finish();
rollback;
