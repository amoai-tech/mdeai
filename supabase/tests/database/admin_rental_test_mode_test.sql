-- Admin rental test mode — admin-gated, test-marked, customer-invisible, auditable.
-- Run with: supabase test db
begin;
-- Explicitly exercise the public-LAUNCH contract. Normal Phase A journeys have
-- separate pgTAP coverage and must not inherit these business requirements.
-- This mode change is rolled back with this test; it does not touch live settings.
UPDATE public.rental_runtime_settings SET phase='launch' WHERE singleton;


select plan(58);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f1460000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-test@example.com'),
  ('f1460000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plain-user@example.com');

insert into public.user_roles (user_id, role) values ('f1460000-0000-4000-8000-000000000001', 'admin');
insert into public.landlord_profiles (id, user_id, display_name)
values ('f1460000-0000-4000-8000-000000000011', 'f1460000-0000-4000-8000-000000000001', 'Admin Test Owner');

-- A1: a non-admin cannot create a test rental.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_create_test_rental('T', 'Laureles', 'Calle 10', 2400000, 'COP', (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/a.jpg')$q$,
  '42501', 'administrator required', 'A1: non-admin cannot create a test rental');
reset role;

-- A41/A42: administrator cannot write synthetic inventory under another
-- landlord's profile even through the optional RPC argument.
insert into public.landlord_profiles (id, user_id, display_name)
values ('f1460000-0000-4000-8000-000000000012', 'f1460000-0000-4000-8000-000000000002', 'Other User Landlord');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_create_test_rental('Wrong owner', 'Laureles', 'Calle 10',
    2400000, 'COP', (now() at time zone 'America/Bogota')::date + 5,
    'https://example.com/test.jpg', 'f1460000-0000-4000-8000-000000000012')$q$,
  '42501', 'test landlord profile must belong to the administrator',
  'A41: administrator cannot attach test inventory to another tenant');
select is(
  (public.admin_create_test_rental('Owned test', 'Laureles', 'Calle 10',
    2400000, 'COP', (now() at time zone 'America/Bogota')::date + 5,
    'https://example.com/test.jpg', 'f1460000-0000-4000-8000-000000000011')).landlord_id::text,
  'f1460000-0000-4000-8000-000000000011',
  'A42: explicit own landlord profile remains supported');
reset role;

-- A2: an admin creates a test-marked draft (not verified, not published).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.admin_test_id', (public.admin_create_test_rental('Admin test', 'Laureles', 'Calle 10 #42-15', 2400000, 'COP', (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/a.jpg')).id::text, true);
reset role;
select is(
  (select (metadata->>'is_test_fixture') || '/' || (metadata->>'test_mode') || '/' || verified::text || '/' || listing_workflow_status
     from public.apartments where id = (current_setting('mde.admin_test_id'))::uuid),
  'true/true/false/draft',
  'A2: admin creates a test-marked draft that is not verified');

-- A3: a non-admin cannot publish it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_publish_test_rental((current_setting('mde.admin_test_id'))::uuid)$q$,
  '42501', 'administrator required', 'A3: non-admin cannot test-publish');
reset role;

-- A4/A5/A6: an admin publishes it, it is real state, and it stays customer-invisible.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_publish_test_rental((current_setting('mde.admin_test_id'))::uuid)$q$,
  'A4: admin test-publishes the listing');
reset role;
select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
     from public.apartments where id = (current_setting('mde.admin_test_id'))::uuid),
  'active/approved/published/false',
  'A5: test listing is active/published but never verified');
select is(
  public.rental_listing_is_public(
    'active', 'approved', 'published',
    (select landlord_id from public.apartments where id = (current_setting('mde.admin_test_id'))::uuid),
    (select metadata from public.apartments where id = (current_setting('mde.admin_test_id'))::uuid)),
  false,
  'A6: test listing is excluded from the customer-visible predicate');

