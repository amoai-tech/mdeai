-- SAN-1431 Step 6 — gated publish allow/deny proof (canonical contract).
--
-- Proves public.publish_verified_rental(uuid, uuid) reuses
-- public.rental_listing_launch_blockers and refuses missing owner/verified-owner,
-- price, availability, canonical identity, coordinates, verified property,
-- listing-specific owner control / publish permission / viewing permission,
-- authorized photo and current freshness; converts external metadata; requires
-- publisher attribution; allows an owning broker and refuses a non-owner; and that
-- tied freshness is rejected at the database. Hidden drafts stay hidden.
--
-- Run with: supabase test db
begin;

select plan(33);

-- ── Catalog ──────────────────────────────────────────────────────────────────
select has_function('public', 'publish_verified_rental', array['uuid', 'uuid'],
  'F1: gated publish function exists');
select has_function('public', 'rental_listing_launch_blockers', array['uuid', 'boolean'],
  'F2: canonical launch-readiness predicate exists');
select ok(
  not has_function_privilege('anon', 'public.publish_verified_rental(uuid,uuid)', 'EXECUTE'),
  'F3: anon cannot execute the publish function');

-- ── Fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
values
  ('d1431000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-owner@example.com'),
  ('d1431000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-stranger@example.com'),
  ('d1431000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-pending@example.com');

insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values
  ('d1431000-0000-4000-8000-000000000011', 'd1431000-0000-4000-8000-000000000001',
   'SAN1431 verified owner', 'approved', now()),
  ('d1431000-0000-4000-8000-000000000012', 'd1431000-0000-4000-8000-000000000003',
   'SAN1431 pending owner', 'pending', null);

insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, available_to,
   latitude, longitude, metadata)
values
  ('e1431000-0000-4000-8000-000000000001', 'SAN1431 A', 'san1431-a', 'Laureles', 'SAN1431 A address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916,
   '{"inventory_kind":"external_candidate","inventory_type":"external","allowed_action":"view_original_listing"}'::jsonb),
  ('e1431000-0000-4000-8000-000000000002', 'SAN1431 B', 'san1431-b', 'Laureles', 'SAN1431 B address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000003', 'SAN1431 C', 'san1431-c', 'Laureles', 'SAN1431 C address',
   'inactive', 'pending', 'draft', null, false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000004', 'SAN1431 D', 'san1431-d', 'Laureles', 'SAN1431 D address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, null, null, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000005', 'SAN1431 E', 'san1431-e', 'Laureles', 'SAN1431 E address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000006', 'SAN1431 F', 'san1431-f', 'Laureles', 'SAN1431 F address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000007', 'SAN1431 G', 'san1431-g', 'Laureles', 'SAN1431 G address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000008', 'SAN1431 H', 'san1431-h', 'Laureles', 'SAN1431 H address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000009', 'SAN1431 I', 'san1431-i', 'Laureles', 'SAN1431 I address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000012', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-00000000000a', 'SAN1431 J', 'san1431-j', 'Laureles', 'SAN1431 J address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, null, null,
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-00000000000b', 'SAN1431 K', 'san1431-k', 'Laureles', null,
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-00000000000c', 'SAN1431 M', 'san1431-m', 'Laureles', 'SAN1431 M address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   null, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-00000000000d', 'SAN1431 N', 'san1431-n', 'Laureles', 'SAN1431 N address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-00000000000e', 'SAN1431 O', 'san1431-o', 'Laureles', 'SAN1431 O address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-00000000000f', 'SAN1431 P', 'san1431-p', 'Laureles', 'SAN1431 P address',
   'inactive', 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb),
  ('e1431000-0000-4000-8000-000000000010', 'SAN1431 Q', 'san1431-q', 'Laureles', 'SAN1431 Q address',
   null, 'pending', 'draft', 'd1431000-0000-4000-8000-000000000011', false, 2900000, 'COP',
   current_date - 1, null, 6.2447, -75.5916, '{}'::jsonb);

-- Granted control/publish/viewing permission for every verified fixture except the
-- three listing-specific permission negatives (N/O/P). E stays pending.
insert into public.property_verifications (apartment_id, status, verified_at, metadata)
select a.id, 'verified', now(),
       case a.slug
         when 'san1431-n' then '{"owner_control":"unverified","publish_permission":"granted","viewings_permission":"granted"}'::jsonb
         when 'san1431-o' then '{"owner_control":"verified","publish_permission":"unverified","viewings_permission":"granted"}'::jsonb
         when 'san1431-p' then '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"unverified"}'::jsonb
         else '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted"}'::jsonb
       end
  from public.apartments a
 where a.slug like 'san1431-%'
   and a.slug <> 'san1431-e';
