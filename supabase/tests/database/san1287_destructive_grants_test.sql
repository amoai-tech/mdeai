-- SAN-1287: SQL TRUNCATE privileges are separate from row-level security.
-- Existing client CRUD and trusted service access must remain unchanged.
begin;
select plan(8);

select is(
  (select count(*)::integer
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_roles o on o.oid = c.relowner
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and o.rolname = 'postgres'
      and has_table_privilege('anon', c.oid, 'truncate')),
  0,
  'anonymous users cannot truncate any postgres-owned public application table');

select is(
  (select count(*)::integer
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_roles o on o.oid = c.relowner
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and o.rolname = 'postgres'
      and has_table_privilege('authenticated', c.oid, 'truncate')),
  0,
  'authenticated users cannot truncate any postgres-owned public application table');

select ok(
  has_table_privilege('anon', 'public.apartments', 'select'),
  'anonymous apartment browsing retains SELECT grant');

select ok(
  has_table_privilege('authenticated', 'public.leads', 'select'),
  'authorized lead reads can still pass the SQL grant gate before RLS');

select ok(
  has_table_privilege('authenticated', 'public.event_orders', 'select'),
  'event buyer reads retain SELECT grant before RLS');

select ok(
  has_table_privilege('service_role', 'public.leads', 'truncate'),
  'trusted service role retains its pre-existing SQL privilege');

set local role anon;
select throws_ok(
  'truncate table public.leads',
  '42501',
  'permission denied for table leads',
  'an anonymous SQL session cannot empty the leads table');
reset role;

set local role authenticated;
select throws_ok(
  'truncate table public.event_orders',
  '42501',
  'permission denied for table event_orders',
  'a signed-in SQL session cannot empty the event orders table');
reset role;

select * from finish();
rollback;