-- A25-A29: published test rental remains live on publish retries and
-- operator changes; prior successful publication/audit stays unchanged.
select set_config('mde.original_published_row',
 (select jsonb_build_object('published_at', published_at,
                            'published_by', published_by,
                            'metadata', metadata)::text
  from public.apartments where id=current_setting('mde.admin_test_id')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_publish_test_rental(current_setting('mde.admin_test_id')::uuid)$q$,
  'A25: already published test rental accepts retry');
reset role;
select is(
 (select status || '/' || moderation_status || '/' || listing_workflow_status
  from public.apartments where id=current_setting('mde.admin_test_id')::uuid),
 'active/approved/published',
 'A26: publish retry does not silently unpublish fixture');
select is(
 (select jsonb_build_object('published_at', published_at,
                            'published_by', published_by,
                            'metadata', metadata)::text
  from public.apartments where id=current_setting('mde.admin_test_id')::uuid),
 current_setting('mde.original_published_row'),
 'A27: publish retry preserves timestamps and metadata exactly');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_assign_rental_test_operator(current_setting('mde.admin_test_id')::uuid, true)$q$,
  'A28: assign admin test operator on already-published rental');
reset role;
select is(
 (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
  from public.apartments where id=current_setting('mde.admin_test_id')::uuid),
 'active/approved/published/false',
 'A29: admin operator assignment cannot demote live rental');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_assign_rental_test_operator(current_setting('mde.admin_test_id')::uuid, false)$q$,
  'A30: clear admin test operator from already-published rental');
reset role;
select is(
 (select status || '/' || moderation_status || '/' || listing_workflow_status
  from public.apartments where id=current_setting('mde.admin_test_id')::uuid),
 'active/approved/published',
 'A31: clearing operator cannot demote a published rental');
select is(
 (select published_at is not null and published_by='f1460000-0000-4000-8000-000000000001'
  from public.apartments where id=current_setting('mde.admin_test_id')::uuid),
 true,
 'A32: published_at and published_by remain intact after operator changes');

-- A43: the public service-role atomic RPC cannot create fixture leads.
-- Edge functions call it with service credentials; the guest JWT is absent.
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $q$select public.p1_schedule_tour_atomic(current_setting('mde.admin_test_id'), null::uuid,
  'admin-test-guest-should-fail', 'form', 'guest@example.com', 'Guest', null, null::uuid,
  (now() + interval '2 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
  '42501', 'development rental viewing requires an authorized renter',
  'A43: guest cannot schedule an internal fixture through normal atomic RPC');
reset role;

-- A7/A8: the admin-gated wrapper reuses atomic lead + showing, exactly once.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_request_test_viewing(current_setting('mde.admin_test_id')::uuid,
  (now() + interval '2 day')::timestamptz, 'admin-test@example.com')$q$,
  'A7: authorized test viewing creates a real lead and showing');
reset role;
select is(
  (select count(*)::int from public.leads where apartment_id = current_setting('mde.admin_test_id')::uuid)
  + (select count(*)::int from public.showings where apartment_id = current_setting('mde.admin_test_id')::uuid),
  2,
  'A8: exactly one admin test lead + one showing exist');

-- A44/A45: repeat request uses the existing atomic retry contract.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_request_test_viewing(current_setting('mde.admin_test_id')::uuid,
    (now() + interval '2 day')::timestamptz, 'admin-test@example.com')$q$,
  'A44: same admin fixture viewing safely replays');
reset role;
select is(
  (select count(*)::int from public.leads where apartment_id = current_setting('mde.admin_test_id')::uuid)
  + (select count(*)::int from public.showings where apartment_id = current_setting('mde.admin_test_id')::uuid),
  2,
  'A45: replay created no duplicate lead or showing');

-- A46: ordinary signed-in users are denied the admin viewing RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_request_test_viewing(current_setting('mde.admin_test_id')::uuid,
    (now() + interval '3 day')::timestamptz, 'ordinary@example.com')$q$,
  '42501', 'administrator required',
  'A46: non-admin cannot call internal fixture viewing RPC');
reset role;

-- A48: an anonymous outside caller may not bypass the server booking bridge
-- by inserting a showing directly. The service role is intentionally trusted.
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $q$insert into public.showings (lead_id, apartment_id, scheduled_at, status)
  values ((select id from public.leads where apartment_id=current_setting('mde.admin_test_id')::uuid limit 1),
          current_setting('mde.admin_test_id')::uuid, now()+interval '3 day', 'scheduled')$q$,
  '42501', null,
  'A48: anonymous caller cannot insert a fixture showing directly');
