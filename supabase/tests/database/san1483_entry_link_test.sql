-- SAN-1483 · contest entry -> canonical restaurant link. Self-contained; rolled back.
begin;
select plan(7);

insert into auth.users (id, email) values ('f1483000-0000-0000-0000-000000000001','link-org@example.com');
insert into public.profiles (id, email) values ('f1483000-0000-0000-0000-000000000001','link-org@example.com') on conflict do nothing;
insert into public.restaurants (id, name, is_active) values ('a1483000-0000-0000-0000-000000000001','[TEST] Link Restaurant', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1483000-0000-0000-0000-000000000001','link-test','restaurant','Link Test','f1483000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day','draft');
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1483000-0000-0000-0000-000000000001','c1483000-0000-0000-0000-000000000001','link-e','Link E','a1483000-0000-0000-0000-000000000001');

select has_column('vote', 'entities', 'restaurant_id', 'entities has a restaurant_id column');
select is((select count(*)::int from pg_indexes where schemaname='vote' and indexname='vote_entities_one_entry_per_restaurant_idx'), 1, 'one-entry-per-restaurant unique index exists');
select is(public.vote_restaurant_target('a1483000-0000-0000-0000-000000000001')->>'entity_id', 'e1483000-0000-0000-0000-000000000001', 'target RPC returns the linked entry');
select is(public.vote_restaurant_target('a1483000-0000-0000-0000-000000000001')->>'application_phase', 'development', 'target RPC reports the phase truthfully');
select throws_ok($q$ insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values ('e1483000-0000-0000-0000-000000000002','c1483000-0000-0000-0000-000000000001','dup','Dup','a1483000-0000-0000-0000-000000000001') $q$, '23505', null, 'a second entry for the same restaurant in the same contest is rejected');
select is(has_function_privilege('anon', 'public.vote_restaurant_target(uuid)', 'EXECUTE'), false, 'anon cannot execute the target RPC');
select is(has_function_privilege('service_role', 'public.vote_restaurant_target(uuid)', 'EXECUTE'), true, 'service_role can execute the target RPC');

select * from finish();
rollback;