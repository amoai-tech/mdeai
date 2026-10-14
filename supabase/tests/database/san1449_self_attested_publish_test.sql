-- SAN-1449 · Publish First, Verify Later — a landlord can publish a genuine
-- self-attested apartment and receive viewings without admin approval.
-- Run with: supabase test db
begin;

select plan(15);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f1449000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1449-owner@example.com'),
  ('f1449000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1449-outsider@example.com');

-- verification_status is 'pending' on purpose: self-attested publication must not
-- require an independently approved landlord profile.
insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('f1449000-0000-4000-8000-000000000011', 'f1449000-0000-4000-8000-000000000001', 'SAN1449 Owner', 'pending', null);

insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, available_to, latitude, longitude, metadata)
values
  ('f1449000-0000-4000-8000-000000000021', 'SAN1449 genuine', 'san1449-genuine', 'Laureles', 'Calle 1 #2-3',
   'inactive', 'pending', 'draft', 'f1449000-0000-4000-8000-000000000011', false, 2500000, 'COP',
   (now() at time zone 'America/Bogota')::date + 10, null, 6.2447, -75.5916, '{}'::jsonb),
  ('f1449000-0000-4000-8000-000000000022', 'SAN1449 fixture', 'san1449-fixture', 'Laureles', 'Calle 1 #2-4',
   'inactive', 'pending', 'draft', 'f1449000-0000-4000-8000-000000000011', false, 2500000, 'COP',
   (now() at time zone 'America/Bogota')::date + 10, null, 6.2447, -75.5916, '{"is_test_fixture":"true"}'::jsonb),
  ('f1449000-0000-4000-8000-000000000023', 'SAN1449 external', 'san1449-external', 'Laureles', 'Calle 1 #2-5',
   'inactive', 'pending', 'draft', 'f1449000-0000-4000-8000-000000000011', false, 2500000, 'COP',
   (now() at time zone 'America/Bogota')::date + 10, null, 6.2447, -75.5916,
   '{"inventory_kind":"external_candidate","allowed_action":"view_original_listing"}'::jsonb),
  ('f1449000-0000-4000-8000-000000000024', 'SAN1449 no price', 'san1449-noprice', 'Laureles', 'Calle 1 #2-6',
   'inactive', 'pending', 'draft', 'f1449000-0000-4000-8000-000000000011', false, null, 'COP',
   (now() at time zone 'America/Bogota')::date + 10, null, 6.2447, -75.5916, '{}'::jsonb);

insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values
  ('f1449000-0000-4000-8000-000000000021','san1449/genuine.jpg','image/jpeg','unverified'),
  ('f1449000-0000-4000-8000-000000000022','san1449/fixture.jpg','image/jpeg','unverified'),
  ('f1449000-0000-4000-8000-000000000023','san1449/external.jpg','image/jpeg','unverified'),
  ('f1449000-0000-4000-8000-000000000024','san1449/noprice.jpg','image/jpeg','unverified');

-- A1: owner publishes with both attestations while the landlord profile is only pending.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1449000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.publish_self_attested_rental('f1449000-0000-4000-8000-000000000021', true, true)$q$,
  'A1: an owning landlord publishes self-attested without admin approval');
reset role;

select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
     from public.apartments where id = 'f1449000-0000-4000-8000-000000000021'),
  'active/approved/published/false',
  'A2: published active/approved/published but NOT independently verified');
select is(
  (select metadata->>'provenance' from public.apartments where id = 'f1449000-0000-4000-8000-000000000021'),
  'self_attested', 'A3: provenance is self_attested');
select is(
  (select metadata->>'allowed_action' from public.apartments where id = 'f1449000-0000-4000-8000-000000000021'),
  'schedule_viewing', 'A4: viewing action is enabled');
select is(
  public.rental_listing_is_public(
    'active','approved','published','f1449000-0000-4000-8000-000000000011',
    (select metadata from public.apartments where id = 'f1449000-0000-4000-8000-000000000021')),
  true, 'A5: the self-attested listing is publicly visible');

-- A6/A7: a renter can request a viewing; exactly one lead exists.
set local role service_role;
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
       'f1449000-0000-4000-8000-000000000021', null::uuid, 'san1449-viewing-key', 'form',
       'san1449-renter@example.com', 'SAN1449 Renter', null, null::uuid,
       (now() + interval '2 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
  'A6: a viewing can be requested for the self-attested listing');
reset role;
select is(
  (select count(*)::int from public.leads where idempotency_key = 'san1449-viewing-key'),
  1, 'A7: exactly one lead was created');

-- A8/A9: retry does not duplicate.
set local role service_role;
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
       'f1449000-0000-4000-8000-000000000021', null::uuid, 'san1449-viewing-key', 'form',
       'san1449-renter@example.com', 'SAN1449 Renter', null, null::uuid,
       (now() + interval '2 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
  'A8: retrying the same viewing succeeds');
reset role;
select is(
  (select count(*)::int from public.leads where idempotency_key = 'san1449-viewing-key')
  + (select count(*)::int from public.showings s join public.leads l on l.id = s.lead_id
       where l.idempotency_key = 'san1449-viewing-key'),
  2, 'A9: retry never duplicates the lead or the showing');

-- A10: an unrelated authenticated user cannot publish.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1449000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.publish_self_attested_rental('f1449000-0000-4000-8000-000000000024', true, true)$q$,
  '42501', 'not authorized to publish this listing',
  'A10: an unrelated user cannot publish someone else''s listing');
reset role;

-- A11: both attestations are required.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1449000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.publish_self_attested_rental('f1449000-0000-4000-8000-000000000024', true, false)$q$,
  '23514', null,
  'A11: publication without both attestations is refused');
reset role;

-- A12: a fixture is never publishable through this path.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1449000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.publish_self_attested_rental('f1449000-0000-4000-8000-000000000022', true, true)$q$,
  '23514', null,
  'A12: a synthetic fixture is refused');
reset role;

-- A13: an external candidate keeps original-link-only behaviour.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1449000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.publish_self_attested_rental('f1449000-0000-4000-8000-000000000023', true, true)$q$,
  '23514', null,
  'A13: an external candidate cannot be published through this path');
reset role;

-- A14: a listing without a real price is refused.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1449000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.publish_self_attested_rental('f1449000-0000-4000-8000-000000000024', true, true)$q$,
  '23514', null,
  'A14: a listing with no price is refused');
reset role;

-- A15: the refused rows stay unpublished.
select is(
  (select count(*)::int from public.apartments
    where id in ('f1449000-0000-4000-8000-000000000022','f1449000-0000-4000-8000-000000000023','f1449000-0000-4000-8000-000000000024')
      and listing_workflow_status = 'published'),
  0, 'A15: refused rows stay unpublished');

select * from finish();
rollback;