reset role;

-- A49/A50: model a pre-existing guest fixture booking created before the
-- guard deployed. A previously committed request must not bypass access checks
-- just because the atomic RPC returns a saved lead/showing without writing.
set local role service_role;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.p1_schedule_tour_atomic(current_setting('mde.admin_test_id'), null::uuid,
    'admin-test-old-guest-replay', 'form', 'oldguest@example.com', 'Old Guest', null, null::uuid,
    (now() + interval '4 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
  'A49: simulate a historical guest lead/showing on an admin test fixture');
reset role;
select is(
  (select count(*)::int from public.leads where idempotency_key='admin-test-old-guest-replay')
  + (select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id
     where l.idempotency_key='admin-test-old-guest-replay'),
  2,
  'A50: historical guest fixture viewing exists for replay protection');

-- A51: direct service-role guest replay MUST NOT reveal historical lead data.
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $q$select public.p1_schedule_tour_atomic(current_setting('mde.admin_test_id'), null::uuid,
    'admin-test-old-guest-replay', 'form', 'oldguest@example.com', 'Old Guest', null, null::uuid,
    (now() + interval '4 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
  '42501', 'development rental viewing requires an authorized renter',
  'A51: existing guest fixture viewing cannot be replayed by non-admin');
reset role;

-- A52: slug identifiers must enforce the same fixture restriction as UUIDs.
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $q$select public.p1_schedule_tour_atomic(
    (select slug from public.apartments where id=current_setting('mde.admin_test_id')::uuid),
    null::uuid, 'admin-test-guest-slug-deny', 'form', 'slugguest@example.com',
    'Slug Guest', null, null::uuid, (now() + interval '3 day')::timestamptz,
    '{}'::jsonb, '{}'::jsonb)$q$,
  '42501', 'development rental viewing requires an authorized renter',
  'A52: guest fixture viewing denied by listing slug too');
reset role;

-- A53: an old slug and a mutable CRM apartment reference can both change.
-- The immutable request identity must STILL block replay of fixture data.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.renamed_fixture_id', (public.admin_create_test_rental(
 'Legacy slug test', 'Laureles', 'Calle 66', 2000000, 'COP',
 (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/legacy.jpg')).id::text, true);
select public.admin_publish_test_rental(current_setting('mde.renamed_fixture_id')::uuid);
reset role;
select set_config('mde.old_fixture_slug',
 (select slug from public.apartments where id=current_setting('mde.renamed_fixture_id')::uuid), true);
set local role service_role;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.p1_schedule_tour_atomic(current_setting('mde.old_fixture_slug'), null::uuid,
 'admin-test-old-slug-replay', 'form', 'oldslug@example.com', 'Old Slug Guest',
 null, null::uuid, (now()+interval '4 day')::timestamptz, '{}'::jsonb, '{}'::jsonb);
update public.apartments set slug=slug||'-renamed'
 where id=current_setting('mde.renamed_fixture_id')::uuid;
update public.leads set apartment_id=null
 where idempotency_key='admin-test-old-slug-replay';
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
 $q$select public.p1_schedule_tour_atomic(current_setting('mde.old_fixture_slug'), null::uuid,
  'admin-test-old-slug-replay', 'form', 'oldslug@example.com', 'Old Slug Guest',
  null, null::uuid, (now()+interval '4 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
 '42501', 'development rental viewing requires an authorized renter',
 'A53: immutable snapshot blocks guest replay after slug and mutable CRM ID change');
reset role;

-- A56-A58: a fixture's historical unclassified lead/showing is NOT safe
-- to delete automatically. A rejected cleanup is atomic and loses no data.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_cleanup_test_rental(current_setting('mde.admin_test_id')::uuid)$q$,
  '42501', 'test fixture has unclassified viewings; manual review required',
  'A56: reject cleanup containing historical unclassified guest records');
reset role;
select is(
  (select count(*)::text from public.leads where apartment_id=current_setting('mde.admin_test_id')::uuid)
  || '/' ||
  (select count(*)::text from public.showings where apartment_id=current_setting('mde.admin_test_id')::uuid),
  '2/2',
  'A57: failed cleanup leaves both existing and admin test records untouched');
select is(
  (select count(*)::int from public.rental_listing_images
   where listing_id=current_setting('mde.admin_test_id')::uuid),
  0,
  'A58: admin test photo URL does not produce fictitious Storage image records');

-- This record is known synthetic because this test created it. Explicitly
-- classify it before exercising successful cleanup; production legacy records
-- must be reviewed, not automatically reclassified by the cleanup RPC.
set local role service_role;
update public.showings s
   set metadata = coalesce(s.metadata, '{}'::jsonb) || '{"admin_test":true}'::jsonb
  from public.leads l
 where s.lead_id=l.id and l.idempotency_key='admin-test-old-guest-replay';
update public.leads
   set metadata = coalesce(metadata, '{}'::jsonb) || '{"admin_test":true}'::jsonb
 where idempotency_key='admin-test-old-guest-replay';
reset role;

-- A9/A10: cleanup removes the test leads/showings and returns the listing to draft.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_cleanup_test_rental((current_setting('mde.admin_test_id'))::uuid)$q$,
  'A9: admin cleans up the test listing');
reset role;
select is(
  (select listing_workflow_status || '/' || (select count(*)::text from public.leads l where l.apartment_id = (current_setting('mde.admin_test_id'))::uuid)
     from public.apartments where id = (current_setting('mde.admin_test_id'))::uuid),
  'draft/0',
  'A10: cleanup removed the test lead and returned the listing to draft');

-- A47: cleaned-up fixtures are no longer eligible for test viewing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_request_test_viewing(current_setting('mde.admin_test_id')::uuid,
    (now() + interval '3 day')::timestamptz, 'admin-test@example.com')$q$,
  '42501', 'active test listing required',
  'A47: cleanup removes test viewing eligibility');
