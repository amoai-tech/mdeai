-- Admin rental test mode — admin-gated, test-marked, customer-invisible, auditable.
-- Run with: supabase test db
begin;

select plan(40);

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

-- A7/A8: the existing atomic viewing path persists exactly one lead + one showing.
set local role service_role;
select lives_ok(
  $q$select public.p1_schedule_tour_atomic((current_setting('mde.admin_test_id'))::uuid::text, null::uuid, 'admin-test-view-key', 'form', 'renter@example.com', 'Test Renter', null, null::uuid, (now() + interval '2 day')::timestamptz, '{}'::jsonb, '{}'::jsonb)$q$,
  'A7: a viewing can be committed on the test listing');
reset role;
select is(
  (select count(*)::int from public.leads where idempotency_key = 'admin-test-view-key')
  + (select count(*)::int from public.showings s join public.leads l on l.id = s.lead_id where l.idempotency_key = 'admin-test-view-key'),
  2,
  'A8: exactly one test lead + one test showing exist');

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
