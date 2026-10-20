-- SAN-1524 · public contest read: restaurant-only scope, allowlisted shape, service-role only
begin;
select plan(18);

insert into auth.users (id, email) values
  ('f1524000-0000-4000-8000-0000000000aa','san1524-public@example.com');
insert into public.restaurants (id, name, neighborhood, is_active) values
  ('a1524000-0000-4000-8000-0000000000a1','[TEST] San1524 Alpha','El Poblado',true),
  ('a1524000-0000-4000-8000-0000000000a2','[TEST] San1524 Beta','Laureles',true);

insert into vote.contests (slug, kind, title, description, org_id, starts_at, ends_at, status) values
  ('san1524-public','restaurant','[TEST] San1524 Public','Published rules','f1524000-0000-4000-8000-0000000000aa', now() - interval '1 day', now() + interval '10 days','live'),
  ('san1524-pageant-pub','pageant','[TEST] San1524 Pageant',null,'f1524000-0000-4000-8000-0000000000aa', now() - interval '1 day', now() + interval '10 days','live');

insert into vote.entities (contest_id, slug, display_name, restaurant_id) values
  ((select id from vote.contests where slug = 'san1524-public'),'alpha','Alpha','a1524000-0000-4000-8000-0000000000a1'),
  ((select id from vote.contests where slug = 'san1524-public'),'beta','Beta','a1524000-0000-4000-8000-0000000000a2'),
  ((select id from vote.contests where slug = 'san1524-pageant-pub'),'pageant-entry','Pageant',null);

select is(
  (select count(*)::int from jsonb_array_elements(public.contest_public_list()) e
    where e ->> 'slug' = 'san1524-public'),
  1, 'the list contains the restaurant contest');

select is(
  (select count(*)::int from jsonb_array_elements(public.contest_public_list()) e
    where e ->> 'slug' = 'san1524-pageant-pub'),
  0, 'a pageant contest never appears in the public restaurant list');

select is(
  (select (e ->> 'nominees')::int from jsonb_array_elements(public.contest_public_list()) e
    where e ->> 'slug' = 'san1524-public'),
  2, 'the summary counts only linked nominees');

select is(
  public.contest_public_get('san1524-public') -> 'contest' ->> 'title',
  '[TEST] San1524 Public', 'a contest resolves by slug');

select is(
  public.contest_public_get((select id::text from vote.contests where slug = 'san1524-public')) -> 'contest' ->> 'slug',
  'san1524-public', 'a contest resolves by uuid too');

select is(
  jsonb_array_length(public.contest_public_get('san1524-public') -> 'nominees'),
  2, 'the detail returns both linked nominees');

select is(
  public.contest_public_get('san1524-pageant-pub'),
  null::jsonb, 'a pageant is not reachable through the public restaurant read');

select is(
  (select count(*)::int from jsonb_object_keys(
     public.contest_public_get('san1524-public') -> 'contest') k
    where k in ('org_id','judge_weight_pct','scoring_formula','free_votes_per_user_per_day','paid_votes_enabled')),
  0, 'the public payload exposes no private contest configuration');

select is(
  has_function_privilege('authenticated','public.contest_public_get(text)','EXECUTE'),
  false, 'the browser cannot call the public read directly');

-- Prove both read RPCs remain server-only even if grants change later.
select is(has_function_privilege('anon','public.contest_public_get(text)','EXECUTE'), false,
  'anon cannot execute the contest detail RPC');
select is(has_function_privilege('service_role','public.contest_public_get(text)','EXECUTE'), true,
  'service_role can execute the contest detail RPC');
select is(has_function_privilege('anon','public.contest_public_list()','EXECUTE'), false,
  'anon cannot execute the contest list RPC');
select is(has_function_privilege('authenticated','public.contest_public_list()','EXECUTE'), false,
  'authenticated cannot execute the contest list RPC');
select is(has_function_privilege('service_role','public.contest_public_list()','EXECUTE'), true,
  'service_role can execute the contest list RPC');

-- A category that belongs to ANOTHER contest must never label this contest's nominee.
insert into vote.categories (contest_id, slug, title, position) values
  ((select id from vote.contests where slug = 'san1524-pageant-pub'),'foreign-cat','Foreign Category',1);
update vote.entities
   set category_id = (select id from vote.categories where slug = 'foreign-cat')
 where contest_id = (select id from vote.contests where slug = 'san1524-public')
   and slug = 'alpha';

select is(
  (select count(*)::int
     from jsonb_array_elements(public.contest_public_get('san1524-public') -> 'nominees') n
    where n ->> 'category' = 'Foreign Category'),
  0, 'a category from another contest never labels a nominee');

-- A visitor who types an uppercase slug must still land on the contest.
select is(
  public.contest_public_get(upper('san1524-public')) -> 'contest' ->> 'slug',
  'san1524-public', 'the slug lookup ignores letter case');

-- A slug may legally equal another contest's UUID. An exact id match must win.
insert into vote.contests (slug, kind, title, org_id, status, starts_at, ends_at) values
  ('a1524000-0000-4000-8000-0000000000a1','restaurant','[TEST] San1524 Shadow',
   'f1524000-0000-4000-8000-0000000000aa','draft',
   now() - interval '1 day', now() + interval '10 days');

select is(
  public.contest_public_get('a1524000-0000-4000-8000-0000000000a1') -> 'contest' ->> 'title',
  '[TEST] San1524 Shadow', 'an exact id match resolves the contest that owns that id');

select is(
  public.contest_public_get((select id::text from vote.contests where slug = 'san1524-public'))
    -> 'contest' ->> 'slug',
  'san1524-public', 'a real uuid still resolves by id');

select * from finish();
rollback;