reset role;

-- A11: a non-test listing cannot be test-published.
insert into public.apartments (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status, landlord_id, verified, price_monthly, currency, available_from, images, metadata)
values ('f1460000-0000-4000-8000-000000000021', 'Real listing', 'admin-test-real', 'Laureles', 'Calle 1', 'inactive', 'pending', 'draft', 'f1460000-0000-4000-8000-000000000011', false, 2400000, 'COP', (now() at time zone 'America/Bogota')::date + 5, array['https://example.com/r.jpg'], '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_publish_test_rental('f1460000-0000-4000-8000-000000000021')$q$,
  '42501', 'only a test-marked listing can be test-published',
  'A11: test mode refuses a non-test listing');
reset role;

-- A54/A55: the nine public source ads remain discovery-only even after
-- publication; their active flags must not make the atomic viewing RPC bookable.
insert into public.apartments
  (id,title,slug,neighborhood,address,status,moderation_status,
   listing_workflow_status,landlord_id,verified,price_monthly,currency,
   available_from,images,metadata)
values
  ('f1460000-0000-4000-8000-000000000031','External source test',
   'admin-test-source-link-only','Laureles','Calle 19','active',
   'approved','published','f1460000-0000-4000-8000-000000000011',
   false,2400000,'COP',(now() at time zone 'America/Bogota')::date+5,
   array['https://example.com/source.jpg'],
   '{"inventory_kind":"external_candidate","allowed_action":"view_original_listing"}'::jsonb);
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $q$select public.p1_schedule_tour_atomic('admin-test-source-link-only',
    null::uuid,'admin-test-source-guest-key','form','extguest@example.com',
    'External Guest',null,null::uuid,(now()+interval '4 day')::timestamptz,
    '{}'::jsonb,'{}'::jsonb)$q$,
  '42501','source-linked rental is not requestable',
  'A54: source-only ad cannot accept a guest viewing by slug');
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.p1_schedule_tour_atomic('f1460000-0000-4000-8000-000000000031',
    null::uuid,'admin-test-source-admin-key','form','extadmin@example.com',
    'External Admin',null,null::uuid,(now()+interval '4 day')::timestamptz,
    '{}'::jsonb,'{}'::jsonb)$q$,
  '42501','source-linked rental is not requestable',
  'A55: even an admin cannot use normal viewing on a source-only ad');
reset role;

