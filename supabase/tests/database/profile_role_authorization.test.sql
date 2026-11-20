-- Regression: profile display roles cannot grant real administrative authority.
-- All fixtures are rolled back; no persistent test users or approvals.
begin;

select plan(13);

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
select lives_ok(
  $$update public.profiles set full_name='Safe Update'
    where id='9a621000-0000-4000-8000-000000000001'$$,
  'ordinary profile editing still works'
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
reset role;

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
reset role;

select * from finish();
rollback;
