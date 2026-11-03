-- SAN-1524 · technical test fixtures are invisible to visitors, still usable by admins
begin;
select plan(6);

insert into auth.users (id, email) values
  ('f1526000-0000-4000-8000-000000000001','fixture-a@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1526000-0000-4000-8000-000000000001','[TEST] Fixture Restaurant', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status, is_test_fixture) values
  ('c1526000-0000-4000-8000-000000000001','real-contest','restaurant','[TEST] Real Contest','f1526000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '1 day','live', false),
  ('c1526000-0000-4000-8000-000000000002','fixture-contest','restaurant','[TEST] Fixture Contest','f1526000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '1 day','live', true);
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1526000-0000-4000-8000-000000000001','c1526000-0000-4000-8000-000000000001','real-e','[TEST] Real E','a1526000-0000-4000-8000-000000000001'),
  ('e1526000-0000-4000-8000-000000000002','c1526000-0000-4000-8000-000000000002','fixture-e','[TEST] Fixture E','a1526000-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from jsonb_array_elements(public.contest_public_list()) e
    where e ->> 'slug' = 'fixture-contest'),
  0, 'a marked test fixture never appears in the public contest list');

select is(
  (select count(*)::int from jsonb_array_elements(public.contest_public_list()) e
    where e ->> 'slug' = 'real-contest'),
  1, 'a real restaurant contest still appears');

select is(public.contest_public_get('fixture-contest'), null::jsonb,
  'a marked fixture cannot be opened by direct link');

select is(public.contest_public_get('c1526000-0000-4000-8000-000000000002'), null::jsonb,
  'a marked fixture cannot be opened by id');

select is(public.contest_public_get('real-contest') -> 'contest' ->> 'title', '[TEST] Real Contest',
  'a real contest still resolves');

select is(
  (select is_test_fixture from vote.contests where slug = 'fixture-contest'),
  true, 'the fixture row still exists for admin and voting paths');

select * from finish();
rollback;