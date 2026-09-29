-- SAN-1206 · Broker viewing actions: confirm, decline/cancel, reschedule
--
-- WHY THIS FILE EXISTS
--
-- SAN-1204 delivered the launch gate: the owning broker SEES the committed viewing request.
-- This file covers the step after it — the broker can ACT on that request — and it exists
-- because the current database says "yes" to callers who must never be able to say yes.
--
-- The gap, measured against the live database on the SAN-1206 start date:
--
--   * public.showings carries a TABLE-level GRANT of ALL to anon and authenticated, so the
--     Data API surface includes TRUNCATE, DELETE and UPDATE on every column.
--   * showings_update_visible lets the RENter branch write: a lead owner passes USING via
--     `l.user_id = auth.uid()`. RLS is row-level, not column-level, so the renter can rewrite
--     the authoritative `status` and `scheduled_at` of a booking the broker owns.
--   * There is no broker transition RPC at all, so the over-broad table path is the ONLY path.
--
-- The contract this file pins:
--
--   owning broker  -> confirm / cancel / reschedule succeeds, on the SAME showing row
--   exact replay   -> idempotent success; never a second showing
--   stale expected -> deterministic conflict (P1206); never overwrites a newer outcome
--   renter         -> cannot write authoritative status/time, directly or through the RPC
--   other broker   -> cannot read or write it
--   anonymous      -> cannot read or write it
--   admin          -> allowed, deliberately and separately, so the broker allow-case above
--                     cannot be satisfied by the is_admin() disjunct
--
-- Two properties make the denials non-vacuous rather than decorative, carried over from
-- san476_broker_isolation_non_admin_test.sql:
--
--   1. Showing/lead UUIDs are captured ONCE in the trusted session and every denial probe uses
--      those literals. Re-resolving an id inside a restricted session is circular: RLS hides
--      the row, the lookup yields NULL, and "denied" would prove nothing.
--   2. Denials assert the PERSISTED row afterwards in the trusted session, not just the
--      absence of an RPC response. A silently-filtered UPDATE and a refused UPDATE look
--      identical from the caller's side and completely different in the table.
--
-- Run with: supabase test db

begin;

select plan(70);

-- Values live in session settings rather than psql client variables so this file stays plain
-- SQL: every restricted-session probe reads a value captured in the trusted session.
select set_config('san1206.idem1', 'san1206-fixture-request-0001', false),
       set_config('san1206.idem2', 'san1206-fixture-request-0002', false);

-- The two canonical instants the broker will act on. 19:00Z is 2:00 PM in Medellín.
select set_config('san1206.t1', '2099-11-20 19:00:00+00', false),
       set_config('san1206.t2', '2099-11-21 19:00:00+00', false),
       set_config('san1206.t3', '2099-11-21 20:00:00+00', false),
       set_config('san1206.t4', '2099-11-21 21:00:00+00', false),
       set_config('san1206.t5', '2099-11-22 19:00:00+00', false);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — deterministic, transaction-owned, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Real auth.users rows: landlord_profiles.user_id is FK -> auth.users(id), and every identity
-- that must be refused (or allowed) has to be a genuine account rather than a bare JWT claim.
-- The insert fires on_auth_user_created -> public.handle_new_user().
--
-- ...0001 owning broker (no roles)   ...0002 other broker (no roles)
-- ...0003 renter / lead owner (no roles, no landlord profile)
-- ...0004 platform admin (explicitly granted, for the separate admin leg)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1206000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1206-owner@example.com',
   extensions.crypt('san1206-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1206000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1206-other-broker@example.com',
   extensions.crypt('san1206-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1206000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1206-renter@example.com',
   extensions.crypt('san1206-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1206000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1206-admin@example.com',
   extensions.crypt('san1206-fixture', extensions.gen_salt('bf')), now(), now(), now());

-- Both brokers get a real profile, and the renter and admin deliberately get none. The denials
-- below are therefore "a different real broker is refused", not "a nobody is refused".
insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1206000-0000-4000-8000-000000000011', 'a1206000-0000-4000-8000-000000000001',
   'SAN1206 Owning Broker', 'approved'),
  ('a1206000-0000-4000-8000-000000000012', 'a1206000-0000-4000-8000-000000000002',
   'SAN1206 Other Broker', 'approved');

-- The only role grant in this file, and it is deliberate: the admin leg exists to prove the
-- admin branch is real, so its ABSENCE for the other three identities means something.
insert into public.user_roles (user_id, role)
values ('a1206000-0000-4000-8000-000000000004', 'admin');

-- Two requestable listings, one per broker, so the other broker has real inventory of its own
-- and is still refused on this one.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_to)
values
  ('b1206000-0000-4000-8000-000000000001', 'SAN1206 owned requestable', 'san1206-owned',
   'Laureles', 'active', 'approved', 'published',
   'a1206000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1206000-0000-4000-8000-000000000002', 'SAN1206 other requestable', 'san1206-other',
   'Poblado', 'active', 'approved', 'published',
   'a1206000-0000-4000-8000-000000000012', '2099-12-31');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT SURFACE — the broker transition RPC and its ACL.