-- A12: non-admin cannot assign an MDE test operator to an existing listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_assign_rental_test_operator('f1460000-0000-4000-8000-000000000021', true)$q$,
  '42501', 'administrator required', 'A12: non-admin cannot assign test operator');
reset role;

-- A13: administrator may take TEST operating responsibility only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_assign_rental_test_operator('f1460000-0000-4000-8000-000000000021', true)$q$,
  'A13: admin may assign internal test operator');
reset role;

-- A14: assignment never changes property landlord, workflow state, or verification.
select is(
  (select landlord_id::text || '/' || status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
   from public.apartments where id='f1460000-0000-4000-8000-000000000021'),
  'f1460000-0000-4000-8000-000000000011/inactive/pending/draft/false',
  'A14: MDE test operator does not overwrite real listing provenance');

-- A15: assignment is auditable and bound to the real current admin identity.
select is(
  (select (metadata->>'admin_test_operator_active') || '/' || (metadata->>'admin_test_operator_user_id')
   from public.apartments where id='f1460000-0000-4000-8000-000000000021'),
  'true/f1460000-0000-4000-8000-000000000001',
  'A15: assignment targets actual admin identity');

-- A16: admin can revoke the testing assignment without impacting the listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_assign_rental_test_operator('f1460000-0000-4000-8000-000000000021', false)$q$,
  'A16: admin can revoke test assignment');
reset role;

-- A17: another tenant cannot create a development-owned clone.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_clone_rental_for_testing('f1460000-0000-4000-8000-000000000021', (now() at time zone 'America/Bogota')::date + 3, 'https://example.com/test-only.jpg')$q$,
  '42501', 'administrator required', 'A17: ordinary user denied from test ownership workflow');
reset role;

-- A18: MDE administrator clones an existing apartment to its own landlord profile.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.clone_test_id', (public.admin_clone_rental_for_testing(
  'f1460000-0000-4000-8000-000000000021',
  (now() at time zone 'America/Bogota')::date + 3,
  'https://example.com/test-only.jpg')).id::text, true);
reset role;
select ok(
  (select landlord_id = 'f1460000-0000-4000-8000-000000000011'
      and created_by = 'f1460000-0000-4000-8000-000000000001'
   from public.apartments where id = current_setting('mde.clone_test_id')::uuid),
  'A18: development copy is controlled by MDE administrator landlord');

-- A19: actual state is active/approved/published; independent verified is still false.
select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
   from public.apartments where id = current_setting('mde.clone_test_id')::uuid),
  'active/approved/published/false',
  'A19: development listing published without false independent verification');

-- A20: development-scoped approvals and original source reference recorded.
select is(
  (select (metadata->>'admin_test_approval') || '/' || (metadata->>'admin_test_verification')
       || '/' || (metadata->>'admin_test_photo_rights')
   from public.apartments where id = current_setting('mde.clone_test_id')::uuid),
  'approved_for_testing/verified_for_testing/test_image_only',
  'A20: approvals are scoped to development fixture only');

-- A21: tenant-visible predicate still excludes test fixture from marketplace.
select is(
  (select public.rental_listing_is_public(status,moderation_status,listing_workflow_status,landlord_id,metadata)
   from public.apartments where id = current_setting('mde.clone_test_id')::uuid),
  false,
  'A21: real renters never see an internal development rental');

-- A22: accidental duplicate submit reuses the original test listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (public.admin_clone_rental_for_testing('f1460000-0000-4000-8000-000000000021',
   (now() at time zone 'America/Bogota')::date + 3, 'https://example.com/test-only.jpg')).id::text,
  current_setting('mde.clone_test_id'),
  'A22: repeated clone requests are idempotent');
reset role;

-- A23: original source's owner and publication workflow unchanged.
select is(
  (select landlord_id::text || '/' || status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
   from public.apartments where id='f1460000-0000-4000-8000-000000000021'),
  'f1460000-0000-4000-8000-000000000011/inactive/pending/draft/false',
  'A23: original external/source listing is not altered');

-- A24: the test workflow prevents copies of copies.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_clone_rental_for_testing(current_setting('mde.clone_test_id')::uuid,
   (now() at time zone 'America/Bogota')::date + 3, 'https://example.com/test-only.jpg')$q$,
  '42501', 'source must be an original apartment, not a test fixture',
  'A24: fixtures cannot recursively clone each other');