insert into public.property_verifications (apartment_id, status)
values ('e1431000-0000-4000-8000-000000000005', 'pending');

insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
select id, 'san1431/' || slug || '.jpg', 'image/jpeg', 'authorized' from public.apartments
 where slug in ('san1431-a','san1431-b','san1431-c','san1431-d','san1431-e','san1431-g',
                'san1431-h','san1431-i','san1431-j','san1431-k','san1431-m',
                'san1431-n','san1431-o','san1431-p','san1431-q');
-- Q: NULL status (from the insert) and an explicit NULL freshness_status, with no log.
update public.apartments set freshness_status = null, last_checked_at = null where slug = 'san1431-q';
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('e1431000-0000-4000-8000-000000000006', 'san1431/f.jpg', 'image/jpeg', 'unverified');

insert into public.rental_freshness_log (listing_id, checked_at, status)
select id, now(), 'active' from public.apartments
 where slug in ('san1431-a','san1431-b','san1431-c','san1431-d','san1431-e','san1431-f',
                'san1431-h','san1431-i','san1431-j','san1431-k','san1431-m',
                'san1431-n','san1431-o','san1431-p');
insert into public.rental_freshness_log (listing_id, checked_at, status)
values ('e1431000-0000-4000-8000-000000000007', now(), 'stale');

-- ── Positive + metadata conversion + attribution ─────────────────────────────
select lives_ok(
  $$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000001',
      'd1431000-0000-4000-8000-000000000001')$$,
  'A1: a fully evidenced listing publishes with an explicit actor');
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
select is((select published_by from public.apartments where id = 'e1431000-0000-4000-8000-000000000001'),
  'd1431000-0000-4000-8000-000000000001'::uuid, 'A10: attribution records the supplied actor');

-- ── Attribution is mandatory for trusted connections ─────────────────────────
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000002')$$,
  '42501', null::text, 'B1: a trusted connection must supply publisher attribution');

-- ── Negatives — each canonical blocker ───────────────────────────────────────
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000003', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N1: unowned listing is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000004', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N2: missing coordinates is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000005', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N3: missing verified property is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000006', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N4: missing authorized photo is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000007', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N5: stale freshness is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000009', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N6: an unverified landlord profile is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-00000000000a', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N7: a missing price/currency is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-00000000000b', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N8: a missing canonical property identity is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-00000000000c', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N9: a missing current availability window is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-00000000000d', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N10: a missing listing-specific owner control is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-00000000000e', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N11: a missing publish permission is refused');
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-00000000000f', 'd1431000-0000-4000-8000-000000000001')$$,
  '23514', null::text, 'N12: a missing viewing permission is refused');

-- ── Tied freshness evidence is impossible at the database ────────────────────
select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.rental_freshness_log'::regclass
             and conname = 'rental_freshness_log_listing_checked_key'
             and contype = 'u'),
  'T0: the (listing_id, checked_at) uniqueness constraint exists');
select throws_ok(
  $$insert into public.rental_freshness_log (listing_id, checked_at, status)
    values ('e1431000-0000-4000-8000-000000000001', now(), 'stale')$$,
  '23505', null::text, 'T1: a tied (listing, checked_at) freshness row is rejected');

-- ── Null-safe state and freshness (fail closed) ──────────────────────────────
select ok(
  (select public.rental_listing_launch_blockers('e1431000-0000-4000-8000-000000000010', true)
     @> array['not active']::text[]),
  'Z3: a NULL status is treated as not active');
select ok(
  (select public.rental_listing_launch_blockers('e1431000-0000-4000-8000-000000000010', true)
     @> array['no current active freshness']::text[]),
  'Z4: a NULL freshness_status fails closed');

-- ── Authorization ────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1431000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000008')$$,
  'P0002', null::text, 'Z0: a non-owner cannot publish a hidden draft (RLS keeps it indistinguishable from missing)');
select set_config('request.jwt.claim.sub', 'd1431000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000008')$$,
  'Z1: the owning broker can publish its verified listing');
select set_config('request.jwt.claim.sub', 'd1431000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000008')$$,
  '42501', null::text, 'Z2: a non-owner cannot publish a listing they can see');
reset role;

select * from finish();
rollback;
