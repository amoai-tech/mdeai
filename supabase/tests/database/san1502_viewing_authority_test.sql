-- SAN-1502 · Rental viewing authority in Phase A.
--
-- Proves the real transaction path for an ordinary authenticated renter on a
-- pending (inactive, non-fixture) development apartment while keeping explicit
-- test fixtures and private/internal inventory unreachable, including when a
-- fixture is marked active. Phase B rules are re-proved at the end.
--
-- Run with: supabase test db
begin;
select plan(63);

-- ── deterministic actors ─────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1507000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-admin@example.com'),
  ('f1507000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-granted@example.com'),
  ('f1507000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-ordinary@example.com'),
  ('f1507000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-slug@example.com'),
  ('f1507000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-fail@example.com'),
  ('f1507000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-broker@example.com'),
  ('f1507000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-other-broker@example.com'),
  ('f1507000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1502-viewing-unrelated@example.com');

insert into public.user_roles (user_id, role)
values ('f1507000-0000-4000-8000-000000000001', 'admin');

insert into public.landlord_profiles (id, user_id, display_name, verification_status) values
  ('f1507000-0000-4000-8000-000000000011', 'f1507000-0000-4000-8000-000000000006', 'SAN1502 owning broker', 'approved'),
  ('f1507000-0000-4000-8000-000000000012', 'f1507000-0000-4000-8000-000000000007', 'SAN1502 other broker', 'approved');

-- The grant is real: the production admin RPC, not a hand-inserted row.
set local role service_role;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000001","role":"service_role"}', true);
select lives_ok(
  $q$select public.admin_grant_rental_test_access('f1507000-0000-4000-8000-000000000002', 'renter')$q$,
  'setup: administrator grants the authorized renter a development test grant');
reset role;
select set_config('request.jwt.claims', '{}', true);

-- ── controlled inventory ─────────────────────────────────────────────────────
insert into public.apartments
  (id, title, slug, neighborhood, city, description, status, moderation_status,
   listing_workflow_status, landlord_id, metadata, available_from, available_to)
values
  ('f1507000-0000-4000-8000-000000000101', 'SAN1502 pending apartment',
   'san1502-viewing-pending', 'Laureles', 'Medellín', 'Pending non-fixture development rental',
   'inactive', 'pending', 'draft', 'f1507000-0000-4000-8000-000000000011',
   '{}'::jsonb, current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000102', 'SAN1502 active fixture',
   'san1502-viewing-active-fixture', 'Laureles', 'Medellín', 'Active protected test fixture',
   'active', 'approved', 'published', 'f1507000-0000-4000-8000-000000000011',
   '{"is_test_fixture":"true","inventory_kind":"test_fixture"}'::jsonb,
   current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000103', 'SAN1502 inactive fixture',
   'san1502-viewing-inactive-fixture', 'Laureles', 'Medellín', 'Inactive protected test fixture',
   'inactive', 'pending', 'draft', 'f1507000-0000-4000-8000-000000000011',
   '{"is_test_fixture":"true","inventory_kind":"test_fixture"}'::jsonb,
   current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000104', 'SAN1502 private apartment',
   'san1502-viewing-private', 'Laureles', 'Medellín', 'Explicitly private development rental',
   'active', 'approved', 'published', 'f1507000-0000-4000-8000-000000000011',
   '{"visibility":"private"}'::jsonb, current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000105', 'SAN1502 launch apartment',
   'san1502-viewing-phaseb', 'Laureles', 'Medellín', 'Fully published launch rental',
   'active', 'approved', 'published', 'f1507000-0000-4000-8000-000000000011',
   '{}'::jsonb, current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000106', 'SAN1502 rollback apartment',
   'san1502-viewing-failure', 'Laureles', 'Medellín', 'Forced downstream failure rental',
   'inactive', 'pending', 'draft', 'f1507000-0000-4000-8000-000000000011',
   '{}'::jsonb, current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000107', 'SAN1502 source-linked apartment',
   'san1502-viewing-external', 'Laureles', 'Medellín', 'Source advertisement that must stay source-only',
   'active', 'approved', 'published', 'f1507000-0000-4000-8000-000000000011',
   '{"inventory_kind":"external_candidate","allowed_action":"view_original_listing"}'::jsonb,
   current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000108', 'SAN1502 kind-marked fixture',
   'san1502-viewing-kind-fixture', 'Laureles', 'Medellín', 'Fixture marked only by inventory_kind',
   'active', 'approved', 'published', 'f1507000-0000-4000-8000-000000000011',
   '{"inventory_kind":"test_fixture"}'::jsonb, current_date - 1, current_date + 60),

  ('f1507000-0000-4000-8000-000000000109', 'SAN1502 rename-before-fixture',
   'san1502-viewing-rename-original', 'Laureles', 'Medellín', 'Normal rental renamed into a fixture',
   'inactive', 'pending', 'draft', 'f1507000-0000-4000-8000-000000000011',
   '{}'::jsonb, current_date - 1, current_date + 60);

