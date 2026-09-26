-- SAN-1054 · Gate 1 — the database, not the model, is the listing-mutation boundary
--
-- WHAT THIS LOCKS IN
-- A broker may drive the listing lifecycle only for apartments it owns through the
-- canonical chain: auth.uid() → landlord_profiles.user_id → apartments.landlord_id.
-- Foreign brokers and anonymous callers are refused, and a refusal must leave durable
-- state byte-for-byte unchanged.
--
-- WHY GATE 1 EXISTS EVEN THOUGH IT PASSES TODAY
-- `transition_listing_workflow` already raises 42501 for a foreign or anonymous caller
-- (20260617022518_ptr_rentals_publish_fsm.sql). That boundary is correct but untested,
-- so a future migration could delete it silently. Gate 1 converts it into a permanent
-- regression. The value here is the lock, not a bug find.
--
-- THREE MEASURED DISTINCTIONS — each one would be a false green if ignored:
--
--   1. RPC vs direct table. The RPC path RAISES 42501. The direct apartments UPDATE path
--      is filtered by RLS SILENTLY — zero rows touched, no error. Using throws_ok on the
--      direct path would assert nothing.
--
--   2. Observation must run OUTSIDE the tested role. `apartments_select_broker_or_catalog`
--      lets any authenticated user see status IN ('active','booked'). So a state assertion
--      issued while still `set local role authenticated` as Broker B cannot see Broker A's
--      INACTIVE listings and reads NULL — which looks exactly like data loss but is RLS
--      working correctly. Every post-state assertion below therefore runs after `reset role`.
--
--   3. A control is mandatory. Broker A publishing its own listing must SUCCEED. Without
--      the controls in section F, a system that refused every caller would pass sections B–E.
--
-- NOT ASSERTED HERE — SAN-1349 handoff
-- The viewing RPC predicate is `status = 'active'` plus the availability window. It does
-- NOT require `landlord_id IS NOT NULL`, `listing_workflow_status = 'published'`, or
-- `moderation_status = 'approved'`. Unowned active listings are therefore requestable
-- today, which is the SAN-1349 P0. That fix and its regression belong to SAN-1349; this
-- file records the gap with todo() so it stays visible without blocking SAN-1054's gate.
--
-- Run with: supabase test db

begin;

select plan(39);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — deterministic, transaction-owned, rolled back at the end.
--
-- Two brokers, each with a landlord profile, plus four listings: three owned by Broker A
-- in the three lifecycle states the transitions need, and one active but unowned listing
-- standing in for the SAN-1349 gap. The auth.users insert fires on_auth_user_created →
-- public.handle_new_user(), which swallows its own errors, so it cannot break the fixture.
-- ═══════════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1054000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1054-broker-a@example.com', '', now(), now(), now()),
  ('a1054000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1054-broker-b@example.com', '', now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1054000-0000-4000-8000-000000000011', 'a1054000-0000-4000-8000-000000000001',
   'SAN1054 Broker A', 'approved'),
  ('a1054000-0000-4000-8000-000000000012', 'a1054000-0000-4000-8000-000000000002',
   'SAN1054 Broker B', 'approved');

insert into public.apartments (id, title, slug, neighborhood, status, landlord_id,
                               listing_workflow_status, available_to)
values
  -- owned by A, inactive, ready to publish
  ('a1054000-0000-4000-8000-000000000021', 'SAN1054 A ready', 'san1054-a-ready', 'Laureles',
   'inactive', 'a1054000-0000-4000-8000-000000000011', 'ready_for_review', '2099-12-31'),
  -- owned by A, active, published, pausable
  ('a1054000-0000-4000-8000-000000000022', 'SAN1054 A published', 'san1054-a-published', 'Laureles',
   'active', 'a1054000-0000-4000-8000-000000000011', 'published', '2099-12-31'),
  -- owned by A, inactive, draft, publish-requestable
  ('a1054000-0000-4000-8000-000000000023', 'SAN1054 A draft', 'san1054-a-draft', 'Laureles',
   'inactive', 'a1054000-0000-4000-8000-000000000011', 'draft', '2099-12-31'),
  -- active, published, and UNOWNED — the SAN-1349 gap, not a SAN-1054 boundary
  ('a1054000-0000-4000-8000-000000000024', 'SAN1054 unowned active', 'san1054-unowned', 'Laureles',
   'active', null, 'published', '2099-12-31');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT — the ACL shape that makes the behavioural results meaningful.
-- Set-based on purpose: these fail if a later migration re-grants EXECUTE or flips a
-- function to SECURITY DEFINER, which would change who the ownership check sees.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  has_function_privilege('authenticated',
    to_regprocedure('public.transition_listing_workflow(uuid,text,text)'), 'EXECUTE'),
  false, 'A: authenticated cannot call transition_listing_workflow directly');

