-- SAN-1502 · development read access to every listing for signed-in users
-- Proves: in development a signed-in user reads apartments of ANY status plus their vectors; anonymous
-- visitors still see none of them; in launch the signed-in user is back to the public rules.
-- Run with: supabase test db
begin;

select plan(8);

-- fixtures as the table owner: three statuses, each with a vector
insert into public.apartments (id, title, neighborhood, description, bedrooms, status)
values ('00000000-0000-4000-8000-00000052a001', 'DEV inactive loft', 'Laureles', 'x', 1, 'inactive'),
       ('00000000-0000-4000-8000-00000052a002', 'DEV pending flat',  'Laureles', 'x', 1, 'pending'),
       ('00000000-0000-4000-8000-00000052a003', 'DEV booked studio', 'Laureles', 'x', 0, 'booked');
insert into public.listing_embeddings (listing_id, embedding, model, content_hash)
select id, array_fill(0.01::float8, array[768])::extensions.vector, 'gemini-embedding-001', 'x'
  from public.apartments where id::text like '00000000-0000-4000-8000-00000052a%';

select is((select phase from public.rental_runtime_settings where singleton), 'development', 'setup: the rental phase is development');

-- ── development: a signed-in user sees all three, and their vectors ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id::text like '00000000-0000-4000-8000-00000052a%'), 3,
  'development: a signed-in user reads inactive, pending and booked apartments');
select is((select count(*)::int from public.listing_embeddings where listing_id::text like '00000000-0000-4000-8000-00000052a%'), 3,
  'development: and their search vectors');
reset role;

-- ── anonymous visitors get nothing extra ---------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true); -- a real anonymous request carries no user id
select is((select count(*)::int from public.apartments where id::text like '00000000-0000-4000-8000-00000052a%'), 0,
  'development: an anonymous visitor still sees none of them');
select is((select count(*)::int from public.listing_embeddings where listing_id::text like '00000000-0000-4000-8000-00000052a%'), 0,
  'development: and none of their vectors');
reset role;

-- ── a signed-in user with no profile still has no write access -----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.apartments set title = 'hijack' where id = '00000000-0000-4000-8000-00000052a001';
reset role;
select is((select title from public.apartments where id = '00000000-0000-4000-8000-00000052a001'), 'DEV inactive loft',
  'development: read access does not allow editing someone else''s listing');

-- ── launch: back to the public rules ------------------------------------------------------------------------
update public.rental_runtime_settings set phase = 'launch' where singleton;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id::text like '00000000-0000-4000-8000-00000052a%'), 0,
  'launch: the same signed-in user no longer sees inactive, pending or booked apartments');
select is((select count(*)::int from public.listing_embeddings where listing_id::text like '00000000-0000-4000-8000-00000052a%'), 0,
  'launch: nor their vectors');
reset role;

select * from finish();
rollback;
