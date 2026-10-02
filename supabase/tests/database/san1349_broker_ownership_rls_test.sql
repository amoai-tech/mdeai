-- SAN-1349 · A rental has a real owner, and that owner is the only broker who sees its private data
--
-- WHAT THIS LOCKS IN
--   1. The canonical chain auth.uid() → landlord_profiles.user_id → landlord_profiles.id →
--      apartments.landlord_id is what authorizes a broker, and nothing else is.
--      Legacy `apartments.host_id = auth.uid()` never authorizes a broker.
--   2. A viewing request is accepted only for a listing that is active AND approved AND
--      published AND owned. An active-but-ownerless listing must not create a lead.
--   3. The durable database invariant — "active + approved + published ⇒ landlord_id IS NOT NULL" —
--      exists, is VALIDATED, and rejects new violating INSERTs and UPDATEs.
--
-- WHY EACH NEGATIVE CASE IS MEASURED AGAINST A CONTROL
-- A system that denied everything would pass every "0 rows" assertion here. Sections C and H1
-- are the controls: Broker A reads its own apartment, lead and showing, and a fully-owned
-- requestable listing still commits one lead + one showing through the RPC.
--
-- RED → GREEN
-- Against the pre-SAN-1349 schema this file fails on:
--   B1/B2  the ownership constraint does not exist
--   G2     `showings_select_visible` still grants Broker B access through a.host_id
--   H4     the viewing RPC accepts an active listing with landlord_id IS NULL
-- Those are the three defects SAN-1349 exists to remove. Everything else is the lock that keeps
-- them removed.
--
-- FIXTURE DISCIPLINE
-- Every apartment fixture is deliberately shaped so it cannot violate the new CHECK, which is
-- enforced for new rows even while it is NOT VALID:
--   * the ownerless and host_id-only fixtures keep moderation_status <> 'approved' and
--     listing_workflow_status <> 'published'
--   * the "unapproved" / "unpublished" RPC fixtures differ from the valid listing in exactly
--     one workflow column, so a rejection can only be attributed to that column
-- Only section I constructs a genuinely violating row, and it asserts that doing so fails.
--
-- Run with: supabase test db

begin;

