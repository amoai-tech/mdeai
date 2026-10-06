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
-- SAN-1349 CLOSED THIS GAP
-- The viewing RPC predicate used to be `status = 'active'` plus the availability window, with
-- no owner / approved / published requirement, so unowned active listings were requestable.
-- SAN-1349 (supabase/migrations/20260927200924_san1349_enforce_owner_boundary.sql) hardened
-- that predicate and added the apartments_owner_required_when_published CHECK. Section H below
-- now asserts the closed invariant instead of recording it with todo(), and the full
-- owner/non-owner/anonymous matrix lives in san1349_broker_ownership_rls_test.sql.
--
-- Run with: supabase test db

begin;

select plan(61);

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
   'authenticated', 'authenticated', 'san1054-broker-a@example.com',
   extensions.crypt('san1054-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1054000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1054-broker-b@example.com',
   extensions.crypt('san1054-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1054000-0000-4000-8000-000000000011', 'a1054000-0000-4000-8000-000000000001',
   'SAN1054 Broker A', 'approved'),
  ('a1054000-0000-4000-8000-000000000012', 'a1054000-0000-4000-8000-000000000002',
   'SAN1054 Broker B', 'approved');

insert into public.apartments (id, title, slug, neighborhood, status, moderation_status,
                               landlord_id, listing_workflow_status, available_to)
values
  -- owned by A, inactive, ready to publish
  ('a1054000-0000-4000-8000-000000000021', 'SAN1054 A ready', 'san1054-a-ready', 'Laureles',
   'inactive', 'pending', 'a1054000-0000-4000-8000-000000000011', 'ready_for_review', '2099-12-31'),
  -- owned by A, active, published, pausable
  ('a1054000-0000-4000-8000-000000000022', 'SAN1054 A published', 'san1054-a-published', 'Laureles',
   'active', 'pending', 'a1054000-0000-4000-8000-000000000011', 'published', '2099-12-31'),
  -- owned by A, inactive, draft, publish-requestable
  ('a1054000-0000-4000-8000-000000000023', 'SAN1054 A draft', 'san1054-a-draft', 'Laureles',
   'inactive', 'pending', 'a1054000-0000-4000-8000-000000000011', 'draft', '2099-12-31'),
  -- active, published, and UNOWNED. moderation_status stays 'pending' so this row is NOT
  -- production-requestable and therefore cannot violate the SAN-1349 ownership CHECK
  -- (active + approved + published ⇒ landlord_id IS NOT NULL). It exists only so section E can
  -- assert that a broker resolves no landlord id for an unowned listing.
  ('a1054000-0000-4000-8000-000000000024', 'SAN1054 unowned active', 'san1054-unowned', 'Laureles',
   'active', 'pending', null, 'published', '2099-12-31');

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
-- SAN-1106 removed UPDATE on workflow/ownership columns, so these are now explicit
-- privilege refusals (42501) rather than rows filtered to zero by RLS.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$update public.apartments set listing_workflow_status = 'published'
    where id = 'a1054000-0000-4000-8000-000000000021'$$,
  '42501', null,
  'D: Broker B direct UPDATE of workflow is denied by column privilege');

select throws_ok(
  $$update public.apartments set landlord_id = 'a1054000-0000-4000-8000-000000000012'
    where id = 'a1054000-0000-4000-8000-000000000021'$$,
  '42501', null,
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

select throws_ok(
  $$update public.apartments set status = 'active'
    where id = 'a1054000-0000-4000-8000-000000000021'$$,
  '42501', null, 'D: anon direct UPDATE is denied at the privilege level');

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

-- Presence is not behaviour. Section D proved Broker B cannot write; these two prove the
-- SAME policies still permit what they are supposed to permit, so a policy that silently
-- narrowed to "deny everyone" could not pass this section as a scope guard.
--
-- 021 is active here because Broker A published it in section F, so the catalog branch
-- (`status IN ('active','booked')`) makes it visible to any authenticated user.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  1, 'G: Broker B can still SELECT Broker A active listing through the catalog');

reset role;

-- The legitimate write path must survive too: Broker A updating its own listing is the
-- control for the section D denial. available_to is used because it is not in
-- trg_enqueue_embed_apartment's column list, so this cannot enqueue an embedding job.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000001', true);

with upd as (
  update public.apartments set available_to = '2099-12-30'
  where id = 'a1054000-0000-4000-8000-000000000023'
  returning 1
)
select is((select count(*)::int from upd), 1,
          'G: Broker A can still directly UPDATE an owned listing (control)');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- H · SAN-1349 INVARIANT — the gap this file used to record with todo() is now closed.
--
-- SAN-1349 added the durable ownership CHECK and hardened the viewing RPC, so this is no
-- longer a handoff placeholder: it is a live assertion over the whole table. It is scoped by
-- predicate rather than by fixture id on purpose — a locally seeded demo catalogue is allowed
-- to exist, but nothing in active + approved + published production-requestable form may be
-- left without a canonical owner.
--
-- The full owner/non-owner/anonymous matrix and the RPC rejection cases live in
-- supabase/tests/database/san1349_broker_ownership_rls_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from public.apartments
    where status = 'active'
      and moderation_status = 'approved'
      and listing_workflow_status = 'published'
      and landlord_id is null),
  0, 'H: no production-requestable listing is left without a canonical owner');

select is(
  (select convalidated from pg_constraint
    where conrelid = 'public.apartments'::regclass
      and conname = 'apartments_owner_required_when_published'),
  true, 'H: the SAN-1349 ownership constraint is installed and validated');

