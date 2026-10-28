-- SAN-1562 · Technical access must protect event commerce without business gates.
-- Uses the real database roles and catalog ACLs. No paid orders are modified.
begin;
select plan(25);

select is(
  (select bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ticket_payment_refund_v2'),
  true, 'anon cannot forge a refund via any active signature');
select is(
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ticket_payment_refund_v2'),
  true, 'signed-in buyer cannot forge a refund via any active signature');
select is(
  (select bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ticket_payment_refund_v2'),
  true, 'trusted payment server retains access to every refund signature');

select is(has_function_privilege('anon', 'public.ticket_validate_consume(text)', 'EXECUTE'),
  false, 'anonymous scanner cannot consume a QR directly');
select is(has_function_privilege('authenticated', 'public.ticket_validate_consume(text)', 'EXECUTE'),
  false, 'buyer cannot mark a QR consumed directly');
select is(has_function_privilege('service_role', 'public.ticket_validate_consume(text)', 'EXECUTE'),
  true, 'validated staff Edge Function retains consume access');

select is(has_function_privilege('anon', 'public.record_check_in(uuid,uuid,text,uuid,text,inet,text,jsonb)', 'EXECUTE'),
  false, 'anon cannot forge scanner audit logs');
select is(has_function_privilege('authenticated', 'public.record_check_in(uuid,uuid,text,uuid,text,inet,text,jsonb)', 'EXECUTE'),
  false, 'buyer cannot impersonate a scanner in audit logs');
select is(has_function_privilege('service_role', 'public.record_check_in(uuid,uuid,text,uuid,text,inet,text,jsonb)', 'EXECUTE'),
  true, 'trusted scanner server retains audit access');

-- Guard every overload, not just today's integer signature. A later migration
-- (such as SAN-1285's bigint refund) must not silently restore buyer access.
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ticket_payment_refund_v2', 'ticket_validate_consume', 'record_check_in')
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anonymous users cannot execute any privileged ticket RPC overload');
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ticket_payment_refund_v2', 'ticket_validate_consume', 'record_check_in')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'signed-in customers cannot execute any privileged ticket RPC overload');

select is(has_table_privilege('anon', 'public.event_orders', 'INSERT'), false,
  'guest cannot insert a fake paid order');
select is(has_table_privilege('anon', 'public.event_attendees', 'UPDATE'), false,
  'guest cannot update attendee state directly');
select is(has_table_privilege('anon', 'public.event_check_ins', 'INSERT'), false,
  'guest cannot forge a check-in row');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
     and (c.relname='events' or left(c.relname,6)='event_')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE')
       or has_table_privilege('anon', c.oid, 'TRUNCATE'))),
  0, 'no event-domain table has anonymous DML or TRUNCATE grants');

select is(
  (select count(*)::int from pg_default_acl d
   join pg_roles r on r.oid=d.defaclrole
   cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype='r' and d.defaclnamespace='public'::regnamespace
     and r.rolname='postgres' and a.grantee='anon'::regrole
     and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
  0, 'postgres future public tables deny anonymous DML by default');
select is(
  (select count(*)::int from pg_default_acl d
   join pg_roles r on r.oid=d.defaclrole
   cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype='r' and d.defaclnamespace='public'::regnamespace
     and r.rolname='postgres' and a.grantee='authenticated'::regrole
     and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
  0, 'postgres future public tables require deliberate signed-in write grants');

select is(has_table_privilege('service_role', 'public.event_orders', 'INSERT'), true,
  'payment service can still persist orders');
select is(has_table_privilege('anon', 'public.events', 'SELECT'), true,
  'guest discovery can still read events with RLS');
select is(has_table_privilege('authenticated', 'public.events', 'SELECT'), true,
  'signed-in discovery can still read events with RLS');

set local role anon;
select throws_ok($$select public.ticket_validate_consume('not-a-real-token')$$,
  '42501', null, 'anonymous direct QR consume fails before mutation');
reset role;
set local role authenticated;
select throws_ok($$select public.ticket_payment_refund_v2(null,null,null,null,null,null,null)$$,
  '42501', null, 'signed-in direct refund fails before mutation');
select throws_ok($$select public.ticket_validate_consume('not-a-real-token')$$,
  '42501', null, 'signed-in direct QR consume fails before mutation');
select throws_ok($$select public.record_check_in(null,null,null,null,null,null,null,null)$$,
  '42501', null, 'signed-in direct check-in audit fails before mutation');
reset role;

-- A trusted server may reach the real refund implementation, but an unknown
-- order fails safely before any insert/update; no paid fixture is necessary.
set local role service_role;
select throws_ok($$select public.ticket_payment_refund_v2(null,null,null,null,null,null,null)$$,
  'P0001', 'ORDER_NOT_FOUND', 'trusted server reaches refund logic without mutating an order');
reset role;
select * from finish();
rollback;
