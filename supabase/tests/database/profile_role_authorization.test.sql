-- Regression: profile display roles cannot grant real administrative authority.
-- All fixtures are rolled back; no persistent test users or approvals.
begin;

select plan(37);

select is(
  has_column_privilege('authenticated','public.profiles','role','UPDATE'),
  false,
  'signed-in user has no direct role-column UPDATE'
);
select is(
  has_column_privilege('authenticated','public.profiles','role','INSERT'),
  false,
  'signed-in user has no direct role-column INSERT'
);
select is(
  has_column_privilege('anon','public.profiles','role','UPDATE'),
  false,
  'anonymous user has no direct role-column UPDATE'
);
select is(
  has_column_privilege('anon','public.profiles','role','INSERT'),
  false,
  'anonymous user has no direct role-column INSERT'
);

insert into auth.users (id, email, email_confirmed_at) values
 ('9a621000-0000-4000-8000-000000000001', 'mde-profile-security-one@example.invalid', now()),
 ('9a621000-0000-4000-8000-000000000002', 'mde-profile-security-two@example.invalid', now());

-- Vote-admin policies need a real private row that ordinary non-owners cannot see.
-- The unrelated public contestant/org/approved policies must not make it visible.
insert into vote.contests
  (id,slug,kind,title,org_id,starts_at,ends_at,status)
values
  ('9a621000-0000-4000-8000-000000000070',
   'profile-role-regression-private','restaurant','Private authorization test',
   '9a621000-0000-4000-8000-000000000002',
   now()-interval '1 day',now()+interval '1 day','draft');

insert into vote.entities (id,contest_id,slug,display_name,approved)
values
  ('9a621000-0000-4000-8000-000000000071',
   '9a621000-0000-4000-8000-000000000070',
   'profile-role-regression-entity','Original Private Entry',false);

-- Production intentionally has no direct authenticated table-wide SELECT/UPDATE
-- grant on vote.entities. Temporarily grant them inside this rolled-back test
-- transaction so the test exercises RLS policy logic, not just the outer ACL.
-- Without this fixture, both negative and positive cases could appear to pass
-- merely because table privileges are absent.
grant select, update on vote.entities to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);

select ok(
  exists (select 1 from public.profiles where id='9a621000-0000-4000-8000-000000000001'),
  'normal profile creation by the existing auth.users trigger still works'
);
select is(
  (select role::text from public.profiles where id='9a621000-0000-4000-8000-000000000001'),
  'user',
  'new ordinary profile receives safe role default'
);
with changed as (
  update public.profiles set full_name='Safe Update'
  where id='9a621000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*)::int from changed),
  1, 'ordinary profile update actually modifies one own row'
);
select is(
  (select full_name from public.profiles
   where id='9a621000-0000-4000-8000-000000000001'),
  'Safe Update', 'ordinary profile edit persists the new name'
);
select throws_ok(
  $$update public.profiles set role='admin'
    where id='9a621000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'user cannot elevate their own profile role'
);

select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$insert into public.profiles (id,email,role) values
    ('9a621000-0000-4000-8000-000000000002','mde-profile-security-two@example.invalid','super_admin')$$,
  '42501',
  null,
  'user cannot create a super admin profile'
);
reset role;

-- Simulate a stale or spoofed admin-looking profile set by a trusted DB actor.
update public.profiles set role='admin'
 where id='9a621000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);
select is(public.is_admin(), false, 'profile role string does not grant trusted admin');
select throws_ok(
  $$select public.approve_sponsor_application(
    '9a621000-0000-4000-8000-000000000091', null)$$,
  'P0001', 'FORBIDDEN: admin role required',
  'sponsor approval rejects a profile-only admin'
);

-- Fake admin display role, NO trusted user_roles row: admin-only SELECT and
-- UPDATE must both deny access to a draft entity owned by another user.
select is(
  (select count(*)::int from vote.entities
   where id='9a621000-0000-4000-8000-000000000071'),
  0,
  'profile-only admin cannot SELECT another users private voting entity'
);
with changed as (
  update vote.entities set display_name='Unauthorized Edit'
   where id='9a621000-0000-4000-8000-000000000071'
   returning id
)
select is(
  (select count(*)::int from changed),
  0,
  'profile-only admin cannot UPDATE another users private voting entity'
);
reset role;

select is(
  (select display_name from vote.entities
   where id='9a621000-0000-4000-8000-000000000071'),
  'Original Private Entry',
  'denied vote UPDATE left the private entity unchanged'
);

-- Prove the opposite direction, too: genuine Super Admin must work even if
-- their ordinary profile display role is 'user'.
update public.profiles set role='user'
 where id='9a621000-0000-4000-8000-000000000001';

-- Real trusted role must work, regardless of profiles.role.
insert into public.user_roles (user_id,role)
values ('9a621000-0000-4000-8000-000000000001','super_admin');
set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);
select is(public.is_admin(), true, 'trusted super admin is recognized');
select throws_ok(
  $$select public.approve_sponsor_application(
    '9a621000-0000-4000-8000-000000000091', null)$$,
  'P0001', 'APPLICATION_NOT_FOUND',
  'trusted super admin passes authorization (then sees missing fixture)'
);

select is(
  (select count(*)::int from vote.entities
   where id='9a621000-0000-4000-8000-000000000071'),
  1,
  'trusted user_roles super admin can SELECT private voting entity'
);
with changed as (
  update vote.entities set display_name='Trusted Super Admin Edit'
   where id='9a621000-0000-4000-8000-000000000071'
   returning id
)
select is(
  (select count(*)::int from changed),
  1,
  'trusted user_roles super admin can UPDATE private voting entity'
);
reset role;

