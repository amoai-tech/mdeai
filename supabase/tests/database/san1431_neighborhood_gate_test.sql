-- SAN-1431 §4.1 · the launch gate must reject an unverified neighborhood.
--
-- Proves the blocker is fail-closed for placeholders, blanks and ALL whitespace
-- (spaces, tabs, newlines) and that the real publish RPC rejects a fully evidenced
-- listing whose neighborhood is still unverified.
--
-- Run with: supabase test db
begin;

select plan(11);

insert into public.apartments (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
values ('d1431000-0000-4000-8000-000000000001', 'SAN1431 neighborhood', 'san1431-neighborhood',
        'Laureles', 'inactive', 'pending', 'draft', null);

select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  false, 'A1: a real neighborhood does not add the blocker');

update public.apartments set neighborhood = 'Pending verification'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A2: the staging placeholder blocks publication');

update public.apartments set neighborhood = '   '
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A3: a space-only neighborhood blocks publication');

update public.apartments set neighborhood = 'por verificar'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A4: a Spanish placeholder blocks publication');

update public.apartments set neighborhood = 'unknown'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A5: an unknown placeholder blocks publication');

update public.apartments set neighborhood = E'\t'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A6: a tab-only neighborhood blocks publication');

update public.apartments set neighborhood = E'\n'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A7: a newline-only neighborhood blocks publication');

update public.apartments set neighborhood = E' \t \n '
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A8: mixed whitespace blocks publication');

update public.apartments set neighborhood = E'\t Pending verification \n'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A9: a padded placeholder blocks publication');

-- Self-contained fixtures, no dependency on the staging migration's rows.
insert into public.apartments (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
values
  ('d1431000-0000-4000-8000-000000000002', 'SAN1431 placeholder 1', 'san1431-neigh-a',
   'Pending verification', 'inactive', 'pending', 'draft', null),
  ('d1431000-0000-4000-8000-000000000003', 'SAN1431 placeholder 2', 'san1431-neigh-b',
   'unknown', 'inactive', 'pending', 'draft', null),
  ('d1431000-0000-4000-8000-000000000004', 'SAN1431 real', 'san1431-neigh-c',
   'Laureles', 'inactive', 'pending', 'draft', null);

select is((
  select count(*)::int from public.apartments a
   where a.slug like 'san1431-neigh-%'
     and public.rental_listing_launch_blockers(a.id, false) @> array['no verified neighborhood']::text[]
), 2, 'A10: placeholder fixtures are blocked and a real neighborhood is not');

-- A11 · end-to-end: a fully evidenced rental still cannot publish through the RPC
-- while its neighborhood is unverified.
insert into auth.users (id, instance_id, aud, role, email)
values ('d1431000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san1431-neigh-owner@example.com');
insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('d1431000-0000-4000-8000-000000000021', 'd1431000-0000-4000-8000-000000000011',
        'SAN1431 Neigh Owner', 'approved', now());
insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, price_monthly, currency, available_from, latitude, longitude)
values
  ('d1431000-0000-4000-8000-000000000031', 'SAN1431 evidenced placeholder', 'san1431-neigh-evidenced',
   'Pending verification', 'SAN1431 evidenced address', 'inactive', 'pending', 'draft',
   'd1431000-0000-4000-8000-000000000021', 2900000, 'COP', current_date - 1, 6.2447, -75.5916);
insert into public.property_verifications (apartment_id, status, verified_at, metadata)
values ('d1431000-0000-4000-8000-000000000031', 'verified', now(),
        '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted","coordinates":"verified"}'::jsonb);
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('d1431000-0000-4000-8000-000000000031', 'san1431/evidenced.jpg', 'image/jpeg', 'authorized');
insert into public.rental_freshness_log (listing_id, checked_at, status)
values ('d1431000-0000-4000-8000-000000000031', now(), 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1431000-0000-4000-8000-000000000011', true);
select throws_ok(
  $$select public.publish_verified_rental('d1431000-0000-4000-8000-000000000031', 'd1431000-0000-4000-8000-000000000011')$$,
  '23514', null, 'A11: the publish RPC rejects a fully evidenced listing with an unverified neighborhood');
reset role;

select * from finish();
rollback;