select is(
  has_function_privilege('anon',
    to_regprocedure('public.transition_listing_workflow(uuid,text,text)'), 'EXECUTE'),
  false, 'A: anon cannot call transition_listing_workflow directly');

select is(
  (select p.prosecdef from pg_proc p
    where p.oid = to_regprocedure('public.transition_listing_workflow(uuid,text,text)')),
  false, 'A: transition_listing_workflow is SECURITY INVOKER (explicit check governs)');

select is(
  has_function_privilege('authenticated',
    to_regprocedure('public.publish_listing(uuid)'), 'EXECUTE'),
  true, 'A: authenticated may call publish_listing');

select is(
  has_function_privilege('authenticated',
    to_regprocedure('public.pause_listing(uuid)'), 'EXECUTE'),
  true, 'A: authenticated may call pause_listing');

select is(
  has_function_privilege('authenticated',
    to_regprocedure('public.request_listing_publish(uuid)'), 'EXECUTE'),
  true, 'A: authenticated may call request_listing_publish');

-- MEASURED ACL GAP — real, but NOT a vulnerability. Recorded with todo(), not asserted
-- as a pass, so tightening the ACL later flips these green on purpose.
--
-- 20260617022518 revoked EXECUTE from PUBLIC on these three wrappers but never from
-- `anon`, so Supabase's default `anon=X` grant survived. The same migration DID revoke
-- `anon` explicitly on transition_listing_workflow, which is why that one is clean.
-- `REVOKE ... FROM PUBLIC` does not remove an explicit role grant — that asymmetry is
-- the whole finding.
--
-- Impact is bounded: anon can reach the wrapper but is still refused at runtime by the
-- `auth.uid() IS NULL` check inside transition_listing_workflow, proven behaviourally in
-- section C below. So this is defence-in-depth debt, not an open door. It belongs in the
-- SAN-1284 privileged-RPC ACL family rather than in a Gate 1 code change.
select todo(3, 'SAN-1054 Gate 1: anon retains EXECUTE on the lifecycle wrappers; runtime check still denies');

select is(
  has_function_privilege('anon', to_regprocedure('public.publish_listing(uuid)'), 'EXECUTE'),
  false, 'A: anon may not call publish_listing');

select is(
  has_function_privilege('anon', to_regprocedure('public.pause_listing(uuid)'), 'EXECUTE'),
  false, 'A: anon may not call pause_listing');

select is(
  has_function_privilege('anon', to_regprocedure('public.request_listing_publish(uuid)'), 'EXECUTE'),
  false, 'A: anon may not call request_listing_publish');

select is(
  (select p.prosecdef from pg_proc p
    where p.oid = to_regprocedure('public.broker_owns_apartment(uuid)')),
  false, 'A: broker_owns_apartment is SECURITY INVOKER (no privilege escalation)');

select is(
  (select p.proconfig::text from pg_proc p
    where p.oid = to_regprocedure('public.broker_owns_apartment(uuid)')),
  '{search_path=public}', 'A: broker_owns_apartment pins search_path');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · FOREIGN BROKER — real role, real JWT claim, real refusal (SQLSTATE 42501),
-- then state re-read AFTER reset role (see distinction 2 in the header).
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.publish_listing('a1054000-0000-4000-8000-000000000021'::uuid)$$,
  '42501', null, 'B: Broker B DENIED publish on Broker A listing');

select throws_ok(
  $$select public.pause_listing('a1054000-0000-4000-8000-000000000022'::uuid)$$,
  '42501', null, 'B: Broker B DENIED pause on Broker A listing');

select throws_ok(
  $$select public.request_listing_publish('a1054000-0000-4000-8000-000000000023'::uuid)$$,
  '42501', null, 'B: Broker B DENIED publish request on Broker A listing');

reset role;

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'ready_for_review', 'B: Broker B publish refusal left workflow unchanged');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000022'),
  'published', 'B: Broker B pause refusal left workflow unchanged');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000023'),
  'draft', 'B: Broker B publish-request refusal left workflow unchanged');

select is(
  (select count(*)::int from public.apartments
    where landlord_id = 'a1054000-0000-4000-8000-000000000011'
      and published_by is null and paused_at is null),
  3, 'B: no A-owned listing was published or paused by the foreign broker');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · ANONYMOUS — no JWT at all. The ACL refuses before any ownership logic runs.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.publish_listing('a1054000-0000-4000-8000-000000000021'::uuid)$$,
  '42501', null, 'C: anon DENIED publish_listing');

