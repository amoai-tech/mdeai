-- SAN-1502 PR2 security — private rental enrichment is not readable by anonymous
-- or ordinary users; an authorized test actor may read a fixture it is entitled to.
-- Run with: supabase test db
begin;

select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1504000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-enrich@example.com'),
  ('f1504000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester-enrich@example.com'),
  ('f1504000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ordinary-enrich@example.com');

insert into public.user_roles (user_id, role)
values ('f1504000-0000-4000-8000-000000000001', 'admin');

insert into public.landlord_profiles (id, user_id, display_name)
values ('f1504000-0000-4000-8000-000000000011', 'f1504000-0000-4000-8000-000000000001', 'Admin Enrich');

-- The admin grants the tester access and provisions a published fixture.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1504000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.admin_grant_rental_test_access('f1504000-0000-4000-8000-000000000002', 'renter');
select set_config('mde.san1502_enrich_fixture',
  (public.admin_create_test_rental('Enrich fixture', 'Laureles', 'Calle 3', 2400000, 'COP',
     (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/e.jpg')).id::text, true);
select public.admin_publish_test_rental(current_setting('mde.san1502_enrich_fixture')::uuid);
reset role;

-- A control publicly eligible listing.
insert into public.apartments (
  id, title, slug, description, neighborhood, city, address,
  status, moderation_status, listing_workflow_status,
  landlord_id, verified, price_monthly, currency, available_from, images, metadata
) values (
  'f1504000-0000-4000-8000-00000000c001', 'Enrich public', 'enrich-public', 'A normal public listing.',
  'Laureles', 'Medellín', 'Calle 4', 'active', 'approved', 'published',
  'f1504000-0000-4000-8000-000000000011', false, 2000000, 'COP', current_date,
  array['https://example.com/p.jpg'], '{}'::jsonb
);

insert into public.listing_embeddings (listing_id, embedding, content_hash) values
  (current_setting('mde.san1502_enrich_fixture')::uuid, array_fill(0.0, array[768])::vector, md5('fixture')),
  ('f1504000-0000-4000-8000-00000000c001'::uuid, array_fill(0.0, array[768])::vector, md5('public'));
insert into public.rental_signals (apartment_id) values
  (current_setting('mde.san1502_enrich_fixture')::uuid),
  ('f1504000-0000-4000-8000-00000000c001'::uuid);

-- A1/A2: anon sees only the public listing's enrichment.
set local role anon;
select is((select count(*)::int from public.listing_embeddings), 1,
  'A1: anon sees only publicly eligible embeddings');
select is((select count(*)::int from public.rental_signals), 1,
  'A2: anon sees only publicly eligible signals');
reset role;

-- A3/A4: DEVELOPMENT (product-owner decision, 20261016200000): an ordinary signed-in user reads the
-- enrichment of every apartment they can read, including the fixture.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1504000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings), 2,
  'A3: in development an ordinary signed-in user sees the embeddings of every readable listing');
select is((select count(*)::int from public.rental_signals), 2,
  'A4: in development an ordinary signed-in user sees the signals of every readable listing');
reset role;

-- A5/A6: the authorized tester sees the fixture and the public listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1504000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings), 2,
  'A5: an authorized tester sees the fixture embedding');
select is((select count(*)::int from public.rental_signals), 2,
  'A6: an authorized tester sees the fixture signals');
reset role;

-- A7/A8: revoking the grant immediately removes the fixture enrichment. In development every signed-in
-- user reads it anyway, so the revoke is proven in the LAUNCH phase, where the private rule applies.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1504000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.admin_revoke_rental_test_access('f1504000-0000-4000-8000-000000000002', 'renter');
reset role;
update public.rental_runtime_settings set phase = 'launch' where singleton;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1504000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings), 1,
  'A7: in launch a revoked tester loses the fixture embedding');
select is((select count(*)::int from public.rental_signals), 1,
  'A8: in launch a revoked tester loses the fixture signals');
reset role;

-- A3L/A4L: LAUNCH — an ordinary signed-in user is back to publicly eligible enrichment only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1504000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings), 1,
  'A3L: in launch an ordinary user sees only publicly eligible embeddings');
select is((select count(*)::int from public.rental_signals), 1,
  'A4L: in launch an ordinary user sees only publicly eligible signals');
reset role;

-- A9: an unknown apartment is never readable.
select is(public.rental_enrichment_is_readable('f1504000-0000-4000-8000-00000000dead'), false,
  'A9: an unknown apartment is not readable');

select * from finish();
rollback;