reset role;

-- A36-A40: a previously cleaned-up source clone can be reused with NEW
-- dates and test imagery, and an old expired available_to must not block it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_cleanup_test_rental(current_setting('mde.clone_test_id')::uuid)$q$,
  'A36: admin can clean up a previously cloned development fixture');
reset role;
set local role service_role;
update public.apartments
  set available_from = (now() at time zone 'America/Bogota')::date - 14,
      available_to = (now() at time zone 'America/Bogota')::date - 1
 where id = current_setting('mde.clone_test_id')::uuid;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.reused_clone_test_id', (public.admin_clone_rental_for_testing(
  'f1460000-0000-4000-8000-000000000021',
  (now() at time zone 'America/Bogota')::date + 21,
  'https://example.com/new-test-image.jpg')).id::text, true);
reset role;
select is(current_setting('mde.reused_clone_test_id'), current_setting('mde.clone_test_id'),
  'A37: cleaned-up fixture reuses its canonical test copy ID');
select is(
  (select available_from from public.apartments where id=current_setting('mde.clone_test_id')::uuid),
  (now() at time zone 'America/Bogota')::date + 21,
  'A38: reused draft uses the newly requested availability date');
select is(
  (select images[1] || '/' || coalesce(available_to::text, 'null')
   from public.apartments where id=current_setting('mde.clone_test_id')::uuid),
  'https://example.com/new-test-image.jpg/null',
  'A39: reused draft gets new image and removes expired available_to');
select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status
   from public.apartments where id=current_setting('mde.clone_test_id')::uuid),
  'active/approved/published',
  'A40: reusable draft is republished successfully with current fields');

-- A33: genuinely material edits still cause re-review even if performed by
-- an admin in the same update as exempt internal operator bookkeeping.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.material_test_id', (public.admin_create_test_rental(
 'Another admin test', 'Laureles', 'Calle 18', 2000000, 'COP',
 (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/b.jpg')).id::text, true);
select public.admin_publish_test_rental(current_setting('mde.material_test_id')::uuid);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.apartments
 set price_monthly=price_monthly+1,
     metadata=metadata||jsonb_build_object('admin_test_operator_active',true)
 where id=current_setting('mde.material_test_id')::uuid;
reset role;
select is(
 (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
  from public.apartments where id=current_setting('mde.material_test_id')::uuid),
 'inactive/pending/draft/false',
 'A33: material price update still demotes a live rental with exempt operator metadata');

-- A34: unrelated metadata still forces re-review when changed by an admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.other_metadata_test_id', (public.admin_create_test_rental(
 'Other metadata test', 'Laureles', 'Calle 19', 2000000, 'COP',
 (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/c.jpg')).id::text, true);
select public.admin_publish_test_rental(current_setting('mde.other_metadata_test_id')::uuid);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.apartments set metadata=metadata||jsonb_build_object('some_unrelated_key', 'changed')
 where id=current_setting('mde.other_metadata_test_id')::uuid;
reset role;
select is(
 (select status || '/' || moderation_status || '/' || listing_workflow_status
  from public.apartments where id=current_setting('mde.other_metadata_test_id')::uuid),
 'inactive/pending/draft',
 'A34: unrelated metadata remains a material edit even when admin wrote it');

-- A35: the exempt keys require a real admin JWT, not just SQL service_role.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.nonadmin_metadata_test_id', (public.admin_create_test_rental(
 'Non-admin metadata test', 'Laureles', 'Calle 20', 2000000, 'COP',
 (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/d.jpg')).id::text, true);
select public.admin_publish_test_rental(current_setting('mde.nonadmin_metadata_test_id')::uuid);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"sub":"f1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.apartments set metadata=metadata||jsonb_build_object('admin_test_operator_active', true)
 where id=current_setting('mde.nonadmin_metadata_test_id')::uuid;
reset role;
select is(
 (select status || '/' || moderation_status || '/' || listing_workflow_status
  from public.apartments where id=current_setting('mde.nonadmin_metadata_test_id')::uuid),
 'inactive/pending/draft',
 'A35: non-admin cannot bypass the material-edit guard with operator-only metadata');

select * from finish();
rollback;
