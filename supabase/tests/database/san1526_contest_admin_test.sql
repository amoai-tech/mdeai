
-- SAN-1526 · contest admin RPCs: authorization, actor-scoped idempotency, audit,
-- restaurant-only scope, and ballot-preserving unlink/re-link.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('f1526000-0000-4000-8000-000000000001','san1526-admin@example.com'),
  ('f1526000-0000-4000-8000-000000000002','san1526-admin2@example.com'),
  ('f1526000-0000-4000-8000-000000000003','san1526-user@example.com');
update public.profiles set role = 'admin'::public.user_role
 where id in ('f1526000-0000-4000-8000-000000000001','f1526000-0000-4000-8000-000000000002');
insert into public.user_roles (id, user_id, role) values
  (gen_random_uuid(), 'f1526000-0000-4000-8000-000000000001', 'super_admin'::public.user_role),
  (gen_random_uuid(), 'f1526000-0000-4000-8000-000000000002', 'super_admin'::public.user_role);

insert into public.restaurants (id, name, is_active)
  values ('a1526000-0000-4000-8000-000000000001', '[TEST] San1526 Restaurant', true);

select throws_ok(
  $q$ select public.admin_contest_create('f1526000-0000-4000-8000-000000000003', 'Nope') $q$,
  '42501', null, 'an ordinary user cannot create a contest');
select throws_ok(
  $q$ select public.admin_contest_create(null, 'Nope') $q$,
  '42501', null, 'a missing actor is rejected');

select is(
  (public.admin_contest_create('f1526000-0000-4000-8000-000000000001', '[TEST] San1526 Contest', null, 'demo', now(), now() + interval '30 days', 'manual', 'req-1')) ->> 'status',
  'draft', 'create returns a draft contest');
select is(
  (public.admin_contest_create('f1526000-0000-4000-8000-000000000001', '[TEST] Other title', null, null, now(), now() + interval '30 days', 'manual', 'req-1')) ->> 'contest_id',
  (select id::text from vote.contests where title = '[TEST] San1526 Contest'),
  'a repeated request_id returns the first contest for the same actor');
select is(
  (select count(*)::int from vote.contests where title = '[TEST] Other title'),
  0, 'the idempotent retry created no extra contest');

select isnt(
  (public.admin_contest_create('f1526000-0000-4000-8000-000000000002', '[TEST] Admin Two Contest', null, null, now(), now() + interval '30 days', 'manual', 'req-1')) ->> 'contest_id',
  (select id::text from vote.contests where title = '[TEST] San1526 Contest'),
  'a different admin reusing the same request_id gets a separate contest');

insert into vote.contests (slug, kind, title, org_id, starts_at, ends_at, status)
values ('san1526-pageant', 'pageant', '[TEST] San1526 Pageant', 'f1526000-0000-4000-8000-000000000001', now(), now() + interval '30 days', 'draft');
select throws_ok(
  format($q$ select public.admin_contest_get('f1526000-0000-4000-8000-000000000001', %L) $q$,
         (select id from vote.contests where slug = 'san1526-pageant')),
  'P0002', null, 'a pageant contest is not reachable through the restaurant admin RPCs');

create temp table _ids on commit drop as
select (public.admin_contest_link_restaurant(
  'f1526000-0000-4000-8000-000000000001',
  (select id from vote.contests where title = '[TEST] San1526 Contest'),
  'a1526000-0000-4000-8000-000000000001')) ->> 'entity_id' as first_entity;

select isnt((select first_entity from _ids), null, 'linking a catalog restaurant creates an entry');
select is(
  (select count(*)::int from vote.entities e join vote.contests c on c.id = e.contest_id
    where c.title = '[TEST] San1526 Contest' and e.restaurant_id = 'a1526000-0000-4000-8000-000000000001'),
  1, 'the restaurant is linked exactly once');
select is(
  (public.admin_contest_link_restaurant('f1526000-0000-4000-8000-000000000001',
     (select id from vote.contests where title = '[TEST] San1526 Contest'),
     'a1526000-0000-4000-8000-000000000001')) ->> 'already_linked',
  'true', 'linking the same restaurant twice is idempotent');

insert into vote.votes (contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status)
select c.id, e.id, 'f1526000-0000-4000-8000-000000000003', 'audience', 'iph', 'san1526-key', true, 'clean'
from vote.entities e join vote.contests c on c.id = e.contest_id
where c.title = '[TEST] San1526 Contest' and e.restaurant_id = 'a1526000-0000-4000-8000-000000000001';

select is(
  (public.admin_contest_unlink_restaurant('f1526000-0000-4000-8000-000000000001',
     (select id from vote.contests where title = '[TEST] San1526 Contest'),
     'a1526000-0000-4000-8000-000000000001')) ->> 'ballots_preserved',
  '1', 'unlink reports the preserved ballot count');
select is(
  (select count(*)::int from vote.entities e join vote.contests c on c.id = e.contest_id
    where c.title = '[TEST] San1526 Contest' and e.restaurant_id is null),
  1, 'unlink clears restaurant_id but keeps the entry');
select is(
  (select count(*)::int from vote.votes v join vote.entities e on e.id = v.entity_id
    join vote.contests c on c.id = e.contest_id where c.title = '[TEST] San1526 Contest'),
  1, 'the ballot still exists after unlink');

select is(
  (public.admin_contest_link_restaurant('f1526000-0000-4000-8000-000000000001',
     (select id from vote.contests where title = '[TEST] San1526 Contest'),
     'a1526000-0000-4000-8000-000000000001')) ->> 'entity_id',
  (select first_entity from _ids),
  're-linking restores the ORIGINAL entity instead of creating a new one');
select is(
  (select count(*)::int from vote.entities e join vote.contests c on c.id = e.contest_id
    where c.title = '[TEST] San1526 Contest'
      and e.restaurant_id = 'a1526000-0000-4000-8000-000000000001'
      and e.id = (select first_entity::uuid from _ids)
      and (select count(*) from vote.votes v where v.entity_id = e.id) = 1),
  1, 'the restored entity is the only one for that restaurant and still owns the ballot');

select is(
  (select count(*)::int from vote.contest_audit a join vote.contests c on c.id = a.contest_id
    where c.title = '[TEST] San1526 Contest' and a.action = 'contest.create'
      and a.actor_user_id = 'f1526000-0000-4000-8000-000000000001'),
  1, 'exactly one create audit row for that actor despite the idempotent retry');
select is(
  (select count(*)::int from vote.contest_audit a join vote.contests c on c.id = a.contest_id
    where c.title = '[TEST] San1526 Contest' and a.action = 'contest.entry.link'),
  2, 'each successful link wrote one audit row');

select is(has_function_privilege('authenticated', 'public.admin_contest_create(uuid, text, text, text, timestamptz, timestamptz, text, text)', 'EXECUTE'), false,
  'authenticated cannot execute the create RPC');
select is(has_function_privilege('service_role', 'public.admin_contest_create(uuid, text, text, text, timestamptz, timestamptz, text, text)', 'EXECUTE'), true,
  'service_role can execute the create RPC');

select * from finish();
rollback;
