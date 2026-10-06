-- SAN-1431 Step 6 — gated publish allow/deny proof.
--
-- Proves public.publish_verified_rental(uuid):
--   * refuses without owner / coordinates / verified property / authorized photo / current freshness;
--   * converts external-lead metadata to MDE-controlled so the canonical public predicate accepts it;
--   * allows an owning broker and refuses a non-owner;
--   * is not executable by anon.
--
-- Run with: supabase test db
begin;

select plan(18);

-- ── Catalog ──────────────────────────────────────────────────────────────────
select has_function('public', 'publish_verified_rental', array['uuid'],
  'F1: gated publish function exists');
select ok(
  not has_function_privilege('anon', 'public.publish_verified_rental(uuid)', 'EXECUTE'),
  'F2: anon cannot execute the publish function');

-- ── Fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
values
  ('d1431000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-owner@example.com'),
  ('d1431000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-stranger@example.com');

insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('d1431000-0000-4000-8000-000000000011',
        'd1431000-0000-4000-8000-000000000001', 'SAN1431 owner', 'approved', now());

insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, latitude, longitude, metadata)
values
  ('e1431000-0000-4000-8000-000000000001', 'SAN1431 A', 'san1431-a', 'Laureles',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', 6.2447, -75.5916,
   '{"inventory_kind":"external_candidate","inventory_type":"external","allowed_action":"view_original_listing"}'::jsonb),
  ('e1431000-0000-4000-8000-000000000003', 'SAN1431 C', 'san1431-c', 'Laureles',
   'inactive', 'pending', 'draft', null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000004', 'SAN1431 D', 'san1431-d', 'Laureles',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', null, null, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000005', 'SAN1431 E', 'san1431-e', 'Laureles',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000006', 'SAN1431 F', 'san1431-f', 'Laureles',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000007', 'SAN1431 G', 'san1431-g', 'Laureles',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000008', 'SAN1431 H', 'san1431-h', 'Laureles',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', 6.2447, -75.5916, '{}'::jsonb);

insert into public.property_verifications (apartment_id, status, verified_at)
values
  ('e1431000-0000-4000-8000-000000000001', 'verified', now()),
  ('e1431000-0000-4000-8000-000000000003', 'verified', now()),
  ('e1431000-0000-4000-8000-000000000004', 'verified', now()),
  ('e1431000-0000-4000-8000-000000000006', 'verified', now()),
  ('e1431000-0000-4000-8000-000000000007', 'verified', now()),
  ('e1431000-0000-4000-8000-000000000008', 'verified', now()),
  ('e1431000-0000-4000-8000-000000000005', 'pending', null);

insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values
  ('e1431000-0000-4000-8000-000000000001', 'san1431/a.jpg', 'image/jpeg', 'authorized'),
  ('e1431000-0000-4000-8000-000000000003', 'san1431/c.jpg', 'image/jpeg', 'authorized'),
  ('e1431000-0000-4000-8000-000000000004', 'san1431/d.jpg', 'image/jpeg', 'authorized'),
  ('e1431000-0000-4000-8000-000000000005', 'san1431/e.jpg', 'image/jpeg', 'authorized'),
  ('e1431000-0000-4000-8000-000000000007', 'san1431/g.jpg', 'image/jpeg', 'authorized'),
  ('e1431000-0000-4000-8000-000000000008', 'san1431/h.jpg', 'image/jpeg', 'authorized'),
  ('e1431000-0000-4000-8000-000000000006', 'san1431/f.jpg', 'image/jpeg', 'unverified');

insert into public.rental_freshness_log (listing_id, checked_at, status)
values
  ('e1431000-0000-4000-8000-000000000001', now(), 'active'),
  ('e1431000-0000-4000-8000-000000000003', now(), 'active'),
  ('e1431000-0000-4000-8000-000000000004', now(), 'active'),
  ('e1431000-0000-4000-8000-000000000005', now(), 'active'),
  ('e1431000-0000-4000-8000-000000000006', now(), 'active'),
  ('e1431000-0000-4000-8000-000000000008', now(), 'active'),
  ('e1431000-0000-4000-8000-000000000007', now(), 'stale');

-- ── Positive + metadata conversion ──────────────────────────────────────────
select lives_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000001')$$,
  'A1: a fully evidenced listing publishes');
select is((select status from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'active', 'A2: status becomes active');
select is((select listing_workflow_status from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'published', 'A3: workflow becomes published');
select is((select verified from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  true, 'A4: listing marked verified');
select is((select moderation_status from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'approved', 'A5: moderation approved');
select is((select metadata->>'inventory_kind' from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'mde_controlled', 'A6: external inventory_kind cleared');
select is((select metadata->>'inventory_type' from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'mde_controlled', 'A7: external inventory_type converted');
select is((select metadata->>'allowed_action' from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'schedule_viewing', 'A8: action converted to schedule_viewing');
select ok(
  (select public.rental_listing_is_public(status, moderation_status, listing_workflow_status, landlord_id, metadata)
     from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'A9: the published listing is publicly eligible');

-- ── Negatives ────────────────────────────────────────────────────────────────
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000003')$$,
  '23514', null::text, 'N1: missing owner/agent is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000004')$$,
  '23514', null::text, 'N2: missing coordinates is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000005')$$,
  '23514', null::text, 'N3: missing verified property is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000006')$$,
  '23514', null::text, 'N4: missing authorized photo is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000007')$$,
  '23514', null::text, 'N5: stale freshness is refused');

-- ── Authorization ────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1431000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000008')$$,
  'Z1: the owning broker can publish its verified listing');
select set_config('request.jwt.claim.sub', 'd1431000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000008')$$,
  '42501', null::text, 'Z2: a non-owner cannot publish');
reset role;

select * from finish();
rollback;
