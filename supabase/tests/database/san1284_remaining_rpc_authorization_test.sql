-- SAN-1284: verify real execution boundaries, not only catalog grants.
-- Synthetic local-only fixtures, all changes rolled back.
begin;
select plan(31);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
                       email_confirmed_at, created_at, updated_at)
values
  ('a1284000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','san1284-super@example.invalid','test-only',now(),now(),now()),
  ('a1284000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','san1284-admin@example.invalid','test-only',now(),now(),now()),
  ('a1284000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','san1284-member@example.invalid','test-only',now(),now(),now());

insert into public.user_roles(user_id, role) values
  ('a1284000-0000-4000-8000-000000000001', 'super_admin'),
  ('a1284000-0000-4000-8000-000000000002', 'admin');

insert into public.events(id, name, event_start_time, status)
values ('a1284000-0000-4000-8000-000000000101', 'SAN1284 rollback-only test event', now()+interval '3 days', 'draft');
insert into public.event_promo_codes(id,event_id,code,discount_type,discount_value,max_usages)
values ('a1284000-0000-4000-8000-000000000102',
        'a1284000-0000-4000-8000-000000000101',
        'SAN1284_TEST_ONLY', 'percent', 10, 1);

select ok(not has_function_privilege('anon','public.has_role(uuid,public.user_role)','execute'),
  'anon has no role lookup RPC access');
select ok(has_function_privilege('authenticated','public.has_role(uuid,public.user_role)','execute'),
  'signed-in RLS and self role checks retain execute');
select ok(has_function_privilege('service_role','public.has_role(uuid,public.user_role)','execute'),
  'trusted contest admin can check role');
select ok(not has_function_privilege('anon','public.check_rate_limit(text,integer,integer)','execute'),
  'anon cannot mutate arbitrary rate buckets');
select ok(not has_function_privilege('authenticated','public.check_rate_limit(text,integer,integer)','execute'),
  'signed-in client cannot mutate arbitrary rate buckets');
select ok(has_function_privilege('service_role','public.check_rate_limit(text,integer,integer)','execute'),
  'trusted server retains rate limiter');
select ok(not has_function_privilege('anon','public.redeem_promo_code(uuid,text,uuid)','execute'),
  'anon cannot consume promo usage');
select ok(not has_function_privilege('authenticated','public.redeem_promo_code(uuid,text,uuid)','execute'),
  'signed-in client cannot consume promo usage');
select ok(has_function_privilege('service_role','public.redeem_promo_code(uuid,text,uuid)','execute'),
  'trusted server retains promo handler');

select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(
  coalesce(p.proacl, acldefault('f',p.proowner))) a where p.oid in (
    'public.has_role(uuid,public.user_role)'::regprocedure,
    'public.check_rate_limit(text,integer,integer)'::regprocedure,
    'public.redeem_promo_code(uuid,text,uuid)'::regprocedure)
    and a.grantee=0 and a.privilege_type='EXECUTE'),0,
  'no inherited PUBLIC EXECUTE on these three functions');

set local role anon;
select throws_ok(
  $$select public.has_role('a1284000-0000-4000-8000-000000000001'::uuid, 'super_admin'::public.user_role)$$,
  '42501','permission denied for function has_role',
  'anonymous role lookup denied by SQL');
select throws_ok(
  $$select public.check_rate_limit('san1284-anon-bucket',1,60)$$,
  '42501','permission denied for function check_rate_limit',
  'anonymous rate mutation denied before any write');
select throws_ok(
  $$select public.redeem_promo_code('a1284000-0000-4000-8000-000000000101','SAN1284_TEST_ONLY',null)$$,
  '42501','permission denied for function redeem_promo_code',
  'anonymous promo write denied');
reset role;

select set_config('request.jwt.claim.sub','a1284000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1284000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select ok(public.has_role('a1284000-0000-4000-8000-000000000002'::uuid,'admin'::public.user_role),
  'authenticated user can query own admin role');
select ok(not public.has_role('a1284000-0000-4000-8000-000000000001'::uuid,'super_admin'::public.user_role),
  'authenticated user cannot discover another user super admin role');
select ok(public.is_admin(), 'existing is_admin helper still works for own admin role');
select throws_ok(
  $$insert into public.user_roles(user_id,role)
    values ('a1284000-0000-4000-8000-000000000003','moderator')$$,
  '42501','new row violates row-level security policy for table "user_roles"',
  'non-super-admin cannot assign another user a role');
select throws_ok(
  $$select public.check_rate_limit('san1284-auth-bucket',1,60)$$,
  '42501','permission denied for function check_rate_limit',
  'authenticated actor cannot tamper with rate bucket');
select throws_ok(
  $$select public.redeem_promo_code('a1284000-0000-4000-8000-000000000101','SAN1284_TEST_ONLY',null)$$,
  '42501','permission denied for function redeem_promo_code',
  'authenticated actor cannot consume promo quota');
reset role;

-- On a vulnerable baseline the browser probes above may consume this promo.
-- Verify that the production fix prevents mutation, then restore the
-- rollback-only fixture to let trusted positive tests run even in RED.
select is((select usage_count from public.event_promo_codes
  where id='a1284000-0000-4000-8000-000000000102'),0,
  'unauthorized promo attempts must not consume a use');
update public.event_promo_codes set usage_count = 0
  where id='a1284000-0000-4000-8000-000000000102';

select set_config('request.jwt.claim.sub','a1284000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1284000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select lives_ok(
  $$insert into public.user_roles(user_id,role)
    values ('a1284000-0000-4000-8000-000000000003','moderator')$$,
  'existing Super Admin user_roles RLS insert still works');
reset role;

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select ok(public.has_role('a1284000-0000-4000-8000-000000000001'::uuid,'super_admin'::public.user_role),
  'trusted service can inspect authorized contest actor');
select lives_ok(
  $$select public.assert_contest_admin('a1284000-0000-4000-8000-000000000001'::uuid)$$,
  'existing service-only contest admin workflow still authorizes a real super admin');
select throws_ok(
  $$select public.assert_contest_admin('a1284000-0000-4000-8000-000000000003'::uuid)$$,
  '42501','admin role required',
  'service-only contest operation rejects actor without admin role');

select is((public.check_rate_limit('san1284-test-bucket-service-only',1,60)->>'allowed')::boolean,
  true,'first trusted rate limit call allowed');
select is((public.check_rate_limit('san1284-test-bucket-service-only',1,60)->>'allowed')::boolean,
  false,'second trusted rate limit call denied');
select is((select count from public.rate_limit_hits
  where bucket_key='san1284-test-bucket-service-only'),2,
  'trusted limiter increments one bucket atomically');
select is((public.redeem_promo_code(
  'a1284000-0000-4000-8000-000000000101','SAN1284_TEST_ONLY',null)->>'promo_code_id')::uuid,
  'a1284000-0000-4000-8000-000000000102'::uuid,
  'trusted server can consume existing promo code');
select is((select usage_count from public.event_promo_codes
  where id='a1284000-0000-4000-8000-000000000102'),1,
  'trusted promo consumption persists one usage');
select throws_ok(
  $$select public.redeem_promo_code(
    'a1284000-0000-4000-8000-000000000101','SAN1284_TEST_ONLY',null)$$,
  'P0001','PROMO_EXHAUSTED',
  'promo cannot exceed max usage, even from trusted role');
select is((select usage_count from public.event_promo_codes
  where id='a1284000-0000-4000-8000-000000000102'),1,
  'exhausted promo does not increment past its cap');
reset role;

select * from finish();
rollback;
