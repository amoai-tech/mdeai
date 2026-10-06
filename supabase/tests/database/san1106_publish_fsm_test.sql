-- SAN-1106 · Publish FSM + workflow provenance + column/EXECUTE boundary.
--
-- WHAT THIS PROVES (extends the pre-existing 35-assertion file)
--   * the transition matrix and PR #160 moderation/requestability behavior still hold;
--   * a real transition stamps workflow_changed_by = auth.uid() and workflow_changed_at = now();
--   * a same-state retry performs no UPDATE: the whole workflow metadata snapshot is unchanged;
--   * an owning partner can no longer write workflow/security columns directly (column privilege),
--     so `active + approved + published` cannot be manufactured outside the FSM;
--   * an owning partner CAN still edit the content columns the product uses;
--   * the three wrappers are authenticated-only and the entry point is non-client-callable.
--
-- Boundary model
--   RLS controls rows; column privileges control columns. This file proves both. The SECURITY
--   DEFINER wrappers update workflow columns as the owner, so they are unaffected by the
--   authenticated column grants. Historical provenance is never backfilled: unknown stays NULL.
--
-- Run with: supabase test db

begin;

select plan(54);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — deterministic, transaction-owned, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════════

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
  ('b1106000-0000-4000-8000-000000000001', 'SAN1106 A draft', 'san1106-a-draft',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1106000-0000-4000-8000-000000000002', 'SAN1106 A review', 'san1106-a-review',
   'Laureles', 'inactive', 'pending', 'ready_for_review',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1106000-0000-4000-8000-000000000003', 'SAN1106 A skip', 'san1106-a-skip',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1106000-0000-4000-8000-000000000004', 'SAN1106 A published', 'san1106-a-published',
   'Laureles', 'active', 'approved', 'published',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1106000-0000-4000-8000-000000000005', 'SAN1106 A review 2', 'san1106-a-review-2',
   'Laureles', 'inactive', 'pending', 'ready_for_review',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1106000-0000-4000-8000-000000000006', 'SAN1106 A bypass', 'san1106-a-bypass',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1106000-0000-4000-8000-000000000011', '2099-12-31');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT — FSM entry point, authenticated-only wrappers, audit columns.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.transition_listing_workflow(uuid,text,text)') is not null,
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

select is(has_function_privilege('anon', 'public.request_listing_publish(uuid)', 'EXECUTE'),
  false, 'A4: anon cannot execute request_listing_publish');
select is(has_function_privilege('anon', 'public.publish_listing(uuid)', 'EXECUTE'),
  false, 'A5: anon cannot execute publish_listing');
select is(has_function_privilege('anon', 'public.pause_listing(uuid)', 'EXECUTE'),
  false, 'A6: anon cannot execute pause_listing');
select ok(
  has_function_privilege('authenticated', 'public.request_listing_publish(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.publish_listing(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.pause_listing(uuid)', 'EXECUTE'),
  'A7: authenticated may execute all three wrappers');
select ok(
  not has_function_privilege('anon', 'public.assert_listing_workflow_transition(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.assert_listing_workflow_transition(text,text)', 'EXECUTE'),
  'A8: the transition assertion helper is not client-callable');

select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='apartments'
             and column_name='workflow_changed_by' and is_nullable='YES'),
  'A9: apartments.workflow_changed_by exists and is nullable');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='apartments'
             and column_name='workflow_changed_at' and is_nullable='YES'),
  'A10: apartments.workflow_changed_at exists and is nullable');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · VALID TRANSITIONS + PROVENANCE.