-- This section is the RED proof: before the SAN-1206 migration there is no function here.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'p1_broker_update_showing'),
  1, 'A1: the broker viewing-action RPC exists');

select is(
  coalesce((select p.prosecdef from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'p1_broker_update_showing'), false),
  true, 'A2: it is SECURITY DEFINER (see migration header for why INVOKER cannot satisfy this)');

select ok(
  coalesce((select p.proconfig from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'p1_broker_update_showing'),
           array[]::text[])::text like '%search_path%',
  'A3: it pins search_path, so a DEFINER body cannot be hijacked by a caller-controlled schema');

-- These read the catalog rather than calling has_function_privilege(), which RAISES when the
-- function is absent. Raising here would abort the whole file and destroy the RED signal; a
-- catalog count simply comes back as 0 and fails the assertion like any other.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     left join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public'
      and p.proname = 'p1_broker_update_showing'
      and a.privilege_type = 'EXECUTE'
      and r.rolname = 'authenticated'),
  1, 'A4: authenticated may execute it');

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     left join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public'
      and p.proname = 'p1_broker_update_showing'
      and a.privilege_type = 'EXECUTE'
      and (r.rolname = 'anon' or a.grantee = 0)),
  0, 'A5: neither anon nor PUBLIC may execute it');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · IDENTITY CONTROLS — the allow case cannot be the admin disjunct
-- ═══════════════════════════════════════════════════════════════════════════════

select is(public.has_role('a1206000-0000-4000-8000-000000000001', 'admin'), false,
          'B1: the owning broker holds no admin role');
select is(public.has_role('a1206000-0000-4000-8000-000000000002', 'admin'), false,
          'B2: the other broker holds no admin role');
select is(public.has_role('a1206000-0000-4000-8000-000000000003', 'admin'), false,
          'B3: the renter holds no admin role');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);
select is(public.is_admin(), false, 'B4: is_admin() is false as the owning broker');
select ok(
  (select bool_and(v = 'a1206000-0000-4000-8000-000000000011')
     from public.acting_landlord_ids() as t(v)),
  'B5: the owning broker resolves to exactly its own landlord profile');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000002', true);
select ok(
  (select bool_and(v = 'a1206000-0000-4000-8000-000000000012')
     from public.acting_landlord_ids() as t(v)),
  'B6: the other broker resolves to a different, disjoint profile');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · THE REQUESTS — committed by the canonical atomic RPC, not inserted by hand
-- ═══════════════════════════════════════════════════════════════════════════════

set local role service_role;

