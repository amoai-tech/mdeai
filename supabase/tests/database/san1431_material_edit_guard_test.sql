-- SAN-1431 §4.2 · a material edit to a live listing must re-enter review.
--
-- Proves price/availability/neighborhood/coordinate/image/ownership/verification
-- changes fail closed, harmless copy edits do not, a foreign broker cannot edit,
-- retries are idempotent, and the gated republish path still works.
--
-- Run with: supabase test db
begin;
-- Explicitly exercise the public-LAUNCH contract. Normal Phase A journeys have
-- separate pgTAP coverage and must not inherit these business requirements.
-- This mode change is rolled back with this test; it does not touch live settings.
UPDATE public.rental_runtime_settings SET phase='launch' WHERE singleton;


select plan(34);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES — a fully published, verified listing owned by broker A.
-- ═══════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, instance_id, aud, role, email)
values
  ('e1431000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-me-broker-a@example.com'),
  ('e1431000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1431-me-broker-b@example.com');

insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values
  ('e1431000-0000-4000-8000-000000000011', 'e1431000-0000-4000-8000-000000000001',
   'SAN1431 ME Broker A', 'approved', now()),
  ('e1431000-0000-4000-8000-000000000012', 'e1431000-0000-4000-8000-000000000002',
   'SAN1431 ME Broker B', 'approved', now());

insert into public.apartments
  (id, title, description, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
   landlord_id, verified, price_monthly, currency, available_from, latitude, longitude, metadata)
values
  ('e1431000-0000-4000-8000-000000000021', 'SAN1431 ME listing', 'original copy', 'san1431-me-listing',
   'Laureles', 'SAN1431 ME address', 'inactive', 'pending', 'draft',
   'e1431000-0000-4000-8000-000000000011', false, 2900000, 'COP', current_date - 1, 6.2447, -75.5916, '{}'::jsonb);

insert into public.property_verifications (apartment_id, status, verified_at, metadata)
values ('e1431000-0000-4000-8000-000000000021', 'verified', now(),
        '{"owner_control":"verified","publish_permission":"granted","viewings_permission":"granted","coordinates":"verified"}'::jsonb);
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('e1431000-0000-4000-8000-000000000021', 'san1431/me.jpg', 'image/jpeg', 'authorized');
insert into public.rental_freshness_log (listing_id, checked_at, status)
values ('e1431000-0000-4000-8000-000000000021', now(), 'active');

-- Publish by an intentional state change (the guard skips workflow transitions).
update public.apartments
   set status = 'active', moderation_status = 'approved', listing_workflow_status = 'published', verified = true
 where id = 'e1431000-0000-4000-8000-000000000021';

create or replace function pg_temp.restore_published() returns void language sql as $$
  -- Reset the synthetic fixture to a draft first. A live metadata reset must
  -- never become an implicit guard bypass in production.
  update public.apartments
     set status = 'inactive', moderation_status = 'pending', listing_workflow_status = 'draft',
         verified = false, published_at = null, published_by = null
   where id = 'e1431000-0000-4000-8000-000000000021';
  update public.apartments
     set status = 'active', moderation_status = 'approved', listing_workflow_status = 'published',
         verified = true, landlord_id = 'e1431000-0000-4000-8000-000000000011',
         price_monthly = 2900000, currency = 'COP', available_from = current_date - 1,
         neighborhood = 'Laureles', latitude = 6.2447, longitude = -75.5916,
         address = 'SAN1431 ME address', metadata = '{}'::jsonb
   where id = 'e1431000-0000-4000-8000-000000000021';
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · THE GUARD
-- ═══════════════════════════════════════════════════════════════════════════════
select ok(
  exists (select 1 from pg_trigger where tgname = 'apartments_material_edit_guard' and not tgisinternal),
  'A1: the apartments material-edit guard trigger exists');

update public.apartments set description = 'a harmless new description'
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'published', 'A2: a harmless copy edit does not disrupt a published listing');

update public.apartments set price_monthly = 3500000
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status || '/' || status || '/' || moderation_status || '/' || verified::text
             from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft/inactive/pending/false', 'A3: a published price change re-enters review');
select is((select metadata->>'review_required_reason' from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'material edit after publication', 'A4: the material reason is recorded');

select pg_temp.restore_published();
update public.apartments set available_from = current_date + 30
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'A5: an availability change re-enters review');

select pg_temp.restore_published();
update public.apartments set neighborhood = 'El Poblado'
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'A6: a neighborhood change re-enters review');

select pg_temp.restore_published();
update public.apartments set latitude = 6.3000
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'A7: a coordinate change re-enters review');

select pg_temp.restore_published();
delete from public.rental_listing_images where listing_id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'A8: removing an approved image re-enters review');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · FOREIGN BROKER + VERIFICATION EVIDENCE
-- ═══════════════════════════════════════════════════════════════════════════════
select pg_temp.restore_published();
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1431000-0000-4000-8000-000000000002', true);
create temporary table san1431_me_foreign as
  with u as (update public.apartments set price_monthly = 1
              where id = 'e1431000-0000-4000-8000-000000000021' returning 1)
  select count(*)::int as n from u;
