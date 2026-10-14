-- SAN-486 · a verified future move-in date publishes, and can still be viewed.
--
-- Positive: a fully evidenced apartment whose available_from is in the future passes
-- the launch gate and can be toured before move-in, by UUID and by slug.
-- Negative: an expired, missing or reversed window still fails closed, and the viewing
-- RPC refuses a listing with no usable window.
--
-- A future move-in date is only accepted with a reviewed receipt that names THAT date
-- (B), moving the date sends a live listing back to review and a receipt for the old date
-- cannot republish it (C), publishing without the receipt really fails (H), and revoked,
-- withdrawn or unauthorized paths are denied (G).
--
-- Dates are relative so the test cannot silently rot once the clock passes a hardcoded
-- appointment. Run with: supabase test db
begin;

select plan(30);

-- The table's own CHECK constraint (apartments_availability_window_check, SAN-486) now refuses a
-- reversed window outright. The launch gate and the viewing RPC must still fail closed on one as
-- defence in depth, so lift the constraint for THIS transaction (rolled back below) to prove they do.
alter table public.apartments drop constraint if exists apartments_availability_window_check;

insert into auth.users (id, instance_id, aud, role, email)
values ('f4860000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san486-owner@example.com');
-- A reviewer (not the owner) and an outsider (neither owner nor reviewer).
insert into auth.users (id, instance_id, aud, role, email)
values ('f4860000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san486-reviewer@example.com'),
       ('f4860000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san486-outsider@example.com');
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
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', (now() at time zone 'America/Bogota')::date + 30, null, 6.2447, -75.5916),
  -- Expired window.
  ('f4860000-0000-4000-8000-000000000022', 'SAN486 expired', 'san486-expired', 'Laureles',
   'SAN486 expired address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', (now() at time zone 'America/Bogota')::date - 60, (now() at time zone 'America/Bogota')::date - 1, 6.2447, -75.5916),
  -- Missing window.
  ('f4860000-0000-4000-8000-000000000023', 'SAN486 missing', 'san486-missing', 'Laureles',
   'SAN486 missing address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', null, null, 6.2447, -75.5916),
  -- Reversed window: ends before it starts.
  ('f4860000-0000-4000-8000-000000000024', 'SAN486 reversed', 'san486-reversed', 'Laureles',
   'SAN486 reversed address', 'inactive', 'pending', 'draft',
   'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', (now() at time zone 'America/Bogota')::date + 30, (now() at time zone 'America/Bogota')::date + 10, 6.2447, -75.5916),
  -- Published but no move-in date: the viewing RPC must refuse it.
  ('f4860000-0000-4000-8000-000000000025', 'SAN486 no-from', 'san486-no-from', 'Laureles',
   'SAN486 no-from address', 'active', 'approved', 'published',
   'f4860000-0000-4000-8000-000000000011', true, 2900000, 'COP', null, null, 6.2447, -75.5916),
  -- Published but reversed: the viewing RPC must refuse it.
  ('f4860000-0000-4000-8000-000000000026', 'SAN486 reversed-pub', 'san486-reversed-pub', 'Laureles',
   'SAN486 reversed-pub address', 'active', 'approved', 'published',
   'f4860000-0000-4000-8000-000000000011', true, 2900000, 'COP', (now() at time zone 'America/Bogota')::date + 30, (now() at time zone 'America/Bogota')::date + 10, 6.2447, -75.5916);

-- The reviewed receipt: names THIS apartment's exact move-in date, a non-owner reviewer
-- and the evidence reviewed.
insert into public.property_verifications (apartment_id, status, verified_at, verified_by, metadata)
select id, 'verified', now(), 'f4860000-0000-4000-8000-000000000002',
       '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted","coordinates":"verified"}'::jsonb
       || jsonb_build_object('move_in_verified_for', to_char(available_from, 'YYYY-MM-DD'),
                             'move_in_evidence', 'signed lease start + reviewer site visit')
  from public.apartments where id = 'f4860000-0000-4000-8000-000000000021';
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('f4860000-0000-4000-8000-000000000021', 'san486/future.jpg', 'image/jpeg', 'authorized');
insert into public.rental_freshness_log (listing_id, checked_at, status)
values ('f4860000-0000-4000-8000-000000000021', now(), 'active');

-- Variants. Every one carries all other evidence (owner, permissions, coordinates, photo,
-- freshness); only the move-in receipt differs, so a blocker proves THAT rule.
do $fx$
declare
  r record;
  v_id uuid;
  v_from date;
  v_meta jsonb;
  v_by uuid;
  v_base jsonb := '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted","coordinates":"verified"}';
