-- Admin rental test mode — admin-gated, test-marked, customer-invisible, auditable.
-- Run with: supabase test db
begin;

select plan(11);

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
  (select listing_workflow_status || '/' || (select count(*)::text from public.leads where apartment_id = (current_setting('mde.admin_test_id'))::uuid)
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

select * from finish();
rollback;