select set_config('san1502.scheduled_at', (now() + interval '3 days')::text, true);

-- ── projection: the identity-less function must never grant fixture/privacy ──
select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000101'),
  true,
  'Phase A pending non-fixture is requestable regardless of status');

select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000102'),
  true,
  'An active test fixture is not requestable through the identity-less projection');

select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000103'),
  true,
  'An inactive test fixture is not requestable');

select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000108'),
  true,
  'A fixture marked only by inventory_kind is still protected');

select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000104'),
  false,
  'A private/internal apartment is not requestable');

select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000107'),
  true,
  'A source-linked advertisement is discoverable but never MDE-requestable');

-- ── ordinary renter books a pending non-fixture development apartment ────────
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000101',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-pending-1', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'ordinary authenticated renter can request a pending development apartment');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and user_id = 'f1507000-0000-4000-8000-000000000003'),
  1, 'the pending request persisted exactly one lead');

select is(
  (select count(*)::int from public.showings s
    join public.leads l on l.id = s.lead_id
   where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
     and l.user_id = 'f1507000-0000-4000-8000-000000000003'),
  1, 'the pending request persisted exactly one showing');

select is(
  (select l.user_id from public.leads l
    where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and l.user_id = 'f1507000-0000-4000-8000-000000000003'),
  'f1507000-0000-4000-8000-000000000003'::uuid,
  'the lead is bound to the authenticated renter');

select is(
  (select l.apartment_id from public.leads l
    where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and l.user_id = 'f1507000-0000-4000-8000-000000000003'),
  'f1507000-0000-4000-8000-000000000101'::uuid,
  'the lead points at the requested apartment');

select is(
  (select l.metadata->>'routing_status' from public.leads l
    where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and l.user_id = 'f1507000-0000-4000-8000-000000000003'),
  'assigned_landlord',
  'the lead routes to the owning broker');

-- ── idempotent retry ─────────────────────────────────────────────────────────
select lives_ok(
  $q$select set_config('san1502.replay',
      (public.p1_schedule_tour_atomic(
        'f1507000-0000-4000-8000-000000000101',
        'f1507000-0000-4000-8000-000000000003',
        'san1502-viewing-pending-1', 'form',
        'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
        null, null, current_setting('san1502.scheduled_at')::timestamptz,
        '{}'::jsonb, '{}'::jsonb))->>'idempotent_replay', true)$q$,
  'an identical retry succeeds');

select is(
  current_setting('san1502.replay', true),
  'true', 'an identical retry returns the committed pair as a replay');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and user_id = 'f1507000-0000-4000-8000-000000000003'),
  1, 'the retry created no second lead');

select is(
  (select count(*)::int from public.showings s
    join public.leads l on l.id = s.lead_id
   where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
     and l.user_id = 'f1507000-0000-4000-8000-000000000003'),
  1, 'the retry created no second showing');

-- ── protected fixtures are denied independently of status ────────────────────
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000102',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-active-fixture-ordinary', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'an ACTIVE fixture is denied to an ordinary renter');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000103',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-inactive-fixture-ordinary', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'an INACTIVE fixture is denied to an ordinary renter');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000108',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-kind-fixture-ordinary', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'a fixture marked only by inventory_kind is denied to an ordinary renter');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000108'),
  1, 'a kind-marked fixture can receive a Phase A development lead');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'san1502-viewing-active-fixture',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-active-fixture-slug', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'the slug path enforces the same fixture authorization as the UUID path');

select is(
  (select count(*)::int from public.leads
    where apartment_id in ('f1507000-0000-4000-8000-000000000102',
                           'f1507000-0000-4000-8000-000000000103')),
  3, 'both fixture UUID and slug paths save actual development leads');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000102',
      null::uuid,
      'san1502-viewing-active-fixture-guest', 'form',
      'san1502-viewing-guest@example.com', 'Guest Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'a guest request cannot book an active fixture');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000102'
      and user_id is null),
  1, 'guest Phase A fixture request creates one idempotent lead');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000102',
      'f1507000-0000-4000-8000-000000000002',
      'san1502-viewing-active-fixture-granted', 'form',
      'san1502-viewing-granted@example.com', 'Granted Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'an authorized fixture actor keeps the intended test flow');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000102'
      and user_id = 'f1507000-0000-4000-8000-000000000002'),
  1, 'the authorized fixture request persisted one lead');

