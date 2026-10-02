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
--   stale expected -> deterministic conflict (PT409); never overwrites a newer outcome
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

select plan(88);

-- Values live in session settings rather than psql client variables so this file stays plain
-- SQL: every restricted-session probe reads a value captured in the trusted session.
select set_config('san1206.idem1', 'san1206-fixture-request-0001', false),
       set_config('san1206.idem2', 'san1206-fixture-request-0002', false);

-- The two canonical instants the broker will act on. 19:00Z is 2:00 PM in Medellín.
select set_config('san1206.t1', '2099-11-20 19:00:00+00', false),
       set_config('san1206.t2', '2099-11-21 19:00:00+00', false),
       set_config('san1206.t3', '2099-11-21 20:00:00+00', false),
       set_config('san1206.t4', '2099-11-21 21:00:00+00', false),
       set_config('san1206.t5', '2099-11-22 19:00:00+00', false),
       set_config('san1206.t6', '2099-11-23 19:00:00+00', false),
       set_config('san1206.t7', '2099-11-24 19:00:00+00', false),
       set_config('san1206.t8', '2099-11-25 19:00:00+00', false),
       set_config('san1206.t9', '2099-11-26 19:00:00+00', false);

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
  'PT409', NULL, 'F1: a reschedule based on the superseded time is refused deterministically');

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
-- N · INTEGRITY — nothing here created a showing by accident, and a reschedule onto
-- a day the same renter already occupies reaches the real (lead, apartment,
-- Medellín day) uniqueness constraint and reads as a conflict.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from public.showings
    where apartment_id = 'b1206000-0000-4000-8000-000000000001'),
  2, 'N1: the listing still holds exactly the two original showings');

select is(
  (select count(distinct id)::int from public.showings
    where apartment_id = 'b1206000-0000-4000-8000-000000000001'),
  2, 'N2: and they are two distinct rows');

-- Genuine collision fixture: two SCHEDULED showings for the SAME lead on the SAME apartment,
-- on two distinct days (day A = t5, day B = t6). This is a legal state the create RPC itself
-- permits, so the broker reschedule below is reachable in production — unlike the earlier
-- cancelled row, whose PT409 came from the transition guard and never touched the index.
-- Inserted directly because the canonical create RPC is idempotent per identity.
insert into public.showings (id, lead_id, apartment_id, scheduled_at, status)
values
  ('c1206000-0000-4000-8000-000000000001', current_setting('san1206.lead2')::uuid,
   'b1206000-0000-4000-8000-000000000001', current_setting('san1206.t5')::timestamptz,
   'scheduled'),
  ('c1206000-0000-4000-8000-000000000002', current_setting('san1206.lead2')::uuid,
   'b1206000-0000-4000-8000-000000000001', current_setting('san1206.t6')::timestamptz,
   'scheduled');

-- Capture the row count BEFORE the refused action so N7 proves the failure added nothing,
-- rather than trusting that the table happens to look right afterwards.
select set_config(
  'san1206.lead2_before',
  (select count(*)::text from public.showings
    where lead_id = current_setting('san1206.lead2')::uuid),
  false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'scheduled', %L::timestamptz, %L::timestamptz)
$q$, 'c1206000-0000-4000-8000-000000000002',
     current_setting('san1206.t6'), current_setting('san1206.t5')),
  'PT409', 'another viewing already occupies that day for this renter and listing',
  'N3: moving B onto the day A occupies hits the uniqueness rule and conflicts deterministically');
reset role;

select is(
  (select scheduled_at from public.showings
    where id = 'c1206000-0000-4000-8000-000000000002'),
  current_setting('san1206.t6')::timestamptz,
  'N4: the refused collision left B on its original day');

select is(
  (select status from public.showings
    where id = 'c1206000-0000-4000-8000-000000000002'),
  'scheduled', 'N5: B is still the unanswered scheduled request');

select is(
  (select id from public.showings
    where id = 'c1206000-0000-4000-8000-000000000002'),
  'c1206000-0000-4000-8000-000000000002'::uuid,
  'N6: B kept the same UUID — the refused move rewrote no row');

select is(
  (select count(*)::int from public.showings
    where lead_id = current_setting('san1206.lead2')::uuid),
  current_setting('san1206.lead2_before')::int,
  'N7: the refused collision created no additional showing');

-- ═══════════════════════════════════════════════════════════════════════════════
-- O · CLOSED STATES — a terminal or already-answered visit cannot be re-decided by the
-- broker through the RPC. Each attempt asserts the failure AND the persisted row.
--
-- Three dedicated showings on three further days: one confirmed, one completed, one no_show.
-- ═══════════════════════════════════════════════════════════════════════════════