-- ═══════════════════════════════════════════════════════════════════════════════
-- I · SAN-1106 — PUBLISH RECORDS MODERATION APPROVAL
--
-- Regression proof for the publish state machine correction in
-- 20260929120000_san1106_publish_sets_moderation_approved.sql.
--
-- Before that change nothing in the product ever wrote moderation_status = 'approved': the only
-- approved rows were migration-seeded (and ownerless) and the only owned rows came from owner
-- onboarding (and stayed pending). Since isRentalRequestable() requires owner + active + approved
-- + published, no owner-created listing could ever become requestable. These assertions pin the
-- corrected behaviour so it cannot silently regress.
--
-- Preconditions are re-established here rather than inherited from the sections above, so this
-- block does not depend on the accumulated state of earlier sections.
-- ═══════════════════════════════════════════════════════════════════════════════

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.apartments
   set listing_workflow_status = 'ready_for_review', status = 'inactive', moderation_status = 'pending'
 where id = 'a1054000-0000-4000-8000-000000000021';

update public.apartments
   set listing_workflow_status = 'draft', status = 'inactive', moderation_status = 'pending'
 where id = 'a1054000-0000-4000-8000-000000000023';

-- ── I.1 · the owning broker publishes: approval is recorded ────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.publish_listing('a1054000-0000-4000-8000-000000000021'::uuid)$$,
  'I1: Broker A publishes an owned ready_for_review listing');

select is(
  (select moderation_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'approved', 'I2: publishing records moderation approval');

select is(
  (select status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'active', 'I3: publishing activates the listing');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'published', 'I4: publishing reaches the published workflow state');

select ok(
  (select landlord_id is not null
      and status = 'active'
      and moderation_status = 'approved'
      and listing_workflow_status = 'published'
   from public.apartments
   where id = 'a1054000-0000-4000-8000-000000000021'),
  'I5: the published listing now satisfies the full renter requestability contract');

-- ── I.2 · pausing must NOT erase approval ─────────────────────────────────────
-- A paused listing has already been vetted; clearing approval would strand it behind a gate
-- nothing can re-open, because nothing else writes 'approved'.
select lives_ok(
  $$select public.pause_listing('a1054000-0000-4000-8000-000000000021'::uuid)$$,
  'I6: Broker A pauses the published listing');

select is(
  (select status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'inactive', 'I7: pausing deactivates the listing');

select is(
  (select listing_workflow_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'paused', 'I8: pausing reaches the paused workflow state');

select is(
  (select moderation_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'approved', 'I9: pausing does NOT erase moderation approval');

select lives_ok(
  $$select public.publish_listing('a1054000-0000-4000-8000-000000000021'::uuid)$$,
  'I10: Broker A re-publishes a paused listing');

select is(
  (select moderation_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'approved', 'I11: re-publishing keeps the listing approved');

select is(
  (select status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000021'),
  'active', 'I12: re-publishing reactivates the listing');

-- ── I.3 · a foreign broker cannot cause approval ──────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000001', true);

update public.apartments
   set listing_workflow_status = 'ready_for_review', status = 'inactive', moderation_status = 'pending'
 where id = 'a1054000-0000-4000-8000-000000000023';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.publish_listing('a1054000-0000-4000-8000-000000000023'::uuid)$$,
  '42501', null, 'I13: Broker B DENIED publish on Broker A listing');

reset role;

select is(
  (select moderation_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000023'),
  'pending', 'I14: a denied publish leaves moderation unapproved');

-- ── I.4 · a rejected listing returning to draft re-enters review ───────────────
-- published → rejected is not a legal transition and no public wrapper rejects, so the FSM cannot
-- reach an approved + rejected row. The state is forced directly to exercise the defensive branch:
-- if it ever becomes reachable, returning to draft must clear the earlier approval.
reset role;
select set_config('request.jwt.claim.sub', 'a1054000-0000-4000-8000-000000000001', true);

update public.apartments
   set listing_workflow_status = 'rejected', moderation_status = 'approved', rejection_reason = 'fixture'
 where id = 'a1054000-0000-4000-8000-000000000023';

select lives_ok(
  $$select public.transition_listing_workflow('a1054000-0000-4000-8000-000000000023'::uuid, 'draft')$$,
  'I15: rejected → draft is a legal transition');

select is(
  (select moderation_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000023'),
  'pending', 'I16: returning to draft clears approval so the listing re-enters review');

select is(
  (select rejection_reason from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000023'),
  null, 'I17: returning to draft clears the rejection reason');

-- ── I.5 · the SAN-1349 ownership CHECK now has teeth ──────────────────────────
-- This transition sets active + approved + published together, so
-- `apartments_owner_required_when_published` stops being unreachable dead code. An ownerless
-- listing can no longer be forced into the requestable shape by any path.
select throws_ok(
  $$update public.apartments
       set status = 'active', moderation_status = 'approved', listing_workflow_status = 'published'
     where id = 'a1054000-0000-4000-8000-000000000024'$$,
  '23514', null, 'I18: an ownerless listing cannot be forced into the requestable shape');

select is(
  (select moderation_status from public.apartments
    where id = 'a1054000-0000-4000-8000-000000000024'),
  'pending', 'I19: the refused write left the ownerless row unapproved');

reset role;
select set_config('request.jwt.claim.sub', '', true);

select * from finish();
rollback;