select is(
  (select count(*)::int from public.showings s
    join public.leads l on l.id = s.lead_id
   where l.apartment_id = 'f1507000-0000-4000-8000-000000000102'
     and l.user_id = 'f1507000-0000-4000-8000-000000000002'),
  1, 'the authorized fixture request persisted one showing');

select is(
  (select l.user_id from public.leads l
    where l.apartment_id = 'f1507000-0000-4000-8000-000000000102'
      and l.user_id = 'f1507000-0000-4000-8000-000000000002'),
  'f1507000-0000-4000-8000-000000000002'::uuid,
  'the authorized fixture lead is bound to the granted renter');

-- The admin path is server-authenticated: set the same JWT claims the
-- server action would carry before exercising the fixture flow.
set local role service_role;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000001","role":"service_role"}', true);
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000103',
      'f1507000-0000-4000-8000-000000000001',
      'san1502-viewing-inactive-fixture-admin', 'form',
      'san1502-viewing-admin@example.com', 'Admin Operator',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'an administrator acting through the server keeps the fixture test flow');
reset role;
select set_config('request.jwt.claims', '{}', true);

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000103'
      and user_id = 'f1507000-0000-4000-8000-000000000001'),
  1, 'the administrator fixture request persisted one lead');

-- A normal booking that is renamed into a fixture after the fact must not be
-- replayable through its saved lead, even when the old slug no longer exists.
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'san1502-viewing-rename-original',
      'f1507000-0000-4000-8000-000000000008',
      'san1502-viewing-rename-1', 'form',
      'san1502-viewing-unrelated@example.com', 'Rename Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'a normal pending apartment can be booked before it becomes a fixture');

update public.apartments
   set metadata = '{"is_test_fixture":"true","inventory_kind":"test_fixture"}'::jsonb,
       slug = 'san1502-viewing-renamed-fixture'
 where id = 'f1507000-0000-4000-8000-000000000109';

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'san1502-viewing-rename-original',
      'f1507000-0000-4000-8000-000000000008',
      'san1502-viewing-rename-1', 'form',
      'san1502-viewing-unrelated@example.com', 'Rename Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'a renamed fixture cannot be replayed through its saved lead');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000109'
      and user_id = 'f1507000-0000-4000-8000-000000000008'),
  1, 'the renamed-fixture replay denial left the original lead intact');

-- ── private/internal and source-only inventory stays protected ───────────────
select throws_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000104',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-private-ordinary', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
  'a private/internal apartment is denied');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000104'),
  0, 'the private request wrote no lead');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000107',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-external-ordinary', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'a source-linked advertisement cannot become an MDE viewing');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000107'),
  1, 'source-linked Phase A inquiry persists one request lead');

-- ── UUID/slug parity for a normal pending apartment ──────────────────────────
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'san1502-viewing-pending',
      'f1507000-0000-4000-8000-000000000004',
      'san1502-viewing-pending-slug', 'form',
      'san1502-viewing-slug@example.com', 'Slug Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'the slug path allows the same pending development apartment');

select is(
  (select l.metadata->>'listing_id' from public.leads l
    where l.user_id = 'f1507000-0000-4000-8000-000000000004'),
  'san1502-viewing-pending',
  'the slug request stores the caller-supplied listing identifier');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and user_id = 'f1507000-0000-4000-8000-000000000004'),
  1, 'the slug request persisted one lead');

select is(
  (select count(*)::int from public.showings s
    join public.leads l on l.id = s.lead_id
   where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
     and l.user_id = 'f1507000-0000-4000-8000-000000000004'),
  1, 'the slug request persisted one showing');

-- ── a private listing cannot be replayed through a committed request ────────
update public.apartments
   set metadata = coalesce(metadata, '{}'::jsonb) || '{"visibility":"private"}'::jsonb
 where id = 'f1507000-0000-4000-8000-000000000101';

select throws_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000101',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-pending-1', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  '42501', 'private rental is not requestable',
  'a committed viewing cannot be replayed after the listing becomes private');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and user_id = 'f1507000-0000-4000-8000-000000000003'),
  1, 'the private replay denial left the original lead intact');

update public.apartments
   set metadata = metadata - 'visibility'
 where id = 'f1507000-0000-4000-8000-000000000101';

-- ── broker isolation on the persisted records ────────────────────────────────
select set_config('san1502.lead_id',
  coalesce((select id::text from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000101'
      and user_id = 'f1507000-0000-4000-8000-000000000003'),
    '00000000-0000-0000-0000-000000000000'), false);
select set_config('san1502.showing_id',
  coalesce((select s.id::text from public.showings s
    join public.leads l on l.id = s.lead_id
   where l.apartment_id = 'f1507000-0000-4000-8000-000000000101'
     and l.user_id = 'f1507000-0000-4000-8000-000000000003'),
    '00000000-0000-0000-0000-000000000000'), false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.leads where id = current_setting('san1502.lead_id')::uuid),
  1, 'the owning broker can read the request');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.leads where id = current_setting('san1502.lead_id')::uuid),
  0, 'an unrelated broker cannot read the lead even with its exact UUID');
