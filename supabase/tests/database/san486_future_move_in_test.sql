-- SAN-486 · a verified future move-in date publishes, and can still be viewed.
--
-- Positive: a fully evidenced apartment whose available_from is in the future passes
-- the launch gate and can be toured before move-in.
-- Negative: an expired or missing availability window still fails closed.
--
-- Run with: supabase test db
begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email)
values ('f4860000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san486-owner@example.com');
insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('f4860000-0000-4000-8000-000000000011', 'f4860000-0000-4000-8000-000000000001',
        'SAN486 Owner', 'approved', now());

-- Future move-in, fully evidenced.
insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, available_to, latitude, longitude)
values
  ('f4860000-0000-4000-8000-000000000021', 'SAN486 future', 'san486-future', 'Laureles',
   'SAN486 future address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', '2099-11-01', null, 6.2447, -75.5916),
  ('f4860000-0000-4000-8000-000000000022', 'SAN486 expired', 'san486-expired', 'Laureles',
   'SAN486 expired address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', '2000-01-01', '2000-01-31', 6.2447, -75.5916),
  ('f4860000-0000-4000-8000-000000000023', 'SAN486 missing', 'san486-missing', 'Laureles',
   'SAN486 missing address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', null, null, 6.2447, -75.5916);

insert into public.property_verifications (apartment_id, status, verified_at, metadata)
select id, 'verified', now(),
       '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted","coordinates":"verified"}'::jsonb
  from public.apartments where id = 'f4860000-0000-4000-8000-000000000021';
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('f4860000-0000-4000-8000-000000000021', 'san486/future.jpg', 'image/jpeg', 'authorized');
insert into public.rental_freshness_log (listing_id, checked_at, status)
values ('f4860000-0000-4000-8000-000000000021', now(), 'active');

-- Publish by an intentional state change (the material-edit guard skips transitions).
update public.apartments
   set status = 'active', moderation_status = 'approved', listing_workflow_status = 'published', verified = true
 where id = 'f4860000-0000-4000-8000-000000000021';

-- A1 · a fully evidenced future move-in has no blockers at all.
select is(
  public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000021', false),
  array[]::text[], 'A1: a verified future move-in passes the launch gate');

-- A2 · an expired window still fails closed.
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000022', false) @> array['no current availability evidence']::text[],
  true, 'A2: an expired availability window still blocks');

-- A3 · a missing window still fails closed.
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000023', false) @> array['no current availability evidence']::text[],
  true, 'A3: a missing availability window still blocks');

-- A4 · the viewing RPC no longer couples a viewing to the move-in date.
select is(
  position('available_from <= (p_scheduled_at' in
    pg_get_functiondef('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'::regprocedure)) > 0,
  false, 'A4: the viewing RPC does not require available_from <= viewing date');

-- A5 · an October viewing of a November move-in succeeds.
set local role service_role;
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san486-future', null::uuid, 'san486-viewing-key-1', 'form',
    'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    '2099-10-20 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'A5: a viewing before the move-in date is accepted');
reset role;

-- A6 · it persisted exactly one lead.
select is((select count(*)::int from public.leads where idempotency_key = 'san486-viewing-key-1'), 1,
  'A6: the early viewing created exactly one lead');

select * from finish();
rollback;