begin
  for r in select * from (values
    ('27', 30, 'none'),          -- B1 future date, no receipt
    ('28', 30, 'other_date'),    -- B2 receipt is for a different date
    ('29', 30, 'no_reviewer'),   -- B3 receipt has no reviewer identity
    ('30', 30, 'owner_reviewer'),-- B4 the owner "reviewed" their own listing
    ('31', 30, 'no_evidence'),   -- B5 receipt names no evidence
    ('32', -5, 'none'),          -- B6 already available: no receipt needed
    ('33', 30, 'good'),          -- C  date moves after publication
    ('34', 30, 'good'),          -- H  publish succeeds with the receipt
    ('35', 30, 'good'),          -- G  an outsider tries to publish
    ('36', 30, 'good')           -- G  permission revoked after publication
  ) as t(sfx, days, kind)
  loop
    v_id := ('f4860000-0000-4000-8000-0000000000' || r.sfx)::uuid;
    v_from := (now() at time zone 'America/Bogota')::date + r.days;
    insert into public.apartments
      (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
       landlord_id, verified, price_monthly, currency, available_from, available_to, latitude, longitude)
    values (v_id, 'SAN486 variant ' || r.sfx, 'san486-variant-' || r.sfx, 'Laureles',
            'SAN486 variant address ' || r.sfx, 'inactive', 'pending', 'draft',
            'f4860000-0000-4000-8000-000000000011', false, 2900000, 'COP', v_from, null, 6.2447, -75.5916);

    v_by := 'f4860000-0000-4000-8000-000000000002';
    v_meta := v_base;
    if r.kind in ('good', 'no_reviewer', 'owner_reviewer', 'no_evidence') then
      v_meta := v_meta || jsonb_build_object('move_in_verified_for', to_char(v_from, 'YYYY-MM-DD'));
    elsif r.kind = 'other_date' then
      v_meta := v_meta || jsonb_build_object('move_in_verified_for', to_char(v_from - 7, 'YYYY-MM-DD'));
    end if;
    if r.kind not in ('none', 'no_evidence') then
      v_meta := v_meta || jsonb_build_object('move_in_evidence', 'signed lease start + reviewer site visit');
    end if;
    if r.kind = 'no_reviewer' then v_by := null; end if;
    if r.kind = 'owner_reviewer' then v_by := 'f4860000-0000-4000-8000-000000000001'; end if;

    insert into public.property_verifications (apartment_id, status, verified_at, verified_by, metadata)
    values (v_id, 'verified', now(), v_by, v_meta);
    insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
    values (v_id, 'san486/variant-' || r.sfx || '.jpg', 'image/jpeg', 'authorized');
    insert into public.rental_freshness_log (listing_id, checked_at, status)
    values (v_id, now(), 'active');
  end loop;
end
$fx$;

-- Publish by an intentional state change (the material-edit guard skips transitions).
update public.apartments
   set status = 'active', moderation_status = 'approved', listing_workflow_status = 'published', verified = true
 where id in ('f4860000-0000-4000-8000-000000000021',
              'f4860000-0000-4000-8000-000000000033',
              'f4860000-0000-4000-8000-000000000036');

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

-- B · the receipt must be reviewed, date-specific and independent. Each variant has every
-- other piece of evidence, so the ONLY blocker proves the receipt rule itself.
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000027', false),
  array['no verified move-in date']::text[], 'B1: a future move-in with no receipt blocks publication');
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000028', false),
  array['no verified move-in date']::text[], 'B2: a receipt for a different date cannot authorize this one');
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000029', false),
  array['no verified move-in date']::text[], 'B3: a receipt with no reviewer identity blocks');
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000030', false),
  array['no verified move-in date']::text[], 'B4: the owner cannot review their own move-in date');
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000031', false),
  array['no verified move-in date']::text[], 'B5: a receipt that names no evidence blocks');
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000032', false),
  array[]::text[], 'B6: an apartment that is already available needs no move-in receipt');

-- B7/B8 · expiry uses the America/Bogota calendar date, not the database's UTC date (which is a
-- day ahead for five hours every night). A window that ends TODAY in Bogotá is still open; one that
-- ended yesterday there is not. (The UTC/Bogotá difference only shows between 00:00 and 05:00 UTC.)
update public.apartments set available_to = (now() at time zone 'America/Bogota')::date
 where id = 'f4860000-0000-4000-8000-000000000032';
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000032', false),
  array[]::text[], 'B7: a window that ends today in Bogotá is still open');
