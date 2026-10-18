
-- SAN-1524 · vote_restaurant_contest_options: the page can ASK when the target is ambiguous.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('f1524000-0000-4000-8000-000000000001','san1524-org@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1524000-0000-4000-8000-000000000001', '[TEST] San1524 Restaurant', true),
  ('a1524000-0000-4000-8000-000000000002', '[TEST] San1524 Lonely', true);

insert into vote.contests (slug, kind, title, org_id, starts_at, ends_at, status) values
  ('san1524-first', 'restaurant', '[TEST] San1524 First', 'f1524000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '30 days', 'draft'),
  ('san1524-second', 'restaurant', '[TEST] San1524 Second', 'f1524000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '30 days', 'draft'),
  ('san1524-pageant', 'pageant', '[TEST] San1524 Pageant', 'f1524000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '30 days', 'draft');

insert into vote.entities (contest_id, slug, display_name, restaurant_id) values
  ((select id from vote.contests where slug = 'san1524-first'), 'ent-first', 'Restaurant', 'a1524000-0000-4000-8000-000000000001'),
  ((select id from vote.contests where slug = 'san1524-pageant'), 'ent-pageant', 'Restaurant', 'a1524000-0000-4000-8000-000000000001');

select is(
  jsonb_array_length(public.vote_restaurant_contest_options('a1524000-0000-4000-8000-000000000001')),
  1, 'a single restaurant contest yields one option');
select is(
  (public.vote_restaurant_contest_options('a1524000-0000-4000-8000-000000000001')) -> 0 ->> 'contest_title',
  '[TEST] San1524 First', 'the option names the real contest');

insert into vote.entities (contest_id, slug, display_name, restaurant_id) values
  ((select id from vote.contests where slug = 'san1524-second'), 'ent-second', 'Restaurant', 'a1524000-0000-4000-8000-000000000001');

select is(
  jsonb_array_length(public.vote_restaurant_contest_options('a1524000-0000-4000-8000-000000000001')),
  2, 'two restaurant contests yield two options and the pageant is excluded');
select is(
  public.vote_restaurant_contest_options('a1524000-0000-4000-8000-000000000002'),
  '[]'::jsonb, 'a restaurant in no contest yields an empty list, not an error');

select is(
  has_function_privilege('authenticated', 'public.vote_restaurant_contest_options(uuid)', 'EXECUTE'),
  false, 'the browser cannot read contest options directly');

select * from finish();
rollback;
