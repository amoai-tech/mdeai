-- SAN-1106 · Publish state machine + audit columns — regression proof.
--
-- The FSM itself is already installed (20260617022518_ptr_rentals_publish_fsm.sql) and this file
-- does not change it. It proves the transition matrix the task enumerates, plus the SAN-1106
-- correction in 20260929120000_san1106_publish_sets_moderation_approved.sql, plus the
-- boundary question the task flagged as significant.
--
-- Why the moderation assertions are here at all
-- ---------------------------------------------
-- Before SAN-1106 nothing in the product ever wrote `moderation_status = 'approved'`. Because
-- `isRentalRequestable()` requires owner + active + approved + published, an owner-created listing
-- could never become requestable. The publish transition now records approval, so this file pins
-- that behaviour.
--
-- Boundary answer (SAN-1106 Task 1, the "significant" gap)
-- -------------------------------------------------------
-- Direct column writes are **not** blocked. `apartments_update_broker` allows an owning broker to
-- UPDATE its own row, and no trigger enforces the FSM. So for the *workflow label* the FSM is an
-- honour-system boundary — section E proves it rather than assuming it.
--
-- The important half is the consequence: a direct write bypasses the function, so it does **not**
-- record moderation approval, and a bypassed row is therefore not requestable. The FSM is the only
-- route to requestability, which makes the boundary fail-closed for the thing that actually
-- matters. Section E asserts both halves.
--
-- No shared SQL fixture harness exists in supabase/tests (all 16 files build fixtures inline), so
-- this follows the established inline pattern used by san1054 and san1349. It does not invent a
-- new fixture system: same auth.users → landlord_profiles → apartments chain, same
-- `set_config('request.jwt.claim.sub', ...)` identity simulation, transaction-owned and rolled back.

begin;

select plan(35);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — deterministic, transaction-owned, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════════

