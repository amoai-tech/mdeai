-- SAN-1266: guest checkout stays public through ticket-checkout Edge Function,
-- while its internal SECURITY DEFINER inventory reservation RPC is service-only.
begin;
select plan(8);

select is(has_function_privilege('anon',
  'public.ticket_checkout_create_pending(uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE'),
  false, 'anonymous callers cannot reserve ticket inventory directly');
select is(has_function_privilege('authenticated',
  'public.ticket_checkout_create_pending(uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE'),
  false, 'signed-in customers cannot bypass checkout directly');
select is(has_function_privilege('service_role',
  'public.ticket_checkout_create_pending(uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE'),
  true, 'trusted checkout Edge Function retains RPC access');
select is(has_function_privilege('postgres',
  'public.ticket_checkout_create_pending(uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE'),
  true, 'DB owner keeps access for atomic-money regression tests');

select is((
  select count(*)::integer from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ticket_checkout_create_pending'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 0, 'no overload exposes pending-order creation to anonymous clients');
select is((
  select count(*)::integer from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ticket_checkout_create_pending'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 0, 'no overload exposes pending-order creation to authenticated clients');

set local role anon;
select throws_ok(
  $$select public.ticket_checkout_create_pending(null::uuid,null::uuid,1,
    'guest@example.com','Guest','dummy','[]'::jsonb)$$,
  '42501', null, 'direct guest RPC is denied before writing any rows');
reset role;

set local role authenticated;
select throws_ok(
  $$select public.ticket_checkout_create_pending(null::uuid,null::uuid,1,
    'buyer@example.com','Buyer','dummy','[]'::jsonb)$$,
  '42501', null, 'direct authenticated RPC is denied before writing any rows');
reset role;

select * from finish();
rollback;
