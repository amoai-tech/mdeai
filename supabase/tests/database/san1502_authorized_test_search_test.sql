-- SAN-1502 · During development any signed-in renter may view active fixtures.
-- Anonymous visitors remain blocked; grants are operational but not booking prerequisites.
-- Run with: supabase test db
begin;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f1503000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-pr2@example.com'),
  ('f1503000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester-pr2@example.com'),
  ('f1503000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ordinary-pr2@example.com');

insert into public.user_roles (user_id, role)
values ('f1503000-0000-4000-8000-000000000001', 'admin');

insert into public.landlord_profiles (id, user_id, display_name)
values ('f1503000-0000-4000-8000-000000000011', 'f1503000-0000-4000-8000-000000000001', 'Admin PR2');

-- A control PUBLIC non-fixture listing, to prove the new policy does not disturb
-- ordinary customer search.
insert into public.apartments (
  id, title, slug, description, neighborhood, city, address,
  status, moderation_status, listing_workflow_status,
  landlord_id, verified, price_monthly, currency, available_from, images, metadata
) values (
  'f1503000-0000-4000-8000-00000000c001', 'Control public listing', 'control-public-pr2',
  'A normal published listing.', 'Laureles', 'Medellín', 'Calle 1',
  'active', 'approved', 'published',
  'f1503000-0000-4000-8000-000000000011', false, 2000000, 'COP', current_date,
  array['https://example.com/public.jpg'], '{}'::jsonb
);

-- Admin grants the tester access and provisions a published fixture.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_grant_rental_test_access('f1503000-0000-4000-8000-000000000002', 'renter')$q$,
  'setup: admin grants the tester renter access');
select set_config('mde.san1502_pr2_fixture',
  (public.admin_create_test_rental('PR2 fixture', 'Laureles', 'Calle 2', 2400000, 'COP',
     (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/pr2.jpg')).id::text, true);
select lives_ok(
  $q$select public.admin_publish_test_rental(current_setting('mde.san1502_pr2_fixture')::uuid)$q$,
  'setup: fixture is test-published');
select lives_ok(
  $q$select public.admin_set_test_rights(current_setting('mde.san1502_pr2_fixture')::uuid, 'publishing', 'approved')$q$,
  'setup: publishing right approved');
select lives_ok(
  $q$select public.admin_set_test_rights(current_setting('mde.san1502_pr2_fixture')::uuid, 'photo', 'authorized')$q$,
  'setup: photo right authorized');
reset role;

-- A1: the authorized tester sees the published fixture.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A1: an authorized tester sees the published fixture');
reset role;

-- A2/A3: an ordinary authenticated user and anon do not.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A2: ordinary authenticated users may work with development inventory');
reset role;
set local role anon;
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 0,
  'A3: anon cannot see the fixture');
reset role;

-- A4: revoking the grant takes effect immediately.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_revoke_rental_test_access('f1503000-0000-4000-8000-000000000002', 'renter')$q$,
  'setup: admin revokes the tester');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A4: grant revocation does not block development search');
reset role;

-- A5: re-granting restores visibility.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_grant_rental_test_access('f1503000-0000-4000-8000-000000000002', 'renter')$q$,
  'setup: admin re-grants the tester');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A5: a re-granted tester sees the fixture again');
reset role;

-- A6/A7: withdrawing publishing rights hides it; restoring shows it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_set_test_rights(current_setting('mde.san1502_pr2_fixture')::uuid, 'publishing', 'revoked')$q$,
  'setup: publishing right withdrawn');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A6: publishing paperwork does not hide development fixtures');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_set_test_rights(current_setting('mde.san1502_pr2_fixture')::uuid, 'publishing', 'approved')$q$,
  'setup: publishing right restored');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A7: restored publishing shows the fixture again');
reset role;

-- A8/A9: the photo right is enforced the same way.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_set_test_rights(current_setting('mde.san1502_pr2_fixture')::uuid, 'photo', 'revoked')$q$,
  'setup: photo right withdrawn');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A8: photo paperwork does not hide development fixtures');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_set_test_rights(current_setting('mde.san1502_pr2_fixture')::uuid, 'photo', 'authorized')$q$,
  'setup: photo right restored');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid), 1,
  'A9: restored photo rights show the fixture again');
reset role;

-- A10-A12: the customer boundary is intact.
select is(
  public.rental_listing_is_public(
    (select status from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid),
    (select moderation_status from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid),
    (select listing_workflow_status from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid),
    (select landlord_id from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid),
    (select metadata from public.apartments where id = current_setting('mde.san1502_pr2_fixture')::uuid)),
  false,
  'A10: the fixture is still excluded from the public predicate');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1503000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = 'f1503000-0000-4000-8000-00000000c001'), 1,
  'A11: an ordinary user still sees a normal public listing');
reset role;
set local role anon;
select is((select count(*)::int from public.apartments where id = 'f1503000-0000-4000-8000-00000000c001'), 1,
  'A12: anon still sees a normal public listing');
reset role;

select * from finish();
rollback;