select is(
  (select count(*)::int from public.showings where id = current_setting('san1502.showing_id')::uuid),
  0, 'an unrelated broker cannot read the showing even with its exact UUID');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.leads where id = current_setting('san1502.lead_id')::uuid),
  1, 'the renter can read their own persisted request');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000008","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.leads where id = current_setting('san1502.lead_id')::uuid),
  0, 'an unrelated signed-in user cannot read the lead');
reset role;
select set_config('request.jwt.claims', '{}', true);

-- ── a downstream failure rolls the lead back too ─────────────────────────────
create or replace function public.san1502_test_fail_showing()
returns trigger language plpgsql as $function$
begin
  if new.apartment_id = 'f1507000-0000-4000-8000-000000000106' then
    raise exception 'forced showing failure' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger san1502_test_fail_showing
before insert on public.showings
for each row execute function public.san1502_test_fail_showing();

select throws_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000106',
      'f1507000-0000-4000-8000-000000000005',
      'san1502-viewing-failure-1', 'form',
      'san1502-viewing-fail@example.com', 'Failing Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'P0001', 'forced showing failure',
  'a downstream showing failure propagates to the caller');

select is(
  (select count(*)::int from public.leads
    where user_id = 'f1507000-0000-4000-8000-000000000005'
      and idempotency_key = 'san1502-viewing-failure-1'),
  0, 'the failed transaction left no orphaned lead');

select is(
  (select count(*)::int from public.showings
    where apartment_id = 'f1507000-0000-4000-8000-000000000106'),
  0, 'the failed transaction left no orphaned showing');

-- ── Phase B preserves the launch contract ───────────────────────────────────
update public.rental_runtime_settings
   set phase = 'launch', changed_at = now()
 where singleton;

select is(
  (select phase from public.rental_runtime_settings where singleton),
  'launch', 'the explicit launch switch is active for the Phase B checks');

select is(
  (select public.rental_can_request_viewing(a) from public.apartments a
    where a.id = 'f1507000-0000-4000-8000-000000000101'),
  false, 'launch mode restores the active-status requirement');

select throws_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000101',
      'f1507000-0000-4000-8000-000000000004',
      'san1502-viewing-phaseb-pending', 'form',
      'san1502-viewing-slug@example.com', 'Slug Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
  'launch mode denies a pending development apartment');

select throws_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000102',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-phaseb-fixture', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  '42501', 'development rental viewing requires an authorized renter',
  'launch mode still denies an active fixture to an ordinary renter');

select lives_ok(
  $q$select public.p1_schedule_tour_atomic(
      'f1507000-0000-4000-8000-000000000105',
      'f1507000-0000-4000-8000-000000000003',
      'san1502-viewing-phaseb-active', 'form',
      'san1502-viewing-ordinary@example.com', 'Ordinary Renter',
      null, null, current_setting('san1502.scheduled_at')::timestamptz,
      '{}'::jsonb, '{}'::jsonb)$q$,
  'launch mode still allows a fully published rental');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'f1507000-0000-4000-8000-000000000105'
      and idempotency_key = 'san1502-viewing-phaseb-active'),
  1, 'the launch-mode request persisted one lead');

update public.rental_runtime_settings
   set phase = 'development', changed_at = now()
 where singleton;

select is(
  (select phase from public.rental_runtime_settings where singleton),
  'development', 'the test restores the server-controlled development phase');

-- ── fixture metadata cannot be rewritten by an ordinary client ───────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1507000-0000-4000-8000-000000000003","role":"authenticated"}', true);
with changed as (
  update public.apartments
     set metadata = jsonb_set(metadata, '{is_test_fixture}', '"false"'::jsonb)
   where id = 'f1507000-0000-4000-8000-000000000102'
  returning 1
)
select is((select count(*)::int from changed), 0,
  'an ordinary renter cannot rewrite the fixture marker');
reset role;
select set_config('request.jwt.claims', '{}', true);

select is(
  (select metadata->>'is_test_fixture' from public.apartments
    where id = 'f1507000-0000-4000-8000-000000000102'),
  'true', 'the fixture marker is unchanged after the denied update');

-- ── the privileged RPC stays server-only ────────────────────────────────────
select is(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'),
    'EXECUTE'),
  false, 'authenticated clients cannot call the privileged atomic RPC directly');

select is(
  has_function_privilege(
    'service_role',
    to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'),
    'EXECUTE'),
  true, 'the trusted server role keeps EXECUTE on the atomic RPC');

select * from finish();
rollback;