select lives_ok(format($q$
  select public.p1_schedule_tour_atomic(
    'b1206000-0000-4000-8000-000000000001', %L::uuid, %L, 'form',
    'san1206-renter@example.com', 'SAN1206 Renter', null, null::uuid,
    %L::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$,
  'a1206000-0000-4000-8000-000000000003', current_setting('san1206.idem1'),
  current_setting('san1206.t1')),
  'C1: request 1 commits through the canonical viewing RPC as the signed-in renter');

select lives_ok(format($q$
  select public.p1_schedule_tour_atomic(
    'b1206000-0000-4000-8000-000000000001', %L::uuid, %L, 'form',
    'san1206-renter@example.com', 'SAN1206 Renter', null, null::uuid,
    %L::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$,
  'a1206000-0000-4000-8000-000000000003', current_setting('san1206.idem2'),
  current_setting('san1206.t2')),
  'C2: request 2 commits through the same RPC on the same listing, a different day');

reset role;

select is(
  (select count(*)::int from public.leads where idempotency_key = current_setting('san1206.idem1')),
  1, 'C3: exactly one lead exists for request 1');
select is(
  (select count(*)::int from public.showings s join public.leads l on l.id = s.lead_id
    where l.idempotency_key = current_setting('san1206.idem1')),
  1, 'C4: exactly one showing exists for request 1');
select is(
  (select count(*)::int from public.leads where idempotency_key = current_setting('san1206.idem2')),
  1, 'C5: exactly one lead exists for request 2');
select is(
  (select count(*)::int from public.showings s join public.leads l on l.id = s.lead_id
    where l.idempotency_key = current_setting('san1206.idem2')),
  1, 'C6: exactly one showing exists for request 2');

-- The renter really is the lead owner. Without this, every "the renter is refused" probe below
-- would be testing an unrelated user instead of the party the policy currently trusts.
select is(
  (select count(*)::int from public.leads
    where idempotency_key = current_setting('san1206.idem1')
      and user_id = 'a1206000-0000-4000-8000-000000000003'),
  1, 'C7: the renter is the lead owner, so the renter denial is the real policy case');

-- Capture the exact identifiers ONCE in the trusted session. Every denial below uses these
-- literals; re-resolving them under RLS would make the denial vacuous.
select set_config('san1206.lead1', l.id::text, false),
       set_config('san1206.showing1', s.id::text, false)
from public.leads l join public.showings s on s.lead_id = l.id
where l.idempotency_key = current_setting('san1206.idem1');

select set_config('san1206.lead2', l.id::text, false),
       set_config('san1206.showing2', s.id::text, false)
from public.leads l join public.showings s on s.lead_id = l.id
where l.idempotency_key = current_setting('san1206.idem2');

select is(
  (select status from public.showings where id = current_setting('san1206.showing1')::uuid),
  'scheduled', 'C8: request 1 starts life as scheduled');
select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing1')::uuid),
  current_setting('san1206.t1')::timestamptz, 'C9: request 1 starts at the requested instant');
select is(
  (select count(*)::int from public.showings
    where apartment_id = 'b1206000-0000-4000-8000-000000000001'),
  2, 'C10: two showings exist for the listing — the baseline the actions must never grow');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · CONFIRM — the owning broker moves request 1 to confirmed, on the same row
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select lives_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'confirm', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing1'), current_setting('san1206.t1')),
  'D1: the owning broker confirms the request');

select lives_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'confirm', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing1'), current_setting('san1206.t1')),
  'D2: replaying the identical confirm is a safe no-op, not an error');

reset role;

select is(
  (select status from public.showings where id = current_setting('san1206.showing1')::uuid),
  'confirmed', 'D3: the persisted status is confirmed');
select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing1')::uuid),
  current_setting('san1206.t1')::timestamptz, 'D4: confirming did not move the appointment time');
select is(
  (select count(*)::int from public.showings
    where lead_id = current_setting('san1206.lead1')::uuid),
  1, 'D5: confirming and its replay produced exactly one showing — never a duplicate');

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · RESCHEDULE — the same unconfirmed row moves 2:00 PM → 3:00 PM
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select lives_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'scheduled', %L::timestamptz, %L::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t2'),
     current_setting('san1206.t3')),
  'E1: the owning broker reschedules the still-unconfirmed request');

reset role;

select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing2')::uuid),
  current_setting('san1206.t3')::timestamptz, 'E2: the persisted time is the new instant');
select is(
  (select id from public.showings where id = current_setting('san1206.showing2')::uuid),
  current_setting('san1206.showing2')::uuid,
  'E3: the showing UUID is unchanged — reschedule rewrote the row, it did not replace it');
select is(
  (select status from public.showings where id = current_setting('san1206.showing2')::uuid),
  'scheduled',
  'E4: rescheduling leaves the status scheduled — the broker UI reads it as Requested');
select is(
  (select count(*)::int from public.showings
    where lead_id = current_setting('san1206.lead2')::uuid),
  1, 'E5: rescheduling produced no second showing');

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · STALE EXPECTATION — an action based on a superseded view must conflict
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'scheduled', %L::timestamptz, %L::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t2'),
     current_setting('san1206.t4')),
  'P1206', NULL, 'F1: a reschedule based on the superseded time is refused deterministically');