select throws_ok(
  $$select public.pause_listing('a1054000-0000-4000-8000-000000000022'::uuid)$$,
  '42501', null, 'C: anon DENIED pause_listing');

select throws_ok(
  $$select public.request_listing_publish('a1054000-0000-4000-8000-000000000023'::uuid)$$,
  '42501', null, 'C: anon DENIED request_listing_publish');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · DIRECT TABLE PATH — the bypass a model would take if it ignored the RPCs.
-- RLS filters UPDATE silently, so the proof is "zero rows touched, no error".
-- The data-modifying CTE must be top level; PostgreSQL rejects it nested in a
-- scalar subquery, which is why each write is its own statement.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000002', true);

with upd as (
  update public.apartments set listing_workflow_status = 'published'
  where id = 'a1054000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from upd), 0,
          'D: Broker B direct UPDATE of workflow touched zero rows (RLS filters silently)');

with upd as (
  update public.apartments set landlord_id = 'a1054000-0000-4000-8000-000000000012'
  where id = 'a1054000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from upd), 0,
          'D: Broker B cannot seize ownership by direct landlord_id UPDATE');

reset role;

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'ready_for_review', 'D: workflow unchanged after direct UPDATE attempt');

select is(
  (select landlord_id from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'a1054000-0000-4000-8000-000000000011'::uuid, 'D: listing still owned by Broker A');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

with upd as (
  update public.apartments set status = 'active'
  where id = 'a1054000-0000-4000-8000-000000000021'
  returning 1
)
select is((select count(*)::int from upd), 0, 'D: anon direct UPDATE touched zero rows');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · OWNERSHIP RESOLUTION — the helper agrees with the RPC, and an authenticated
-- user can only ever resolve its OWN landlord ids.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000002', true);

select is(
  public.broker_owns_apartment('a1054000-0000-4000-8000-000000000021'::uuid),
  false, 'E: Broker B does not own Broker A listing');

select is(
  public.broker_owns_apartment('a1054000-0000-4000-8000-000000000024'::uuid),
  false, 'E: Broker B does not own the unowned listing');

select is(
  -- acting_landlord_ids() RETURNS SETOF uuid, so the output column is named after the
  -- function; it must be aliased before it can be filtered.
  (select count(*)::int from public.acting_landlord_ids() as t(id)
    where id = 'a1054000-0000-4000-8000-000000000011'),
  0, 'E: Broker B cannot resolve Broker A landlord id');

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000001', true);

select is(
  public.broker_owns_apartment('a1054000-0000-4000-8000-000000000021'::uuid),
  true, 'E: Broker A owns its own listing (control)');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · CONTROLS — the boundary must not be a blanket denial. Broker A still works.
-- Broker A owns these rows, so RLS permits reading them back in place.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.publish_listing('a1054000-0000-4000-8000-000000000021'::uuid)$$,
  'F: Broker A may publish its own listing (control)');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'published', 'F: Broker A publish took effect');

select lives_ok(
  $$select public.pause_listing('a1054000-0000-4000-8000-000000000022'::uuid)$$,
  'F: Broker A may pause its own listing (control)');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000022'),
  'paused', 'F: Broker A pause took effect');

select lives_ok(
  $$select public.request_listing_publish('a1054000-0000-4000-8000-000000000023'::uuid)$$,
  'F: Broker A may request publish on its own listing (control)');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000023'),
  'ready_for_review', 'F: Broker A publish request took effect');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- G · SCOPE GUARD — this gate must not have narrowed the catalog read path.
-- The broker policies are additive by design.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'apartments'
      and policyname = 'apartments_select_broker_or_catalog'),
  1, 'G: apartments_select_broker_or_catalog still exists');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'apartments'
      and policyname = 'apartments_update_broker'),
  1, 'G: apartments_update_broker still exists');

-- ═══════════════════════════════════════════════════════════════════════════════
-- H · SAN-1349 HANDOFF — recorded, not asserted as a pass.
--
-- The viewing RPC accepts an active listing with landlord_id IS NULL, so a renter can
-- book a viewing for an apartment nobody owns and the lead strands. todo() keeps the gap
-- visible in the output without failing SAN-1054's gate. When SAN-1349 establishes real
-- ownership or removes unowned listings from active supply, this starts passing and the
-- todo() should be deleted.
-- ═══════════════════════════════════════════════════════════════════════════════

select todo(1, 'SAN-1349 handoff: unowned active listings must become non-requestable');

select is(
  (select count(*)::int from public.apartments
    where status = 'active' and landlord_id is null),
  0, 'H: no active listing is left without a real owner (owned by SAN-1349)');

select * from finish();
rollback;