-- ═══════════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.request_listing_publish('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B1: draft → ready_for_review is accepted');
select is(
  (select listing_workflow_status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'ready_for_review', 'B2: draft → ready_for_review set the workflow state');
select ok(
  (select ready_for_review_at is not null from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'B3: draft → ready_for_review recorded ready_for_review_at');

select lives_ok(
  $$select public.publish_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B4: ready_for_review → published is accepted');
select is(
  (select listing_workflow_status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'published', 'B5: ready_for_review → published set the workflow state');
select is(
  (select status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'active', 'B6: publishing sets status active');
select is(
  (select moderation_status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'approved', 'B7: SAN-1106 — publishing records moderation approval');
select ok(
  (select published_at is not null from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'B8: publishing recorded published_at');
select is(
  (select published_by from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'a1106000-0000-4000-8000-000000000001'::uuid, 'B9: publishing recorded published_by');
select ok(
  (select landlord_id is not null and status='active' and moderation_status='approved'
      and listing_workflow_status='published'
   from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'B10: the published listing satisfies the full renter requestability contract');

select lives_ok(
  $$select public.pause_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B11: published → paused is accepted');
select is(
  (select status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'inactive', 'B12: pausing sets status inactive');
select ok(
  (select paused_at is not null from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'B13: pausing recorded paused_at');
select is(
  (select moderation_status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'approved', 'B14: SAN-1106 — pausing does NOT erase moderation approval');
select lives_ok(
  $$select public.publish_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'B15: paused → published is accepted');
select is(
  (select status from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'active', 'B16: re-publishing reactivates the listing');
select is(
  (select workflow_changed_by from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'a1106000-0000-4000-8000-000000000001'::uuid,
  'B17: a real transition records auth.uid() as workflow_changed_by');
select ok(
  (select workflow_changed_at is not null from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  'B18: a real transition records workflow_changed_at');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · REJECTION CYCLE.
-- ═══════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000002'::uuid, 'rejected', 'photos are not usable')$$,
  'C1: ready_for_review → rejected is accepted with a reason');
select is(
  (select rejection_reason from public.apartments where id='b1106000-0000-4000-8000-000000000002'),
  'photos are not usable', 'C2: rejecting recorded the rejection reason');

update public.apartments set moderation_status='approved'
 where id='b1106000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.transition_listing_workflow(
      'b1106000-0000-4000-8000-000000000002'::uuid, 'draft')$$,
  'C3: rejected → draft is accepted');
select is(
  (select rejection_reason from public.apartments where id='b1106000-0000-4000-8000-000000000002'),
  null, 'C4: returning to draft clears the rejection reason');
select is(
  (select moderation_status from public.apartments where id='b1106000-0000-4000-8000-000000000002'),
  'pending', 'C5: SAN-1106 — returning to draft clears approval so it re-enters review');
select is(
  (select workflow_changed_by from public.apartments where id='b1106000-0000-4000-8000-000000000002'),
  'a1106000-0000-4000-8000-000000000001'::uuid,
  'C6: the rejection-cycle transitions recorded the actor');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · INVALID TRANSITIONS AND REFUSALS (+ no audit change on refusal).
-- ═══════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.transition_listing_workflow('b1106000-0000-4000-8000-000000000003'::uuid,'published')$$,
  '23514', null, 'D1: draft → published raises check_violation');
select throws_ok(
  $$select public.transition_listing_workflow('b1106000-0000-4000-8000-000000000004'::uuid,'draft')$$,
  '23514', null, 'D2: published → draft raises check_violation');
select throws_ok(
  $$select public.transition_listing_workflow('b1106000-0000-4000-8000-000000000005'::uuid,'rejected')$$,
  '23514', null, 'D3: rejecting without a reason raises check_violation');
select throws_ok(
  $$select public.transition_listing_workflow('b1106000-0000-4000-8000-000000000099'::uuid,'published')$$,
  'P0002', null, 'D4: an unknown apartment raises no_data_found');

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.transition_listing_workflow('b1106000-0000-4000-8000-000000000005'::uuid,'published')$$,
  '42501', null, 'D5: a foreign broker raises insufficient_privilege');
select is(
  (select moderation_status from public.apartments where id='b1106000-0000-4000-8000-000000000005'),
  'pending', 'D6: the refused transition left moderation unapproved');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.transition_listing_workflow('b1106000-0000-4000-8000-000000000005'::uuid,'published')$$,
  '42501', null, 'D7: an unauthenticated caller raises insufficient_privilege');
select is(
  (select workflow_changed_by from public.apartments where id='b1106000-0000-4000-8000-000000000005'),
  null, 'D8: a refused transition records no workflow actor');

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · DIRECT WORKFLOW WRITES ARE DENIED (column privilege).
-- ═══════════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$update public.apartments set listing_workflow_status='published' where id='b1106000-0000-4000-8000-000000000006'$$,
  '42501', null, 'E1: the owner cannot write listing_workflow_status directly');
select throws_ok(
  $$update public.apartments set status='active' where id='b1106000-0000-4000-8000-000000000006'$$,
  '42501', null, 'E2: the owner cannot write status directly');
select throws_ok(
  $$update public.apartments set moderation_status='approved' where id='b1106000-0000-4000-8000-000000000006'$$,
  '42501', null, 'E3: the owner cannot write moderation_status directly');
select throws_ok(
  $$update public.apartments set published_by='a1106000-0000-4000-8000-000000000001' where id='b1106000-0000-4000-8000-000000000006'$$,
  '42501', null, 'E4: the owner cannot write published_by directly');
select throws_ok(
  $$update public.apartments set workflow_changed_by='a1106000-0000-4000-8000-000000000001' where id='b1106000-0000-4000-8000-000000000006'$$,
  '42501', null, 'E5: the owner cannot write the audit actor directly');

reset role;
select is(
  (select listing_workflow_status||'/'||status||'/'||moderation_status
   from public.apartments where id='b1106000-0000-4000-8000-000000000006'),
  'draft/inactive/pending',
  'E6: the denied direct writes left the row exactly as it was');

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$update public.apartments set listing_workflow_status='published' where id='b1106000-0000-4000-8000-000000000005'$$,
  '42501', null, 'E7: a foreign broker is denied the workflow write too');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · LEGITIMATE CONTENT EDITING STILL WORKS.
-- ═══════════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', 'a1106000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok($$
  update public.apartments
     set address = 'Calle 10 #40-20', price_monthly = 3800000,
         images = array['https://example.com/a.jpg'],
         metadata = '{"place_id":"ChIJabc123"}'::jsonb
   where id = 'b1106000-0000-4000-8000-000000000006'
$$, 'F1: the owner can still edit partner-editable content columns');

reset role;
select is(
  (select address from public.apartments where id='b1106000-0000-4000-8000-000000000006'),
  'Calle 10 #40-20', 'F2: the content edit persisted');
select is(
  (select listing_workflow_status||'/'||status||'/'||moderation_status
   from public.apartments where id='b1106000-0000-4000-8000-000000000006'),
  'draft/inactive/pending', 'F3: the content edit did not change workflow state');

-- ═══════════════════════════════════════════════════════════════════════════════
-- G · SAME-STATE RETRY IS A TRUE NO-OP.
-- ═══════════════════════════════════════════════════════════════════════════════

create temporary table san1106_snapshot as
  select listing_workflow_status, published_at, published_by, paused_at,
         ready_for_review_at, workflow_changed_by, workflow_changed_at, updated_at
    from public.apartments where id='b1106000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.publish_listing('b1106000-0000-4000-8000-000000000001'::uuid)$$,
  'G1: a same-state publish call is accepted (already published)');

select is(
  (select row(listing_workflow_status, published_at, published_by, paused_at,
              ready_for_review_at, workflow_changed_by, workflow_changed_at, updated_at)::text
     from public.apartments where id='b1106000-0000-4000-8000-000000000001'),
  (select row(listing_workflow_status, published_at, published_by, paused_at,
              ready_for_review_at, workflow_changed_by, workflow_changed_at, updated_at)::text
     from san1106_snapshot),
  'G2: same-state retry leaves the entire workflow metadata snapshot unchanged');

select * from finish();
rollback;
