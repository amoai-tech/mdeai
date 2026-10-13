-- SAN-486 · a verified future move-in date publishes, and can still be viewed.
--
-- Positive: a fully evidenced apartment whose available_from is in the future passes
-- the launch gate and can be toured before move-in, by UUID and by slug.
-- Negative: an expired, missing or reversed window still fails closed, and the viewing
-- RPC refuses a listing with no usable window.
--
-- Dates are relative so the test cannot silently rot once the clock passes a hardcoded
-- appointment. Run with: supabase test db
begin;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email)
values ('f4860000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san486-owner@example.com');
insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('f4860000-0000-4000-8000-000000000011', 'f4860000-0000-4000-8000-000000000001',
        'SAN486 Owner', 'approved', now());

insert into public.apartments
  (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, available_to, latitude, longitude)
values
  -- Future move-in, fully evidenced; created draft so the image guard does not demote it.
  ('f4860000-0000-4000-8000-000000000021', 'SAN486 future', 'san486-future', 'Laureles',
   'SAN486 future address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', current_date + 30, null, 6.2447, -75.5916),
  -- Expired window.
  ('f4860000-0000-4000-8000-000000000022', 'SAN486 expired', 'san486-expired', 'Laureles',
   'SAN486 expired address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', current_date - 60, current_date - 1, 6.2447, -75.5916),
  -- Missing window.
  ('f4860000-0000-4000-8000-000000000023', 'SAN486 missing', 'san486-missing', 'Laureles',
   'SAN486 missing address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', null, null, 6.2447, -75.5916),
  -- Reversed window: ends before it starts.
  ('f4860000-0000-4000-8000-000000000024', 'SAN486 reversed', 'san486-reversed', 'Laureles',
   'SAN486 reversed address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', current_date + 30, current_date + 10, 6.2447, -75.5916),
  -- Published but no move-in date: the viewing RPC must refuse it.
  ('f4860000-0000-4000-8000-000000000025', 'SAN486 no-from', 'san486-no-from', 'Laureles',
   'SAN486 no-from address', 'active', 'approved', 'published',
   'f4860000-0000-4000-8000-000000000011', true, 2900000, 'COP', null, null, 6.2447, -75.5916),
  -- Published but reversed: the viewing RPC must refuse it.
  ('f4860000-0000-4000-8000-000000000026', 'SAN486 reversed-pub', 'san486-reversed-pub', 'Laureles',
   'SAN486 reversed-pub address', 'active', 'approved', 'published',
   'f4860000-0000-4000-8000-000000000011', true, 2900000, 'COP', current_date + 30, current_date + 10, 6.2447, -75.5916);

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

-- A4 · a reversed window (ends before it starts) fails closed.
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000024', false) @> array['no current availability evidence']::text[],
  true, 'A4: a reversed availability window still blocks');

-- A5 · an October viewing of a November move-in succeeds when resolved by UUID.
set local role service_role;
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'f4860000-0000-4000-8000-000000000021'::text, null::uuid, 'san486-viewing-key-uuid', 'form',
    'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '1 day')::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'A5: a viewing before the move-in date is accepted by UUID');

-- A6 · the same viewing, resolved by slug.
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san486-future', null::uuid, 'san486-viewing-key-slug', 'form',
    'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '2 day')::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'A6: a viewing before the move-in date is accepted by slug');
reset role;

-- A7 · the early viewing persisted exactly one lead and one showing.
select is(
  (select count(*)::int from public.showings s join public.leads l on l.id = s.lead_id
    where l.idempotency_key = 'san486-viewing-key-uuid'
      and s.apartment_id = 'f4860000-0000-4000-8000-000000000021'),
  1, 'A7: the early viewing created exactly one showing');

-- A8 · the viewing contract mirrors publication: a listing with no move-in date is refused.
set local role service_role;
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san486-no-from', null::uuid, 'san486-viewing-key-nofrom', 'form',
    'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '1 day')::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
  'A8: a listing with no available_from cannot be requested');

-- A9 · the RPC refuses a published listing with a reversed window.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san486-reversed-pub', null::uuid, 'san486-viewing-key-reversed', 'form',
    'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '1 day')::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
  'A9: a listing with a reversed window cannot be requested');
reset role;

-- A10 · a replay under the same idempotency key succeeds and never duplicates.
set local role service_role;
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'f4860000-0000-4000-8000-000000000021'::text, null::uuid, 'san486-viewing-key-uuid', 'form',
    'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '1 day')::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'A10: a replay of the same viewing key succeeds');
reset role;

-- A11 · the replay left exactly one lead and one showing.
select is(
  (select count(*)::int from public.leads where idempotency_key = 'san486-viewing-key-uuid')
  + (select count(*)::int from public.showings s join public.leads l on l.id = s.lead_id
       where l.idempotency_key = 'san486-viewing-key-uuid'),
  2, 'A11: retry never duplicates the lead or the showing');

-- A12 · the lookup locks the apartment row so a withdrawal cannot interleave.
select is(
  position('FOR UPDATE' in
    pg_get_functiondef('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'::regprocedure)) > 0,
  true, 'A12: the viewing RPC locks the apartment row');

select * from finish();
rollback;
