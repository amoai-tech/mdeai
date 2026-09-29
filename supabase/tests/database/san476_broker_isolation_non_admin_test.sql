-- SAN-476 · A viewing request is visible to the owning broker and to nobody else
--
-- WHY THIS FILE EXISTS ALONGSIDE san1349_broker_ownership_rls_test.sql
--
-- SAN-1349 proves the ownership chain and the removal of the legacy `host_id` bypass. It does
-- NOT assert that its fixture brokers carry no admin role, so its "Broker A reads its own lead"
-- control is satisfiable by the `is_admin()` disjunct in the SELECT policies as well as by
-- broker ownership. That ambiguity is not theoretical: an independent production review of the
-- certified rental listing found its owning account also held `user_roles.role = 'admin'`, so
-- the positive read could not be attributed to ownership alone.
--
-- This file closes that hole and follows one standardized shape for a private resource:
--
--     owner      + the exact known UUID  -> allowed
--     other      + the same exact UUID   -> denied
--     unrelated signed-in user           -> denied
--     anonymous                          -> denied
--     admin                              -> allowed, tested separately and on purpose
--
-- Two properties make that shape meaningful rather than decorative:
--
--   1. The lead and showing UUIDs are captured ONCE, during trusted setup, and every denial
--      then uses those literal UUIDs. An earlier revision of this file re-resolved the id
--      inside the restricted session (`where id = (select id from leads where ...)`); RLS hid
--      the row, the subquery returned NULL, and the outer lookup matched nothing. That passes
--      without proving anything: it never shows that a broker who KNOWS the exact identifier
--      is still refused.
--   2. The lead and showing are committed by public.p1_schedule_tour_atomic, so this exercises
--      the real atomic write path rather than restating a fixture.
--
-- Run with: supabase test db

begin;

select plan(42);

-- The fixture values live in session settings rather than psql client variables, so this file
-- stays plain SQL: the restricted-session probes read a value that was captured in the TRUSTED
-- session and cannot be re-derived under the policy being tested.
select set_config('san476.idem', 'san476-fixture-request-0001', false);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — deterministic, transaction-owned, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Real auth.users rows: landlord_profiles.user_id is FK -> auth.users(id), and the "unrelated
-- signed-in user" must be a genuine account rather than a bare JWT claim. The insert fires
-- on_auth_user_created -> public.handle_new_user(), which swallows its own errors.
--
-- ...0001 owning broker (no roles)   ...0002 other broker (no roles)
-- ...0003 unrelated signed-in user (no landlord profile, no roles)
-- ...0004 platform admin (explicitly granted, for the separate admin leg)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a4760000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san476-owner@example.com',
   extensions.crypt('san476-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a4760000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san476-other-broker@example.com',
   extensions.crypt('san476-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a4760000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san476-unrelated@example.com',
   extensions.crypt('san476-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a4760000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san476-admin@example.com',
   extensions.crypt('san476-fixture', extensions.gen_salt('bf')), now(), now(), now());

-- Only the owning and other brokers get landlord profiles. ...0003 deliberately gets none.
insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a4760000-0000-4000-8000-000000000011', 'a4760000-0000-4000-8000-000000000001',
   'SAN476 Owning Broker', 'approved'),
  ('a4760000-0000-4000-8000-000000000012', 'a4760000-0000-4000-8000-000000000002',
   'SAN476 Other Broker', 'approved');

-- The only role grant in this file, and it is deliberate: the admin leg exists to prove the
-- admin branch is real and intentional, so that its ABSENCE for the two brokers above means
-- something.
insert into public.user_roles (user_id, role)
values ('a4760000-0000-4000-8000-000000000004', 'admin');

-- Owned by the owning broker and fully requestable: active + approved + published.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_to)
values
  ('b4760000-0000-4000-8000-000000000001', 'SAN476 owned requestable', 'san476-owned',
   'Laureles', 'active', 'approved', 'published',
   'a4760000-0000-4000-8000-000000000011', '2099-12-31');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · NON-ADMIN CONTRACT — the property that makes the allow case attributable
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  public.has_role('a4760000-0000-4000-8000-000000000001', 'admin'), false,
  'A1: owning broker holds no admin role'
);

select is(
  public.has_role('a4760000-0000-4000-8000-000000000001', 'super_admin'), false,
  'A2: owning broker holds no super_admin role'
);