select plan(32);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — deterministic, transaction-owned, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Brokers need real auth.users rows: landlord_profiles.user_id is FK → auth.users(id).
-- The insert fires on_auth_user_created → public.handle_new_user(), which swallows its own
-- errors, so it cannot break the fixture (same contract SAN-1054 relies on).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1349000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1349-broker-a@example.com',
   extensions.crypt('san1349-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1349000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1349-broker-b@example.com',
   extensions.crypt('san1349-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1349000-0000-4000-8000-000000000011', 'a1349000-0000-4000-8000-000000000001',
   'SAN1349 Broker A', 'approved'),
  ('a1349000-0000-4000-8000-000000000012', 'a1349000-0000-4000-8000-000000000002',
   'SAN1349 Broker B', 'approved');

-- Renter owns the lead. `profiles` has no FK to auth.users in this schema, so a direct insert
-- is the supported fixture path (SAN-1286 does the same).
insert into public.profiles (id, email, full_name)
values ('a1349000-0000-4000-8000-000000000003', 'san1349-renter@example.com', 'SAN1349 Renter');

-- Apartment fixtures. `a1349000-...-0004` is the unrelated authenticated user below and has no
-- landlord profile and no auth.users row — auth.uid() only reads the JWT claim.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, host_id, available_to)
values
  -- Control: owned by A, fully requestable (active + approved + published).
  ('b1349000-0000-4000-8000-000000000001', 'SAN1349 A requestable', 'san1349-a-requestable',
   'Laureles', 'active', 'approved', 'published',
   'a1349000-0000-4000-8000-000000000011', null, '2099-12-31'),
  -- Owned by A but NOT approved — differs from the control in moderation_status only.
  ('b1349000-0000-4000-8000-000000000002', 'SAN1349 A unapproved', 'san1349-a-unapproved',
   'Laureles', 'active', 'pending', 'published',
   'a1349000-0000-4000-8000-000000000011', null, '2099-12-31'),
  -- Owned by A but NOT published — differs from the control in listing_workflow_status only.
  ('b1349000-0000-4000-8000-000000000003', 'SAN1349 A unpublished', 'san1349-a-unpublished',
   'Laureles', 'active', 'approved', 'draft',
   'a1349000-0000-4000-8000-000000000011', null, '2099-12-31'),
  -- Active and ownerless — the exact pre-SAN-1349 requestable shape, kept CHECK-safe by
  -- staying out of the published/approved state.
  ('b1349000-0000-4000-8000-000000000004', 'SAN1349 unowned active', 'san1349-unowned-active',
   'Laureles', 'active', 'pending', 'draft', null, null, '2099-12-31'),
  -- Inactive control for the availability precondition.
  ('b1349000-0000-4000-8000-000000000005', 'SAN1349 inactive', 'san1349-inactive',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1349000-0000-4000-8000-000000000011', null, '2099-12-31'),
  -- Legacy ownership shape: host_id points at Broker B, landlord_id is NULL. Under the old
  -- `showings_select_visible` this alone granted Broker B visibility.
  ('b1349000-0000-4000-8000-000000000006', 'SAN1349 legacy host_id', 'san1349-legacy-host-id',
   'Laureles', 'active', 'pending', 'draft', null,
   'a1349000-0000-4000-8000-000000000002', '2099-12-31');

-- Broker A's private lead + showing on its own apartment.
insert into public.leads
  (id, user_id, source, email, name, apartment_id, preferred_showing_at, intent, status,
   pipeline_stage, metadata, idempotency_key)
values
  ('c1349000-0000-4000-8000-000000000001', 'a1349000-0000-4000-8000-000000000003', 'form',
   'san1349-renter@example.com', 'SAN1349 Renter', 'b1349000-0000-4000-8000-000000000001',
   '2099-11-01 14:00:00+00', 'rental', 'new', 'showing_scheduled', '{}'::jsonb,
   'san1349-fixture-lead-a'),
  -- A second lead on the host_id-only apartment, so the legacy bypass has a lead to hang off.
  ('c1349000-0000-4000-8000-000000000002', 'a1349000-0000-4000-8000-000000000003', 'form',
   'san1349-renter@example.com', 'SAN1349 Renter', 'b1349000-0000-4000-8000-000000000006',
   '2099-11-02 14:00:00+00', 'rental', 'new', 'showing_scheduled', '{}'::jsonb,
   'san1349-fixture-lead-host');

insert into public.showings (id, lead_id, apartment_id, scheduled_at, status, metadata)
values
  ('d1349000-0000-4000-8000-000000000001', 'c1349000-0000-4000-8000-000000000001',
   'b1349000-0000-4000-8000-000000000001', '2099-11-01 14:00:00+00', 'scheduled', '{}'::jsonb),
  ('d1349000-0000-4000-8000-000000000002', 'c1349000-0000-4000-8000-000000000002',
   'b1349000-0000-4000-8000-000000000006', '2099-11-02 14:00:00+00', 'scheduled', '{}'::jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT — the RPC keeps its single service-role-only SECURITY DEFINER shape.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)') is not null,
  'A1: the single viewing RPC signature exists (no _v2 overload)'
);