reset role;

select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing2')::uuid),
  current_setting('san1206.t3')::timestamptz,
  'F2: the newer outcome survived — a stale action cannot roll it back');
select is(
  (select count(*)::int from public.showings
    where lead_id = current_setting('san1206.lead2')::uuid),
  1, 'F3: the refused action created nothing');

-- ═══════════════════════════════════════════════════════════════════════════════
-- G · INVALID NEW TIME — rejected rather than persisted
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'scheduled', %L::timestamptz, '2020-01-01 12:00:00+00'::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t3')),
  '22023', NULL, 'G1: a reschedule into the past is refused');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t3')),
  '22023', NULL, 'G2: a reschedule with no target time is refused');

reset role;

select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing2')::uuid),
  current_setting('san1206.t3')::timestamptz,
  'G3: neither refused reschedule moved the still-requested appointment');

-- ═══════════════════════════════════════════════════════════════════════════════
-- H · CANCEL — a confirmed appointment may still be declined, and replay stays safe
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select lives_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'confirmed', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing1'), current_setting('san1206.t1')),
  'H1: the owning broker cancels the confirmed request');

select lives_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'confirmed', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing1'), current_setting('san1206.t1')),
  'H2: replaying the identical cancel is a safe no-op');

reset role;

select is(
  (select status from public.showings where id = current_setting('san1206.showing1')::uuid),
  'cancelled', 'H3: the persisted status is cancelled');
select is(
  (select count(*)::int from public.showings
    where lead_id = current_setting('san1206.lead1')::uuid),
  1, 'H4: cancelling and its replay created nothing');

-- ═══════════════════════════════════════════════════════════════════════════════
-- I · THE RENTER — can see the booking, must not be able to rewrite it.
--
-- This is the core RED case. Before the migration the renter passes
-- showings_update_visible via `l.user_id = auth.uid()`, and holds a table-level UPDATE grant,
-- so both probes below SUCCEED and the persisted row changes underneath the broker.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000003', true);

select is(
  (select count(*)::int from public.showings where id = current_setting('san1206.showing1')::uuid),
  1, 'I1: the renter is a party and can still SEE the booking (control)');

select throws_ok(format($q$
  update public.showings set status = 'no_show' where id = %L::uuid
$q$, current_setting('san1206.showing1')),
  '42501', NULL, 'I2: the renter cannot set the authoritative status directly');

select throws_ok(format($q$
  update public.showings set scheduled_at = %L::timestamptz where id = %L::uuid
$q$, current_setting('san1206.t4'), current_setting('san1206.showing1')),
  '42501', NULL, 'I3: the renter cannot move the authoritative time directly');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'confirm', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing1'), current_setting('san1206.t1')),
  '42501', NULL, 'I4: the renter cannot reach the same outcome through the broker RPC');
reset role;

select is(
  (select status from public.showings where id = current_setting('san1206.showing1')::uuid),
  'cancelled', 'I5: the persisted status is untouched by the renter');
select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing1')::uuid),
  current_setting('san1206.t1')::timestamptz, 'I6: the persisted time is untouched by the renter');

-- ═══════════════════════════════════════════════════════════════════════════════
-- J · AN UNRELATED BROKER — real inventory, still no authority here
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.showings where id = current_setting('san1206.showing2')::uuid),
  0, 'J1: the other broker cannot even read the booking (control)');

select throws_ok(format($q$
  update public.showings set status = 'completed' where id = %L::uuid
$q$, current_setting('san1206.showing2')),
  '42501', NULL, 'J2: the other broker cannot mutate it directly');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t3')),
  '42501', NULL, 'J3: the other broker cannot mutate it through the broker RPC');
reset role;

select is(
  (select status from public.showings where id = current_setting('san1206.showing2')::uuid),
  'scheduled', 'J4: the persisted status is untouched by the other broker');

-- ═══════════════════════════════════════════════════════════════════════════════
-- K · ANONYMOUS — no read, no write, no RPC
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

