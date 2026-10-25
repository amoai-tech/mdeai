-- SAN-1284: caller boundary for the legacy wait-list RPC.
-- No durable fixture rows: a fabricated ticket ID never reaches an INSERT.
begin;
select plan(7);

select ok(
  not has_function_privilege('anon',
    'public.fn_join_wait_list(uuid,uuid,text,text)', 'execute'),
  'anon cannot execute wait-list RPC');

select ok(
  not has_function_privilege('authenticated',
    'public.fn_join_wait_list(uuid,uuid,text,text)', 'execute'),
  'signed-in browser cannot impersonate another user through RPC');

select ok(
  has_function_privilege('service_role',
    'public.fn_join_wait_list(uuid,uuid,text,text)', 'execute'),
  'trusted service caller keeps access');

select ok(
  not exists(
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where n.nspname = 'public'
       and p.proname = 'fn_join_wait_list'
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC inherited execute is explicitly removed');

set local role anon;
select throws_ok(
  $$select public.fn_join_wait_list(
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      'nobody@example.invalid', null)$$,
  '42501',
  'permission denied for function fn_join_wait_list',
  'direct anon RPC call is rejected before any write');
reset role;

set local role authenticated;
select throws_ok(
  $$select public.fn_join_wait_list(
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      'nobody@example.invalid', null)$$,
  '42501',
  'permission denied for function fn_join_wait_list',
  'direct authenticated RPC call is rejected');
reset role;

set local role service_role;
select is(
  (public.fn_join_wait_list(
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      'nobody@example.invalid', null))->>'error',
  'ticket_type_not_found',
  'trusted service can still call the RPC');
reset role;

select * from finish();
rollback;