select is(
  has_function_privilege('anon', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'),
  false,
  'A2: anon cannot execute the viewing RPC'
);

select is(
  has_function_privilege('authenticated', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'),
  false,
  'A3: authenticated cannot execute the viewing RPC directly'
);

select is(
  has_function_privilege('service_role', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'),
  true,
  'A4: service_role executes the viewing RPC'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · DURABLE INVARIANT — the constraint is present AND validated.
-- Presence alone is not enough: a CHECK left NOT VALID is never proven against history.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.apartments'::regclass
      and conname = 'apartments_owner_required_when_published'),
  1,
  'B1: apartments_owner_required_when_published exists'
);

select is(
  (select convalidated from pg_constraint
    where conrelid = 'public.apartments'::regclass
      and conname = 'apartments_owner_required_when_published'),
  true,
  'B2: the ownership constraint is VALIDATED against existing rows'
);

select ok(
  (select position('landlord_id' in pg_get_constraintdef(oid)) > 0
      and position('moderation_status' in pg_get_constraintdef(oid)) > 0
      and position('listing_workflow_status' in pg_get_constraintdef(oid)) > 0
   from pg_constraint
   where conrelid = 'public.apartments'::regclass
     and conname = 'apartments_owner_required_when_published'),
  'B3: the constraint binds landlord_id to the approved + published workflow state'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · CONTROL — Broker A reaches its own apartment, lead and showing.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::int from public.apartments
    where id = 'b1349000-0000-4000-8000-000000000001'),
  1, 'C1: Broker A reads its own apartment'
);

select is(
  (select count(*)::int from public.leads
    where id = 'c1349000-0000-4000-8000-000000000001'),
  1, 'C2: Broker A reads the lead on its own apartment'
);

select is(
  (select count(*)::int from public.showings
    where id = 'd1349000-0000-4000-8000-000000000001'),
  1, 'C3: Broker A reads the showing on its own apartment'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · FOREIGN BROKER — Broker B owns nothing here and must see nothing private.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.leads
    where id = 'c1349000-0000-4000-8000-000000000001'),
  0, 'D1: Broker B sees zero of Broker A private leads'
);

select is(
  (select count(*)::int from public.showings
    where id = 'd1349000-0000-4000-8000-000000000001'),
  0, 'D2: Broker B sees zero of Broker A private showings'
);

-- SAN-1206 revoked the table UPDATE grant from authenticated, so this refusal is now explicit
-- (42501) instead of an RLS-filtered zero-row update. The intent is unchanged and the
-- assertion is strictly stronger: "permission denied" cannot be confused with a policy that
-- merely filtered the row out, which is the ambiguity the old zero-row form suffered from.
select throws_ok($q$
  update public.showings set status = 'completed'
  where id = 'd1349000-0000-4000-8000-000000000001'
$q$, '42501', NULL, 'D3: Broker B cannot update Broker A private showing');

reset role;

select is(
  (select status from public.showings
    where id = 'd1349000-0000-4000-8000-000000000001'),
  'scheduled', 'D4: the denied update left the showing untouched'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · UNRELATED AUTHENTICATED USER — signed in, but not an owner of anything.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000004', true);

select is(
  (select count(*)::int from public.leads
    where id = 'c1349000-0000-4000-8000-000000000001'),
  0, 'E1: unrelated authenticated user sees zero private leads'
);

select is(
  (select count(*)::int from public.showings
    where id = 'd1349000-0000-4000-8000-000000000001'),
  0, 'E2: unrelated authenticated user sees zero private showings'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · ANONYMOUS — no JWT at all.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::int from public.leads
    where id = 'c1349000-0000-4000-8000-000000000001'),
  0, 'F1: anon sees zero private leads'
);

-- SAN-1206 revoked SELECT from anon entirely (it held a GRANT ALL with no anon policy to use
-- it), so this is now an explicit refusal rather than a read filtered to zero rows.
select throws_ok($q$
  select count(*) from public.showings
  where id = 'd1349000-0000-4000-8000-000000000001'
$q$, '42501', NULL, 'F2: anon cannot read private showings');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- G · LEGACY host_id — the bypass SAN-1349 removes.
--
-- Broker B IS the apartment's host_id and is NOT its landlord. Under the pre-SAN-1349
-- `showings_select_visible` this granted Broker B the showing; now it must not.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select (host_id = 'a1349000-0000-4000-8000-000000000002' and landlord_id is null)::int
   from public.apartments
   where id = 'b1349000-0000-4000-8000-000000000006'),
  1, 'G1: fixture really is host_id-only (host_id = Broker B, landlord_id IS NULL)'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.showings
    where id = 'd1349000-0000-4000-8000-000000000002'),
  0, 'G2: legacy host_id alone does NOT grant Broker B access to the showing'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- H · VIEWING RPC — a new request needs a real owner AND a published, approved listing.