update public.apartments set available_to = (now() at time zone 'America/Bogota')::date - 1
 where id = 'f4860000-0000-4000-8000-000000000032';
select is(public.rental_listing_launch_blockers('f4860000-0000-4000-8000-000000000032', false) @> array['no current availability evidence']::text[],
  true, 'B8: a window that ended yesterday in Bogotá is expired');

-- H · publication with missing evidence really fails; with the receipt it succeeds.
set local role service_role;
select throws_ok($q$select public.publish_verified_rental('f4860000-0000-4000-8000-000000000027'::uuid, 'f4860000-0000-4000-8000-000000000002'::uuid)$q$,
  '23514', 'listing is not launch-ready: missing no verified move-in date',
  'H1: publishing without the move-in receipt raises, it does not just warn');
select lives_ok($q$select public.publish_verified_rental('f4860000-0000-4000-8000-000000000034'::uuid, 'f4860000-0000-4000-8000-000000000002'::uuid)$q$,
  'H2: publishing with the date-specific receipt succeeds');
reset role;
select is((select listing_workflow_status || '/' || status || '/' || verified::text from public.apartments
            where id = 'f4860000-0000-4000-8000-000000000034'),
  'published/active/true', 'H3: the receipt-backed listing is now live');

-- C · moving the move-in date after publication sends the listing back to review, and the
-- receipt for the OLD date cannot republish it.
update public.apartments set available_from = (now() at time zone 'America/Bogota')::date + 60
 where id = 'f4860000-0000-4000-8000-000000000033';
select is((select listing_workflow_status || '/' || status || '/' || verified::text from public.apartments
            where id = 'f4860000-0000-4000-8000-000000000033'),
  'draft/inactive/false', 'C1: changing the move-in date re-enters review');
set local role service_role;
select throws_ok($q$select public.publish_verified_rental('f4860000-0000-4000-8000-000000000033'::uuid, 'f4860000-0000-4000-8000-000000000002'::uuid)$q$,
  '23514', 'listing is not launch-ready: missing no verified move-in date',
  'C2: the old date''s receipt cannot republish the new date');
reset role;
update public.property_verifications
   set metadata = metadata || jsonb_build_object('move_in_verified_for', to_char((now() at time zone 'America/Bogota')::date + 60, 'YYYY-MM-DD'))
 where apartment_id = 'f4860000-0000-4000-8000-000000000033';
set local role service_role;
select lives_ok($q$select public.publish_verified_rental('f4860000-0000-4000-8000-000000000033'::uuid, 'f4860000-0000-4000-8000-000000000002'::uuid)$q$,
  'C3: a new receipt for the new date lets it be republished');
reset role;

-- G · unauthorized, revoked and withdrawn paths are denied.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4860000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($q$select public.publish_verified_rental('f4860000-0000-4000-8000-000000000035'::uuid)$q$,
  'P0002', 'apartment f4860000-0000-4000-8000-000000000035 not found',
  'G1: an outsider cannot publish someone else''s listing (and cannot tell it exists)');
reset role;

update public.property_verifications
   set metadata = metadata || '{"viewings_permission":"not_granted"}'::jsonb
 where apartment_id = 'f4860000-0000-4000-8000-000000000036';
select is((select listing_workflow_status || '/' || status || '/' || verified::text from public.apartments
            where id = 'f4860000-0000-4000-8000-000000000036'),
  'draft/inactive/false', 'G2: revoking a permission after publication pulls the listing back to review');
set local role service_role;
select throws_ok($q$
  select public.p1_schedule_tour_atomic('f4860000-0000-4000-8000-000000000036'::text, null::uuid,
    'san486-viewing-key-revoked', 'form', 'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '1 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
  'G3: no viewing can be requested once the permission is revoked');
reset role;

update public.apartments set status = 'inactive' where id = 'f4860000-0000-4000-8000-000000000021';
set local role service_role;
select throws_ok($q$
  select public.p1_schedule_tour_atomic('f4860000-0000-4000-8000-000000000021'::text, null::uuid,
    'san486-viewing-key-withdrawn', 'form', 'san486-renter@example.com', 'SAN486 Renter', null, null::uuid,
    (now() + interval '3 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
  'G4: a withdrawn listing cannot receive a new viewing request');
reset role;

select * from finish();
rollback;