-- anon no longer holds SELECT at all, so this read is refused outright rather than filtered to
-- zero rows. Asserting the refusal is strictly stronger: a silent zero-row result is also what
-- a wrong-but-filtering policy produces, so it cannot distinguish "denied" from "bugged".
select throws_ok(format($q$
  select count(*) from public.showings where id = %L::uuid
$q$, current_setting('san1206.showing1')),
  '42501', NULL, 'K1: an anonymous caller cannot read the booking');

select throws_ok(format($q$
  update public.showings set status = 'completed' where id = %L::uuid
$q$, current_setting('san1206.showing2')),
  '42501', NULL, 'K2: an anonymous caller cannot mutate it directly');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t3')),
  '42501', NULL, 'K3: an anonymous caller cannot reach the broker RPC');
reset role;

select is(
  (select status from public.showings where id = current_setting('san1206.showing2')::uuid),
  'scheduled', 'K4: the persisted status is untouched by the anonymous caller');

-- ═══════════════════════════════════════════════════════════════════════════════
-- L · ADMIN — the deliberate, separate override that the broker case must not rely on
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000004', true);

select is(public.is_admin(), true, 'L1: is_admin() is true for the platform admin');

select lives_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'scheduled', %L::timestamptz, null::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t3')),
  'L2: the admin override path works through the same RPC');
reset role;

select is(
  (select status from public.showings where id = current_setting('san1206.showing2')::uuid),
  'cancelled', 'L3: the persisted status reflects the admin action');

-- ═══════════════════════════════════════════════════════════════════════════════
-- M · PRIVILEGE NARROWING — grants are the layer that makes the denials above structural
-- rather than a side effect of the row each probe happened to pick.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(not has_table_privilege('authenticated', 'public.showings', 'UPDATE'),
          'M1: authenticated holds no table-level UPDATE on showings');
select ok(not has_table_privilege('authenticated', 'public.showings', 'INSERT'),
          'M2: authenticated holds no table-level INSERT on showings');
select ok(not has_table_privilege('authenticated', 'public.showings', 'DELETE'),
          'M3: authenticated holds no table-level DELETE on showings');
select ok(not has_table_privilege('authenticated', 'public.showings', 'TRUNCATE'),
          'M4: authenticated holds no TRUNCATE — the grant RLS does not cover');
select ok(has_table_privilege('authenticated', 'public.showings', 'SELECT'),
          'M5: authenticated keeps the SELECT the broker dashboard reads through');
select ok(not has_table_privilege('anon', 'public.showings', 'SELECT'),
          'M6: anon holds no SELECT on showings');
select ok(not has_table_privilege('anon', 'public.showings', 'UPDATE'),
          'M7: anon holds no UPDATE on showings');

-- ═══════════════════════════════════════════════════════════════════════════════
-- N · INTEGRITY — nothing in this file created a showing, and a legal-looking
-- reschedule into an already-occupied day conflicts instead of raising a raw 23505.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from public.showings
    where apartment_id = 'b1206000-0000-4000-8000-000000000001'),
  2, 'N1: the listing still holds exactly the two original showings');

select is(
  (select count(distinct id)::int from public.showings
    where apartment_id = 'b1206000-0000-4000-8000-000000000001'),
  2, 'N2: and they are two distinct rows');

-- A second showing for the SAME lead on a different day is a legal state the create RPC
-- permits, so rescheduling onto that occupied day is reachable in production. The unique index
-- idx_showings_lead_apt_day makes it a unique_violation; the RPC must surface that as the same
-- deterministic conflict rather than an opaque 23505.
insert into public.showings (lead_id, apartment_id, scheduled_at, status)
values (current_setting('san1206.lead2')::uuid, 'b1206000-0000-4000-8000-000000000001',
        current_setting('san1206.t5')::timestamptz, 'scheduled');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'cancelled', %L::timestamptz, %L::timestamptz)
$q$, current_setting('san1206.showing2'), current_setting('san1206.t3'),
     current_setting('san1206.t5')),
  'P1206', NULL, 'N3: rescheduling onto a day the same lead already occupies conflicts deterministically');
reset role;

select is(
  (select scheduled_at from public.showings where id = current_setting('san1206.showing2')::uuid),
  current_setting('san1206.t3')::timestamptz,
  'N4: the refused collision left the appointment where it was');

select is(
  (select count(*)::int from public.showings where lead_id = current_setting('san1206.lead2')::uuid),
  2, 'N5: the refused collision created no additional showing');

select * from finish();

rollback;