select is(
  public.has_role('a4760000-0000-4000-8000-000000000002', 'admin'), false,
  'A3: the other broker holds no admin role either'
);

select is(
  (select count(*)::int from public.user_roles
    where user_id in ('a4760000-0000-4000-8000-000000000001',
                      'a4760000-0000-4000-8000-000000000002')),
  0,
  'A4: neither broker has any user_roles row at all'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4760000-0000-4000-8000-000000000001', true);

select is(public.is_admin(), false,
  'A5: is_admin() is false as the owning broker (the allow case cannot be the admin disjunct)');

select is(
  (select count(*)::int from public.acting_landlord_ids()), 1,
  'A6: owning broker resolves to exactly one landlord profile'
);

select ok(
  (select bool_and(v = 'a4760000-0000-4000-8000-000000000011')
     from public.acting_landlord_ids() as t(v)),
  'A7: and that profile is its own'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4760000-0000-4000-8000-000000000002', true);

select is(public.is_admin(), false,
  'A8: is_admin() is false as the other broker');

select ok(
  (select bool_and(v = 'a4760000-0000-4000-8000-000000000012')
     from public.acting_landlord_ids() as t(v)),
  'A9: the other broker resolves to a different, disjoint profile'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- R · THE REQUEST — committed by the canonical atomic RPC, not inserted by hand
-- ═══════════════════════════════════════════════════════════════════════════════

set local role service_role;

select lives_ok(format($q$
  select public.p1_schedule_tour_atomic(
    'san476-owned', null::uuid, %L, 'form',
    'san476-renter@example.com', 'SAN476 Renter', null, null::uuid,
    '2099-11-20 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, current_setting('san476.idem')),
  'R1: the canonical viewing RPC commits against the owned requestable listing');

reset role;

select is(
  (select count(*)::int from public.leads where idempotency_key = current_setting('san476.idem')),
  1, 'R2: exactly one lead exists for the logical request'
);

select is(
  (select count(*)::int from public.showings s
     join public.leads l on l.id = s.lead_id
    where l.idempotency_key = current_setting('san476.idem')),
  1, 'R3: exactly one showing exists for the logical request'
);

-- Capture the exact identifiers ONCE, in the trusted (unrestricted) session. Every denial
-- below uses these literals. Re-resolving the id inside a restricted session would be
-- circular: RLS hides the row, the lookup yields NULL, and "denied" becomes vacuous.
select set_config('san476.lead_id', l.id::text, false),
       set_config('san476.showing_id', s.id::text, false)
from public.leads l
join public.showings s on s.lead_id = l.id
where l.idempotency_key = current_setting('san476.idem');

select ok(current_setting('san476.lead_id', true) is not null,
          'R4: the lead UUID was captured in the trusted session for the denial probes');
select ok(current_setting('san476.showing_id', true) is not null,
          'R5: the showing UUID was captured in the trusted session for the denial probes');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · CONTROL — the NON-ADMIN owning broker sees the exact request
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4760000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::int from public.apartments
    where id = 'b4760000-0000-4000-8000-000000000001'),
  1, 'B1: owning broker reads its own apartment'
);

select is(
  (select count(*)::int from public.leads where id = current_setting('san476.lead_id')::uuid),
  1, 'B2: owning broker reads the lead by its exact UUID'
);

select is(
  (select count(*)::int from public.showings where id = current_setting('san476.showing_id')::uuid),
  1, 'B3: owning broker reads the showing by its exact UUID'
);

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  1, 'B4: owning broker sees exactly one lead for the apartment'
);

select is(
  (select count(*)::int from public.showings
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  1, 'B5: owning broker sees exactly one showing for the apartment'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · THE OTHER NON-ADMIN BROKER — owns something, just not this.
--     Crucially: they are handed the EXACT identifiers and still get nothing.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4760000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  0, 'C1: other broker sees zero leads for the apartment'
);

select is(
  (select count(*)::int from public.leads where id = current_setting('san476.lead_id')::uuid),
  0, 'C2: other broker denied the lead even knowing its exact UUID'
);

select is(
  (select count(*)::int from public.showings
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  0, 'C3: other broker sees zero showings for the apartment'
);

select is(
  (select count(*)::int from public.showings where id = current_setting('san476.showing_id')::uuid),
  0, 'C4: other broker denied the showing even knowing its exact UUID'
);

-- RLS UPDATE filters silently rather than raising, so the proof is "zero rows touched".
with upd as (
  update public.showings set status = 'completed'
  where id = current_setting('san476.showing_id')::uuid
  returning 1
)
select is((select count(*)::int from upd), 0,
          'C5: other broker cannot update the owning broker''s showing by exact UUID');

reset role;

select is(
  (select status from public.showings where id = current_setting('san476.showing_id')::uuid),
  'scheduled', 'C6: the denied update left the showing untouched'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · AN UNRELATED REAL SIGNED-IN USER — a genuine auth.users account that owns nothing
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from auth.users
    where id = 'a4760000-0000-4000-8000-000000000003'),
  1, 'D1: the unrelated user is a real auth.users account, not just a JWT claim'
);

select is(
  (select count(*)::int from public.landlord_profiles
    where user_id = 'a4760000-0000-4000-8000-000000000003'),
  0, 'D2: the unrelated user owns no landlord profile'
);

select is(
  (select count(*)::int from public.user_roles
    where user_id = 'a4760000-0000-4000-8000-000000000003'),
  0, 'D3: the unrelated user holds no role'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4760000-0000-4000-8000-000000000003', true);

select is(public.is_admin(), false,
  'D4: is_admin() is false as the unrelated user');

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  0, 'D5: unrelated signed-in user sees zero private leads'
);

select is(
  (select count(*)::int from public.leads where id = current_setting('san476.lead_id')::uuid),
  0, 'D6: unrelated signed-in user denied the lead by exact UUID'
);

select is(
  (select count(*)::int from public.showings where id = current_setting('san476.showing_id')::uuid),
  0, 'D7: unrelated signed-in user denied the showing by exact UUID'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · ANONYMOUS — no JWT
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::int from public.leads
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  0, 'E1: anon sees zero private leads'
);

select is(
  (select count(*)::int from public.showings where id = current_setting('san476.showing_id')::uuid),
  0, 'E2: anon denied the showing by exact UUID'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · ADMIN — separated on purpose, so its absence above is meaningful.
--     The admin branch is the intentional admin override path for this fixture;
--     this leg proves it exists, so that its ABSENCE for the two brokers above
--     means the allow case in section B is attributable to ownership.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4760000-0000-4000-8000-000000000004', true);

select is(public.is_admin(), true,
  'F1: the admin fixture really is an admin');

select is(
  (select count(*)::int from public.leads where id = current_setting('san476.lead_id')::uuid),
  1, 'F2: admin can read the lead — intentional admin override path for this fixture'
);

select is(
  (select count(*)::int from public.showings where id = current_setting('san476.showing_id')::uuid),
  1, 'F3: admin can read the showing by the same exact UUID'
);

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- G · REPLAY — the same logical request must not create a second outcome
-- ═══════════════════════════════════════════════════════════════════════════════

set local role service_role;

select lives_ok(format($q$
  select public.p1_schedule_tour_atomic(
    'san476-owned', null::uuid, %L, 'form',
    'san476-renter@example.com', 'SAN476 Renter', null, null::uuid,
    '2099-11-20 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, current_setting('san476.idem')),
  'G1: replaying the identical request still succeeds');

select is(
  (select public.p1_schedule_tour_atomic(
    'san476-owned', null::uuid, current_setting('san476.idem'), 'form',
    'san476-renter@example.com', 'SAN476 Renter', null, null::uuid,
    '2099-11-20 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  ) -> 'idempotent_replay'),
  'true'::jsonb, 'G2: the replay is reported as an idempotent replay'
);

select is(
  (select public.p1_schedule_tour_atomic(
    'san476-owned', null::uuid, current_setting('san476.idem'), 'form',
    'san476-renter@example.com', 'SAN476 Renter', null, null::uuid,
    '2099-11-20 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  ) -> 'lead' ->> 'id'),
  current_setting('san476.lead_id'),
  'G3: the replay resolves to the original lead'
);

reset role;

select is(
  (select count(*)::int from public.leads where idempotency_key = current_setting('san476.idem')),
  1, 'G4: replay created no second lead'
);

select is(
  (select count(*)::int from public.showings
    where apartment_id = 'b4760000-0000-4000-8000-000000000001'),
  1, 'G5: replay created no second showing'
);

select * from finish();
rollback;
