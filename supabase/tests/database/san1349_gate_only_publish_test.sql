-- SAN-1349 · the canonical gate is the only way into 'published'.
--
-- Proves: the workflow FSM refuses the published target; publish_listing delegates
-- to the gated RPC and refuses an unevidenced listing; an evidenced listing
-- publishes; foreign/anonymous callers are refused; the other two wrappers still work.
--
-- Run with: supabase test db
begin;

select plan(14);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES
-- ═══════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1349000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1349-broker-a@example.com',
   extensions.crypt('san1349-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1349000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1349-broker-b@example.com',
   extensions.crypt('san1349-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values
  ('a1349000-0000-4000-8000-000000000011', 'a1349000-0000-4000-8000-000000000001',
   'SAN1349 Broker A', 'approved', now()),
  ('a1349000-0000-4000-8000-000000000012', 'a1349000-0000-4000-8000-000000000002',
   'SAN1349 Broker B', 'approved', now());

insert into public.apartments (id, title, slug, neighborhood, status, moderation_status,
                               listing_workflow_status, landlord_id, available_to)
values
  -- X: owned by A, draft, deliberately missing every launch-evidence fact.
  ('b1349000-0000-4000-8000-000000000001', 'SAN1349 unevidenced', 'san1349-x',
   'Laureles', 'inactive', 'pending', 'draft', 'a1349000-0000-4000-8000-000000000011', '2099-12-31'),
  -- Y: owned by A, draft, fully evidenced below.
  ('b1349000-0000-4000-8000-000000000002', 'SAN1349 evidenced', 'san1349-y',
   'Laureles', 'inactive', 'pending', 'draft', 'a1349000-0000-4000-8000-000000000011', '2099-12-31');

update public.apartments
   set price_monthly = 2900000, currency = 'COP',
       available_from = current_date - 1, address = 'SAN1349 Y address',
       latitude = 6.2447, longitude = -75.5916
 where id = 'b1349000-0000-4000-8000-000000000002';
insert into public.property_verifications (apartment_id, status, verified_at, metadata)
values ('b1349000-0000-4000-8000-000000000002', 'verified', now(),
        '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted","coordinates":"verified"}'::jsonb);
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('b1349000-0000-4000-8000-000000000002', 'san1349/y.jpg', 'image/jpeg', 'authorized');
insert into public.rental_freshness_log (listing_id, checked_at, status)
values ('b1349000-0000-4000-8000-000000000002', now(), 'active');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · THE WORKFLOW FSM CANNOT REACH 'published'
-- ═══════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.transition_listing_workflow('b1349000-0000-4000-8000-000000000001'::uuid,'published')$$,
  '42501', null, 'A1: transition_listing_workflow refuses the published target');

select ok(
  not has_function_privilege('authenticated',
    'public.transition_listing_workflow(uuid,text,text)', 'EXECUTE'),
  'A2: the FSM entry point is not client-callable');

select ok(
  (select prosecdef from pg_proc where oid='public.publish_verified_rental(uuid,uuid)'::regprocedure),
  'A3: publish_verified_rental runs SECURITY DEFINER (it writes trusted columns)');

select ok(
  not has_function_privilege('anon', 'public.publish_verified_rental(uuid,uuid)', 'EXECUTE'),
  'A4: anon cannot execute publish_verified_rental');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · publish_listing delegates to the gate
-- ═══════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.publish_listing('b1349000-0000-4000-8000-000000000001'::uuid)$$,
  '23514', null, 'B1: publish_listing refuses an unevidenced owned listing');
reset role;
select is(
  (select listing_workflow_status || '/' || status || '/' || moderation_status
     from public.apartments where id='b1349000-0000-4000-8000-000000000001'),
  'draft/inactive/pending', 'B2: the refused publish left the listing untouched');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.publish_listing('b1349000-0000-4000-8000-000000000002'::uuid)$$,
  'B3: publish_listing publishes a fully-evidenced owned listing');
reset role;
select is(
  (select listing_workflow_status || '/' || status || '/' || moderation_status
     from public.apartments where id='b1349000-0000-4000-8000-000000000002'),
  'published/active/approved', 'B4: the evidenced listing is live');
-- auth.uid() reads request.jwt.claim.sub, so a SECURITY DEFINER stamp must equal the
-- caller, not the function owner (postgres has no uuid, so this is the exact proof).
select is(
  (select published_by from public.apartments where id='b1349000-0000-4000-8000-000000000002'),
  (select auth.uid()), 'B5: published_by equals auth.uid() (the caller), not the definer owner');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · refusals and remaining wrappers
-- ═══════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.publish_listing('b1349000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', null, 'C1: a foreign broker cannot publish another broker''s listing');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1349000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.request_listing_publish('b1349000-0000-4000-8000-000000000001'::uuid)$$,
  'C2: draft → ready_for_review still works');
select lives_ok(
  $$select public.pause_listing('b1349000-0000-4000-8000-000000000002'::uuid)$$,
  'C3: published → paused still works');
reset role;
select is(
  (select listing_workflow_status from public.apartments where id='b1349000-0000-4000-8000-000000000002'),
  'paused', 'C4: pause took effect');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.publish_listing('b1349000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', null, 'C5: anon is refused by the ACL');
reset role;

select * from finish();
rollback;