reset role;
select is((select n from san1431_me_foreign), 0, 'A9: a foreign broker cannot edit another broker''s listing');
select is((select price_monthly from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  2900000::numeric, 'A9b: the foreign broker edit changed nothing');

select pg_temp.restore_published();
update public.property_verifications set metadata = metadata || '{"x":1}'::jsonb
 where apartment_id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'A10: a verification-evidence change re-enters review');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · RETRY + GATED REPUBLISH
-- ═══════════════════════════════════════════════════════════════════════════════
update public.apartments set price_monthly = 3100000
 where id = 'e1431000-0000-4000-8000-000000000021';
update public.apartments set price_monthly = 3200000
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'A11: repeated material edits keep the listing in review without error');

-- Re-record evidence and price, then republish through the canonical gate.
insert into public.rental_listing_images (listing_id, storage_path, mime_type, rights_status)
values ('e1431000-0000-4000-8000-000000000021', 'san1431/me-2.jpg', 'image/jpeg', 'authorized');
update public.apartments set price_monthly = 2900000
 where id = 'e1431000-0000-4000-8000-000000000021';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1431000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000021', 'e1431000-0000-4000-8000-000000000001')$$,
  'A12: an authorized reviewer can republish after the evidence is restored');
reset role;

-- D · METADATA CLASSIFICATION + COMBINED WORKFLOW UPDATE
select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"internal_note":"follow up tomorrow"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'published', 'D1: a known non-authoritative metadata note does not demote');

select pg_temp.restore_published();
update public.apartments
   set price_monthly = 3500000, listing_workflow_status = 'paused', status = 'inactive'
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status || '/' || moderation_status || '/' || verified::text
             from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft/pending/false', 'D2: price + workflow transition cannot skip review');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"new_unknown_key":"not trusted"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D3: unknown metadata changes fail closed');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"owner_control_status":"forged"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D4: owner_control_status requires re-review');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"photo_rights_status":"forged"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D5: photo_rights_status requires re-review');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"availability_status":"forged"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D6: availability_status requires re-review');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"coordinates_status":"forged"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D7: coordinates_status requires re-review');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"inventory_kind":"forged"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D8: inventory_kind requires re-review');

select pg_temp.restore_published();
update public.apartments
   set metadata = metadata || '{"allowed_action":"forged"}'::jsonb
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D9: allowed_action requires re-review');

select pg_temp.restore_published();
update public.apartments set bedrooms = 4
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'draft', 'D10: bedroom count changes require re-review');

select pg_temp.restore_published();
update public.apartments set status='inactive', listing_workflow_status='paused'
 where id = 'e1431000-0000-4000-8000-000000000021';
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'paused', 'D11: legitimate workflow-only pause remains possible');

-- E · PERMISSION BOUNDARY + HONEST AUDIT PROVENANCE
select pg_temp.restore_published();
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1431000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.apartments
       set price_monthly = 4000000, listing_workflow_status = 'paused'
      where id = 'e1431000-0000-4000-8000-000000000021'$$,
  '42501', 'permission denied for table apartments',
  'E1: owner cannot directly combine workflow and material writes');
reset role;
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'published', 'E2: rejected broker workflow write leaves listing live and unchanged');

-- A legitimate owner content edit is RLS-authorized, and retains a real UUID.
select pg_temp.restore_published();
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1431000-0000-4000-8000-000000000001', true);
update public.apartments set price_monthly=3200000
 where id='e1431000-0000-4000-8000-000000000021';
reset role;
select is((select workflow_changed_by from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
 'e1431000-0000-4000-8000-000000000001'::uuid,
 'E2b: authorized broker material edit records their authenticated UUID');
select is((select metadata->>'review_actor_kind' from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
 'authenticated_user', 'E2c: JWT-authenticated author classified as a person');

select pg_temp.restore_published();
-- Simulate a trusted service operation with no JWT: do not fake a human UUID.
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
update public.apartments set price_monthly = 3100000
 where id = 'e1431000-0000-4000-8000-000000000021';
reset role;
select is((select workflow_changed_by from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  null::uuid, 'E3: missing JWT does not forge a human actor UUID');
select is((select metadata->>'review_actor_kind' from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'service_role', 'E4: missing-JWT service writes retain explicit service provenance');
select is((select metadata->>'review_actor_db_role' from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'service_role', 'E5: service provenance captures the DB role (not a person)');

-- Evidence triggers should keep their precise reason, not generic metadata edit.
select pg_temp.restore_published();
update public.property_verifications set metadata = metadata || '{"audit_check":1}'::jsonb
 where apartment_id = 'e1431000-0000-4000-8000-000000000021';
select is((select metadata->>'review_required_reason' from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'property verification changed after publication', 'E6: evidence-trigger reason is preserved');

-- An approved publication from a non-live draft remains possible.
select pg_temp.restore_published();
update public.apartments set listing_workflow_status='draft',status='inactive',moderation_status='pending',verified=false
 where id='e1431000-0000-4000-8000-000000000021';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1431000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.publish_verified_rental('e1431000-0000-4000-8000-000000000021')$$,
  'E7: existing gated publish RPC works from a draft');
reset role;
select is((select listing_workflow_status from public.apartments where id='e1431000-0000-4000-8000-000000000021'),
  'published', 'E8: legitimate publish leaves a published listing');

select * from finish();
rollback;