-- landlord_profiles.user_id is FK → auth.users(id), so brokers need real auth rows.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1106000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1106-broker-a@example.com',
   extensions.crypt('san1106-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1106000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1106-broker-b@example.com',
   extensions.crypt('san1106-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1106000-0000-4000-8000-000000000011', 'a1106000-0000-4000-8000-000000000001',
   'SAN1106 Broker A', 'approved'),
  ('a1106000-0000-4000-8000-000000000012', 'a1106000-0000-4000-8000-000000000002',
   'SAN1106 Broker B', 'approved');

insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_to)
values
  -- Walk 1: the full valid chain.
  ('b1106000-0000-4000-8000-000000000001', 'SAN1106 A draft', 'san1106-a-draft',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  -- Walk 2: the rejection cycle.
  ('b1106000-0000-4000-8000-000000000002', 'SAN1106 A review', 'san1106-a-review',
   'Laureles', 'inactive', 'pending', 'ready_for_review',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  -- Invalid transition: draft → published.
  ('b1106000-0000-4000-8000-000000000003', 'SAN1106 A skip', 'san1106-a-skip',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  -- Invalid transition: published → draft.
  ('b1106000-0000-4000-8000-000000000004', 'SAN1106 A published', 'san1106-a-published',
   'Laureles', 'active', 'approved', 'published',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  -- Non-owner and reject-without-reason target.
  ('b1106000-0000-4000-8000-000000000005', 'SAN1106 A review 2', 'san1106-a-review-2',
   'Laureles', 'inactive', 'pending', 'ready_for_review',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  -- Direct-write boundary probe.
  ('b1106000-0000-4000-8000-000000000006', 'SAN1106 A bypass', 'san1106-a-bypass',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT — the FSM entry point and its public wrappers exist, and the entry
--     point itself is not exposed to `authenticated` (the wrappers are the API).
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  to_regprocedure('public.transition_listing_workflow(uuid,text,text)') is not null,
  'A1: transition_listing_workflow(uuid, text, text) exists');

select ok(
  to_regprocedure('public.publish_listing(uuid)') is not null
  and to_regprocedure('public.pause_listing(uuid)') is not null
  and to_regprocedure('public.request_listing_publish(uuid)') is not null,
  'A2: all three public wrappers exist');

select ok(
  not has_function_privilege('authenticated',
    'public.transition_listing_workflow(uuid,text,text)', 'EXECUTE'),
  'A3: authenticated cannot call the FSM entry point directly');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · VALID TRANSITIONS — the full chain, with its audit columns.
-- ═══════════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.request_listing_publish('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B1: draft → ready_for_review is accepted');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'ready_for_review', 'B2: draft → ready_for_review set the workflow state');

select ok(
  (select ready_for_review_at is not null from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'B3: draft → ready_for_review recorded ready_for_review_at');

select lives_ok(
  $$select public.publish_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B4: ready_for_review → published is accepted');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'published', 'B5: ready_for_review → published set the workflow state');

select is(
  (select status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'active', 'B6: publishing sets status active');

select is(
  (select moderation_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'approved', 'B7: SAN-1106 — publishing records moderation approval');

select ok(
  (select published_at is not null from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'B8: publishing recorded published_at');

select is(
  (select published_by from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'a1106000-0000-4000-8000-000000000001'::uuid, 'B9: publishing recorded published_by');

select ok(
  (select landlord_id is not null
      and status = 'active'
      and moderation_status = 'approved'
      and listing_workflow_status = 'published'
   from public.apartments where id = 'b1106000-0000-4000-8000-000000000001'),
  'B10: the published listing satisfies the full renter requestability contract');

select lives_ok(
  $$select public.pause_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B11: published → paused is accepted');

select is(
  (select status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'inactive', 'B12: pausing sets status inactive');

select ok(
  (select paused_at is not null from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'B13: pausing recorded paused_at');

select is(
  (select moderation_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'approved', 'B14: SAN-1106 — pausing does NOT erase moderation approval');

select lives_ok(
  $$select public.publish_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B15: paused → published is accepted');

select is(
  (select status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000001'),
  'active', 'B16: re-publishing reactivates the listing');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · REJECTION CYCLE — ready_for_review → rejected → draft.
-- ═══════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000002'::uuid, 'rejected', 'photos are not usable')$$,
  'C1: ready_for_review → rejected is accepted with a reason');

select is(
  (select rejection_reason from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000002'),
  'photos are not usable', 'C2: rejecting recorded the rejection reason');

-- Force the state the FSM cannot reach (published → rejected is illegal and no wrapper rejects),
-- so the defensive branch is exercised rather than assumed unreachable.
update public.apartments
   set moderation_status = 'approved'
 where id = 'b1106000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000002'::uuid, 'draft')$$,
  'C3: rejected → draft is accepted');

select is(
  (select rejection_reason from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000002'),
  null, 'C4: returning to draft clears the rejection reason');

select is(
  (select moderation_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000002'),
  'pending', 'C5: SAN-1106 — returning to draft clears approval so it re-enters review');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · INVALID TRANSITIONS AND REFUSALS.
-- ═══════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000003'::uuid, 'published')$$,
  '23514', null, 'D1: draft → published raises check_violation');

select throws_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000004'::uuid, 'draft')$$,
  '23514', null, 'D2: published → draft raises check_violation');

select throws_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000005'::uuid, 'rejected')$$,
  '23514', null, 'D3: rejecting without a reason raises check_violation');

select throws_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000099'::uuid, 'published')$$,
  'P0002', null, 'D4: an unknown apartment raises no_data_found');

-- Non-owner. Section C of san1054 covers the wrapper ACLs; this proves the FSM entry point
-- refuses a foreign broker on the ownership check, and that the refusal changes nothing.
select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000005'::uuid, 'published')$$,
  '42501', null, 'D5: a foreign broker raises insufficient_privilege');

select is(
  (select moderation_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000005'),
  'pending', 'D6: the refused transition left moderation unapproved');

-- No JWT at all.
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000005'::uuid, 'published')$$,
  '42501', null, 'D7: an unauthenticated caller raises insufficient_privilege');

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · BOUNDARY — direct column writes are not blocked, but they do not grant
--     requestability either. This is the answer to the task's "significant" gap.
-- ═══════════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000001', true);
set local role authenticated;

with upd as (
  update public.apartments
     set listing_workflow_status = 'published', status = 'active'
   where id = 'b1106000-0000-4000-8000-000000000006'
   returning 1
)
select is((select count(*)::int from upd), 1,
  'E1: an owning broker CAN write listing_workflow_status directly — the FSM is not trigger-enforced');

reset role;

select is(
  (select moderation_status from public.apartments
    where id = 'b1106000-0000-4000-8000-000000000006'),
  'pending', 'E2: the direct write bypassed approval, because only the transition records it');

select ok(
  not (select landlord_id is not null
         and status = 'active'
         and moderation_status = 'approved'
         and listing_workflow_status = 'published'
       from public.apartments where id = 'b1106000-0000-4000-8000-000000000006'),
  'E3: a bypassed publish is NOT requestable — the honest bypass fails closed');

-- And the same direct write by a foreign broker is filtered by RLS, silently.
select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000002', true);
set local role authenticated;

with upd as (
  update public.apartments
     set listing_workflow_status = 'published'
   where id = 'b1106000-0000-4000-8000-000000000005'
   returning 1
)
select is((select count(*)::int from upd), 0,
  'E4: a foreign broker direct write touches zero rows (RLS filters silently)');

reset role;
select set_config('request.jwt.claim.sub', '', true);

select * from finish();
rollback;