insert into public.showings (id, lead_id, apartment_id, scheduled_at, status)
values
  ('c1206000-0000-4000-8000-000000000003', current_setting('san1206.lead2')::uuid,
   'b1206000-0000-4000-8000-000000000001', current_setting('san1206.t7')::timestamptz,
   'confirmed'),
  ('c1206000-0000-4000-8000-000000000004', current_setting('san1206.lead2')::uuid,
   'b1206000-0000-4000-8000-000000000001', current_setting('san1206.t8')::timestamptz,
   'completed'),
  ('c1206000-0000-4000-8000-000000000005', current_setting('san1206.lead2')::uuid,
   'b1206000-0000-4000-8000-000000000001', current_setting('san1206.t9')::timestamptz,
   'no_show');

select set_config(
  'san1206.closed_before',
  (select count(*)::text from public.showings
    where lead_id = current_setting('san1206.lead2')::uuid),
  false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'completed', %L::timestamptz, null::timestamptz)
$q$, 'c1206000-0000-4000-8000-000000000004', current_setting('san1206.t8')),
  'PT409', 'a completed viewing cannot be cancelled',
  'O1: a completed viewing cannot be cancelled');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'cancel', 'no_show', %L::timestamptz, null::timestamptz)
$q$, 'c1206000-0000-4000-8000-000000000005', current_setting('san1206.t9')),
  'PT409', 'a no_show viewing cannot be cancelled',
  'O2: a no_show viewing cannot be cancelled');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'confirmed', %L::timestamptz, %L::timestamptz)
$q$, 'c1206000-0000-4000-8000-000000000003', current_setting('san1206.t7'),
     current_setting('san1206.t5')),
  'PT409', 'a confirmed viewing cannot be reschedule',
  'O3: a confirmed viewing cannot be moved to a new time here');

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'confirm', 'completed', %L::timestamptz, null::timestamptz)
$q$, 'c1206000-0000-4000-8000-000000000004', current_setting('san1206.t8')),
  'PT409', 'a completed viewing cannot be confirm',
  'O4: a completed viewing cannot be re-confirmed');
reset role;

select is(
  (select status from public.showings
    where id = 'c1206000-0000-4000-8000-000000000004'),
  'completed', 'O5: the completed viewing is still completed');
select is(
  (select scheduled_at from public.showings
    where id = 'c1206000-0000-4000-8000-000000000004'),
  current_setting('san1206.t8')::timestamptz,
  'O6: and its appointment time is untouched');

select is(
  (select status from public.showings
    where id = 'c1206000-0000-4000-8000-000000000005'),
  'no_show', 'O7: the no_show viewing is still no_show');
select is(
  (select scheduled_at from public.showings
    where id = 'c1206000-0000-4000-8000-000000000005'),
  current_setting('san1206.t9')::timestamptz,
  'O8: and its appointment time is untouched');

select is(
  (select status from public.showings
    where id = 'c1206000-0000-4000-8000-000000000003'),
  'confirmed', 'O9: the confirmed viewing is still confirmed');
select is(
  (select scheduled_at from public.showings
    where id = 'c1206000-0000-4000-8000-000000000003'),
  current_setting('san1206.t7')::timestamptz,
  'O10: and its appointment time is untouched');

select is(
  (select count(*)::int from public.showings
    where lead_id = current_setting('san1206.lead2')::uuid),
  current_setting('san1206.closed_before')::int,
  'O11: the four refused closed-state actions created nothing');

-- ═══════════════════════════════════════════════════════════════════════════════
-- P · RESCHEDULE AFTER A LATER ACTION — a reschedule retry is only a no-op while the
-- request is STILL Requested. Once a later action moved the status on (here a confirm),
-- the retry is stale and the state guard refuses it; it is not a silent success.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1206000-0000-4000-8000-000000000001', true);

select throws_ok(format($q$
  select public.p1_broker_update_showing(
    %L::uuid, 'reschedule', 'confirmed', %L::timestamptz, %L::timestamptz)
$q$, 'c1206000-0000-4000-8000-000000000003',
     current_setting('san1206.t7'), current_setting('san1206.t7')),
  'PT409', 'a confirmed viewing cannot be reschedule',
  'P1: a reschedule on a confirmed viewing is refused even when the time already holds');
reset role;

select is(
  (select status from public.showings where id = 'c1206000-0000-4000-8000-000000000003'),
  'confirmed', 'P2: the refused reschedule left the status confirmed');
select is(
  (select scheduled_at from public.showings where id = 'c1206000-0000-4000-8000-000000000003'),
  current_setting('san1206.t7')::timestamptz,
  'P3: the refused reschedule left the persisted time');
select is(
  (select id from public.showings where id = 'c1206000-0000-4000-8000-000000000003'),
  'c1206000-0000-4000-8000-000000000003'::uuid,
  'P4: the refused reschedule left the same UUID');
select is(
  (select count(*)::int from public.showings where lead_id = current_setting('san1206.lead2')::uuid),
  current_setting('san1206.closed_before')::int,
  'P5: the refused reschedule created no additional showing');

select * from finish();

rollback;
