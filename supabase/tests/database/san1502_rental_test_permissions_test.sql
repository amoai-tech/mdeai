-- SAN-1502 PR1 — development authorization primitive + append-only audit.
-- Admin-only grants; per-user roles; expiry/revoke; rights grant/revoke;
-- approve/reject/reopen; append-only history; RLS isolation.
-- Run with: supabase test db
begin;

select plan(54);

-- Fixtures: one admin, one revoked renter, one owner, one broker, one observer.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f1502000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-1502@example.com'),
  ('f1502000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'renter-1502@example.com'),
  ('f1502000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-1502@example.com'),
  ('f1502000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'broker-1502@example.com'),
  ('f1502000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'observer-1502@example.com');

insert into public.user_roles (user_id, role)
values ('f1502000-0000-4000-8000-000000000001', 'admin');

insert into public.landlord_profiles (id, user_id, display_name)
values
  ('f1502000-0000-4000-8000-000000000011', 'f1502000-0000-4000-8000-000000000001', 'Admin 1502'),
  ('f1502000-0000-4000-8000-000000000013', 'f1502000-0000-4000-8000-000000000003', 'Owner 1502'),
  ('f1502000-0000-4000-8000-000000000014', 'f1502000-0000-4000-8000-000000000004', 'Broker 1502');

-- Admin creates and publishes a test fixture to operate on.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.san1502_fixture',
  (public.admin_create_test_rental('SAN1502 fixture', 'Laureles', 'Calle 1', 2400000, 'COP',
     (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/a.jpg')).id::text, true);
select lives_ok(
  $q$select public.admin_publish_test_rental((current_setting('mde.san1502_fixture'))::uuid)$q$,
  'setup: fixture is test-published');
reset role;

-- A1: anon may not grant development access.
set local role anon;
select throws_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter')$q$,
  '42501', null, 'A1: anon cannot grant development access');
reset role;

-- A2/A3: a non-admin authenticated user may not grant or revoke.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter')$q$,
  '42501', 'administrator required', 'A2: non-admin cannot grant development access');
select throws_ok(
  $q$select public.admin_revoke_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter')$q$,
  '42501', 'administrator required', 'A3: non-admin cannot revoke development access');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A4-A8: grant a renter and read the predicate.
select lives_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter')$q$,
  'A4: admin grants renter access');
reset role;
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000002', 'renter'), true,
  'A5: renter grant authorizes the renter role');
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000002'), true,
  'A6: any-role predicate matches an active grant');
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000002', 'broker'), false,
  'A7: role-scoped predicate does not match a different role');
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000003'), false,
  'A8: a user with no grant is not an authorized test actor');

-- A9-A11: revoke takes effect immediately and is not repeatable.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_revoke_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter')$q$,
  'A9: admin revokes renter access');
select throws_ok(
  $q$select public.admin_revoke_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter')$q$,
  'P0002', 'no active grant for that user and role', 'A11: revoking an inactive grant is rejected');
reset role;
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000002'), false,
  'A10: a revoked grant is inactive');

-- A12/A13: invalid grant inputs are rejected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000002', 'renter', now() - interval '1 hour')$q$,
  '22023', 'expires_at must be in the future', 'A12: past expiry is rejected');
select throws_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000002', 'wizard')$q$,
  '22023', 'access_role must be owner, broker or renter', 'A13: unknown role is rejected');

-- A14-A17: owner and broker grants.
select lives_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000003', 'owner')$q$,
  'A14: admin grants owner access');
select lives_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-000000000004', 'broker')$q$,
  'A16: admin grants broker access');
reset role;
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000003', 'owner'), true,
  'A15: owner grant authorizes the owner role');
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000004', 'broker'), true,
  'A17: broker grant authorizes the broker role');

-- A18-A24: owner/broker assignment is grant-gated and audited into the listing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_assign_test_listing_owner((current_setting('mde.san1502_fixture'))::uuid, 'f1502000-0000-4000-8000-000000000003')$q$,
  'A18: admin assigns a granted owner');
select throws_ok(
  $q$select public.admin_assign_test_listing_owner((current_setting('mde.san1502_fixture'))::uuid, 'f1502000-0000-4000-8000-000000000002')$q$,
  '42501', 'owner must hold an active test owner grant', 'A20: ungranted owner is rejected');
select lives_ok(
  $q$select public.admin_assign_test_listing_broker((current_setting('mde.san1502_fixture'))::uuid, 'f1502000-0000-4000-8000-000000000004')$q$,
  'A21: admin assigns a granted broker');
select is(
  (select landlord_id::text from public.apartments
    where id = current_setting('mde.san1502_fixture')::uuid),
  'f1502000-0000-4000-8000-000000000014',
  'A22: assigning U4 repoints landlord_id at the broker profile');
select throws_ok(
  $q$select public.admin_assign_test_listing_broker((current_setting('mde.san1502_fixture'))::uuid, 'f1502000-0000-4000-8000-000000000002')$q$,
  '42501', 'broker must hold an active test broker or owner grant', 'A23: ungranted broker is rejected');
select lives_ok(
  $q$select public.admin_assign_test_listing_broker((current_setting('mde.san1502_fixture'))::uuid, 'f1502000-0000-4000-8000-000000000003')$q$,
  'A24: an owner grant may also act as broker');
select is(
  (select landlord_id::text from public.apartments
    where id = current_setting('mde.san1502_fixture')::uuid),
  'f1502000-0000-4000-8000-000000000013',
  'A24b: the owner-as-broker takes over landlord_id');
reset role;
select is(
  (select metadata ->> 'admin_test_owner_user_id' from public.apartments
    where id = current_setting('mde.san1502_fixture')::uuid),
  'f1502000-0000-4000-8000-000000000003',
  'A19: owner assignment is recorded on the fixture');