select is(
  (select display_name from vote.entities
   where id='9a621000-0000-4000-8000-000000000071'),
  'Trusted Super Admin Edit',
  'authorized vote UPDATE persisted inside test transaction'
);

-- A real approval must succeed on the fresh migration-defined sponsor schema.
-- The sponsor owner and trusted approver are deliberately different people.
insert into sponsor.organizations (id, owner_user_id, name) values
  ('9a621000-0000-4000-8000-000000000080',
   '9a621000-0000-4000-8000-000000000002', 'Sponsor Fixture');
-- This optional website exists in the hosted sponsor organization contract,
-- not in the minimal fresh-schema fixture. Add it only for this rollback test.
alter table sponsor.organizations add column if not exists website text;
update sponsor.organizations
   set website='https://sponsor.example.invalid/promo?ref=mde'
 where id='9a621000-0000-4000-8000-000000000080';
insert into sponsor.applications
  (id, organization_id, owner_user_id, tier, activation_type, status)
values
  ('9a621000-0000-4000-8000-000000000081',
   '9a621000-0000-4000-8000-000000000080',
   '9a621000-0000-4000-8000-000000000002',
   'gold', 'digital', 'submitted');

set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.approve_sponsor_application(
    '9a621000-0000-4000-8000-000000000081',
    '9a621000-0000-4000-8000-000000000002')$$,
  'trusted admin can approve a real submitted sponsor application'
);
reset role;

select is(
  (select status from sponsor.applications
   where id='9a621000-0000-4000-8000-000000000081'),
  'approved', 'application status becomes approved'
);
select is(
  (select approved_by from sponsor.applications
   where id='9a621000-0000-4000-8000-000000000081'),
  '9a621000-0000-4000-8000-000000000001'::uuid,
  'approved_by is the authenticated admin, not the supplied owner'
);
select ok(
  (select approved_at is not null from sponsor.applications
   where id='9a621000-0000-4000-8000-000000000081'),
  'approval timestamp is recorded'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'),
  2, 'digital sponsor creates two real placements'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and owner_user_id='9a621000-0000-4000-8000-000000000002'),
  2, 'placements inherit sponsor application owner, not approver'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and utm_destination is not null),
  2, 'both placements have required destination'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and utm_destination='https://sponsor.example.invalid/promo?ref=mde'),
  2, 'placements link to the sponsor-provided website, not a fabricated route'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.approve_sponsor_application(
    '9a621000-0000-4000-8000-000000000081', null)$$,
  'P0001', 'APPLICATION_NOT_APPROVABLE: approved',
  'retrying approval rejects duplicate placement creation'
);
reset role;
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'),
  2, 'retry has not duplicated sponsor placements'
);

-- Test the hosted schema's owner-resolution semantics on the same local
-- rollback-only connection. Fresh applications have an owner_user_id but the
-- hosted application may not: simulate NULL to exercise the fallback.
-- The fresh organization also has owner_user_id while hosted uses
-- primary_contact_user_id; these two values deliberately differ here.
alter table sponsor.organizations
  add column if not exists primary_contact_user_id uuid;
alter table sponsor.organizations alter column owner_user_id drop not null;
alter table sponsor.applications alter column owner_user_id drop not null;
alter table sponsor.placements alter column owner_user_id drop not null;

update sponsor.organizations
   set owner_user_id='9a621000-0000-4000-8000-000000000001',
       primary_contact_user_id='9a621000-0000-4000-8000-000000000002'
 where id='9a621000-0000-4000-8000-000000000080';
update sponsor.applications
   set owner_user_id=null, status='submitted', approved_by=null, approved_at=null
 where id='9a621000-0000-4000-8000-000000000081';
delete from sponsor.placements
 where application_id='9a621000-0000-4000-8000-000000000081';

set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.approve_sponsor_application(
    '9a621000-0000-4000-8000-000000000081', null)$$,
  'hosted-style application without owner column can be approved using contact'
);
reset role;
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and owner_user_id='9a621000-0000-4000-8000-000000000002'),
  2, 'hosted owner fallback assigns both placements to primary contact'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and owner_user_id='9a621000-0000-4000-8000-000000000001'),
  0, 'owner fallback never uses unrelated org field or authenticated admin'
);

-- Anonymous draft can have no known owner; do not invent the approver as owner.
update sponsor.organizations
   set owner_user_id=null, primary_contact_user_id=null,
       website='javascript:alert(1)'
 where id='9a621000-0000-4000-8000-000000000080';
update sponsor.applications
   set status='submitted', approved_by=null, approved_at=null
 where id='9a621000-0000-4000-8000-000000000081';
delete from sponsor.placements
 where application_id='9a621000-0000-4000-8000-000000000081';

set local role authenticated;
select set_config('request.jwt.claim.sub','9a621000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.approve_sponsor_application(
    '9a621000-0000-4000-8000-000000000081', null)$$,
  'unknown owner does not create an artificial sponsor identity'
);
reset role;
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and owner_user_id is null),
  2, 'unknown sponsor owner is stored truthfully as NULL'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and owner_user_id='9a621000-0000-4000-8000-000000000001'),
  0, 'unknown owner never silently becomes the approver'
);
select is(
  (select count(*)::int from sponsor.placements
   where application_id='9a621000-0000-4000-8000-000000000081'
     and utm_destination='https://mdeai.co/sponsors'),
  2, 'unsafe sponsor website falls back to an existing MDE sponsor landing'
);

select * from finish();
rollback;