--
-- One apartment per rejection reason, each differing from the C-control listing in exactly
-- one column, so a rejection cannot be explained by any other column.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role service_role;

select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1349-a-requestable', null::uuid, 'san1349-owned-key-001', 'form',
    'owned@example.com', 'Owned Renter', null, null::uuid,
    '2099-11-10 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'H1: owned + active + approved + published listing is requestable (control)');

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1349-a-unapproved', null::uuid, 'san1349-unapproved-key', 'form',
    'unapproved@example.com', 'Unapproved', null, null::uuid,
    '2099-11-11 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
      'H2: owned but unapproved listing is rejected before any write');

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1349-a-unpublished', null::uuid, 'san1349-unpublished-key', 'form',
    'unpublished@example.com', 'Unpublished', null, null::uuid,
    '2099-11-12 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
      'H3: owned but unpublished listing is rejected before any write');

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1349-unowned-active', null::uuid, 'san1349-unowned-key', 'form',
    'unowned@example.com', 'Unowned', null, null::uuid,
    '2099-11-13 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
      'H4: active but OWNERLESS listing is rejected before any write');

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1349-inactive', null::uuid, 'san1349-inactive-key', 'form',
    'inactive@example.com', 'Inactive', null, null::uuid,
    '2099-11-14 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable',
      'H5: inactive listing is rejected before any write');

reset role;

select is(
  (select count(*)::int from public.leads
    where idempotency_key in ('san1349-owned-key-001', 'san1349-unapproved-key',
                              'san1349-unpublished-key', 'san1349-unowned-key',
                              'san1349-inactive-key')),
  1, 'H6: only the owned requestable listing created a lead'
);

select is(
  (select count(*)::int from public.showings s
     join public.leads l on l.id = s.lead_id
    where l.idempotency_key in ('san1349-owned-key-001', 'san1349-unapproved-key',
                                'san1349-unpublished-key', 'san1349-unowned-key',
                                'san1349-inactive-key')),
  1, 'H7: only the owned requestable listing created a showing'
);

-- A committed request stays replayable even after the listing stops being requestable.
-- Idempotency must outrank volatile new-request eligibility (SAN-1286 contract).
update public.apartments
set listing_workflow_status = 'paused', status = 'inactive'
where id = 'b1349000-0000-4000-8000-000000000001';

set local role service_role;

select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1349-a-requestable', null::uuid, 'san1349-owned-key-001', 'form',
    'owned@example.com', 'Owned Renter', null, null::uuid,
    '2099-11-10 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'H8: committed replay still succeeds after the listing is unpublished (idempotency outranks eligibility)');

reset role;

select is(
  (select count(*)::int from public.leads where idempotency_key = 'san1349-owned-key-001'),
  1, 'H9: the replay did not create a second lead'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- I · INVARIANT ENFORCEMENT — the constraint is a real write barrier, not decoration.
-- ═══════════════════════════════════════════════════════════════════════════════

select throws_ok($q$
  insert into public.apartments
    (title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
  values
    ('SAN1349 violating', 'san1349-violating', 'Laureles', 'active', 'approved', 'published', null)
$q$, '23514', null,
      'I1: a new active + approved + published OWNERLESS listing is rejected by the constraint');

select lives_ok($q$
  insert into public.apartments
    (title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
  values
    ('SAN1349 valid owned', 'san1349-valid-owned', 'Laureles', 'active', 'approved', 'published',
     'a1349000-0000-4000-8000-000000000011')
$q$, 'I2: the same listing shape WITH a canonical owner is accepted (control)');

-- I2's row is the only active + approved + published OWNED row in scope, so nulling its
-- landlord_id is a real violation of the invariant rather than an incidental state change.
select throws_ok($q$
  update public.apartments set landlord_id = null
  where slug = 'san1349-valid-owned'
$q$, '23514', null,
      'I3: an UPDATE that strips ownership from a published listing is rejected');

select * from finish();
rollback;