-- A25-A30: development rights grant/revoke with the canonical offer predicate.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_set_test_rights((current_setting('mde.san1502_fixture'))::uuid, 'water', 'authorized')$q$,
  '22023', 'right must be photo or publishing', 'A25: unknown right is rejected');
select throws_ok(
  $q$select public.admin_set_test_rights((current_setting('mde.san1502_fixture'))::uuid, 'photo', 'maybe')$q$,
  '22023', null, 'A26: invalid photo state is rejected');
select lives_ok(
  $q$select public.admin_set_test_rights((current_setting('mde.san1502_fixture'))::uuid, 'photo', 'authorized')$q$,
  'A27: admin grants development photo rights');
select lives_ok(
  $q$select public.admin_set_test_rights((current_setting('mde.san1502_fixture'))::uuid, 'publishing', 'revoked')$q$,
  'A29setup: admin withdraws publishing rights');
reset role;
select is(
  (select metadata ->> 'admin_test_photo_rights' from public.apartments
    where id = current_setting('mde.san1502_fixture')::uuid),
  'authorized',
  'A28: photo-rights grant is recorded');
select is(
  public.rental_test_listing_is_available(
    (select status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select moderation_status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select listing_workflow_status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select metadata from public.apartments where id = current_setting('mde.san1502_fixture')::uuid)),
  false,
  'A29: withdrawn publishing removes the listing from the development offer');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_set_test_rights((current_setting('mde.san1502_fixture'))::uuid, 'publishing', 'approved')$q$,
  'A30setup: admin restores publishing rights');
reset role;
select is(
  public.rental_test_listing_is_available(
    (select status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select moderation_status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select listing_workflow_status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select metadata from public.apartments where id = current_setting('mde.san1502_fixture')::uuid)),
  true,
  'A30: restored publishing offers the listing again');

-- A31-A36: reject → predicate off; reopen → draft; approve → live but unverified.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$select public.admin_reject_test_listing((current_setting('mde.san1502_fixture'))::uuid, 'not ready')$q$,
  'A31setup: admin rejects the fixture');
select lives_ok(
  $q$select public.admin_reopen_test_listing((current_setting('mde.san1502_fixture'))::uuid)$q$,
  'A33setup: admin reopens the fixture');
select lives_ok(
  $q$select public.admin_approve_test_listing((current_setting('mde.san1502_fixture'))::uuid)$q$,
  'A34setup: admin approves the fixture');
reset role;
select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
     from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
  'active/approved/published/false',
  'A34: approve publishes the fixture while verified stays false');
select is(
  (select metadata ->> 'admin_test_publish_state' from public.apartments
    where id = current_setting('mde.san1502_fixture')::uuid),
  'approved',
  'A35: approve records the publishing state');
select is(
  public.rental_test_listing_is_available(
    (select status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select moderation_status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select listing_workflow_status from public.apartments where id = current_setting('mde.san1502_fixture')::uuid),
    (select metadata from public.apartments where id = current_setting('mde.san1502_fixture')::uuid)),
  true,
  'A36: approved fixture is offered to authorized testers');

-- A37-A40: the history is complete and append-only.
select cmp_ok(
  (select count(*)::int from public.rental_test_events
    where apartment_id = current_setting('mde.san1502_fixture')::uuid),
  '>=', 9,
  'A37: every listing transition is recorded on the fixture');
select cmp_ok(
  (select count(*)::int from public.rental_test_events where event_type = 'access_granted'),
  '>=', 3,
  'A38: access grants are recorded');
select is(
  (select count(*)::int from public.rental_test_events
    where apartment_id = current_setting('mde.san1502_fixture')::uuid and event_type = 'listing_rejected'),
  1,
  'A39: the rejection is recorded');
select is(
  (select count(*)::int from public.rental_test_events
    where apartment_id = current_setting('mde.san1502_fixture')::uuid and event_type = 'listing_approved'),
  1,
  'A40: the approval is recorded');
select throws_ok(
  $q$update public.rental_test_events set event_type = 'tampered'$q$,
  '42501', 'rental_test_events is append-only', 'A41: history cannot be updated');
select throws_ok(
  $q$delete from public.rental_test_events$q$,
  '42501', 'rental_test_events is append-only', 'A42: history cannot be deleted');
select is(
  has_table_privilege('authenticated', 'public.rental_test_events', 'update'),
  false,
  'A43: authenticated has no UPDATE privilege on the audit trail');

-- A44-A47: RLS isolation of grants and history.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.rental_test_access), 0,
  'A44: an ungranted user sees no access rows');
select is((select count(*)::int from public.rental_test_events), 0,
  'A47: a non-admin sees no audit history');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select cmp_ok((select count(*)::int from public.rental_test_access), '>=', 3,
  'A45: an admin sees every access row');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.rental_test_access), 1,
  'A46: a user sees only their own access row');
reset role;
set local role anon;
select is((select count(*)::int from public.rental_test_events), 0,
  'A48: anon sees no development history');
reset role;

-- A49: an expired grant is inactive even without a revoke.
update public.rental_test_access
   set granted_at = now() - interval '2 hours',
       expires_at = now() - interval '1 hour'
 where user_id = 'f1502000-0000-4000-8000-000000000003'
   and access_role = 'owner';
select is(public.is_authorized_test_actor('f1502000-0000-4000-8000-000000000003'), false,
  'A49: an expired grant is inactive');

-- A50: unknown target user is rejected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $q$select public.admin_grant_rental_test_access('f1502000-0000-4000-8000-00000000dead', 'renter')$q$,
  'P0002', 'target user not found', 'A50: unknown target user is rejected');
reset role;

select * from finish();
rollback;
