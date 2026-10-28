-- SAN-1541 · Menu rows and restaurant photo storage are scoped by the server-owned
-- restaurant → partner assignment, never by a Google Place ID.
begin;

select plan(16);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a1541000-0000-4000-8000-000000000001','san1541-partner-a@example.com'),
  ('a1541000-0000-4000-8000-000000000002','san1541-partner-b@example.com');


insert into public.partners (id, profile_id, type, settings) values
  ('a1541000-0000-4000-8000-000000000011','a1541000-0000-4000-8000-000000000001','venue','{}'::jsonb),
  ('a1541000-0000-4000-8000-000000000012','a1541000-0000-4000-8000-000000000002','venue','{}'::jsonb);

insert into public.partner_members (partner_id, profile_id, role) values
  ('a1541000-0000-4000-8000-000000000011','a1541000-0000-4000-8000-000000000001','owner'),
  ('a1541000-0000-4000-8000-000000000012','a1541000-0000-4000-8000-000000000002','owner');

insert into public.restaurants (id, name, partner_id, google_place_id) values
  ('a1541000-0000-4000-8000-000000000031','Menu A','a1541000-0000-4000-8000-000000000011','place-1541-a'),
  ('a1541000-0000-4000-8000-000000000032','Menu B','a1541000-0000-4000-8000-000000000012','place-1541-b');

insert into public.restaurant_menu_items (id, restaurant_id, section, name, price_amount, currency, position) values
  ('a1541000-0000-4000-8000-000000000041','a1541000-0000-4000-8000-000000000031','Starters','A soup',18000,'COP',0),
  ('a1541000-0000-4000-8000-000000000042','a1541000-0000-4000-8000-000000000032','Starters','B soup',19000,'COP',0);

-- ── Menu visibility is public, writes are not ───────────────────────────────
set local role anon;
select is(
  (select count(*)::int from public.restaurant_menu_items),
  2, 'anonymous visitors can read the public menu');
select throws_ok(
  $$insert into public.restaurant_menu_items (restaurant_id, name) values ('a1541000-0000-4000-8000-000000000031','Anon item')$$,
  '42501', null, 'anonymous visitors cannot write menu items');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1541000-0000-4000-8000-000000000001',true);

insert into public.restaurant_menu_items
  (id, restaurant_id, section, name, description, price_amount, currency, position, source_url)
values
  ('a1541000-0000-4000-8000-000000000043','a1541000-0000-4000-8000-000000000031',
   'Mains','A main','Grilled',42000,'COP',1,'https://restaurant-a.example/menu');

select is(
  (select count(*)::int from public.restaurant_menu_items where restaurant_id='a1541000-0000-4000-8000-000000000031'),
  2, 'partner A adds a menu item to their own restaurant');

select throws_ok(
  $$insert into public.restaurant_menu_items (restaurant_id, name) values ('a1541000-0000-4000-8000-000000000032','Hijack')$$,
  '42501', null, 'partner A cannot add a menu item to restaurant B');

with attempted as (
  update public.restaurant_menu_items set name='Hijacked'
  where id='a1541000-0000-4000-8000-000000000042'
  returning id
)
select is((select count(*)::int from attempted), 0,
  'partner A cannot update restaurant B''s menu item');

with attempted as (
  delete from public.restaurant_menu_items
  where id='a1541000-0000-4000-8000-000000000042'
  returning id
)
select is((select count(*)::int from attempted), 0,
  'partner A cannot delete restaurant B''s menu item');

select throws_ok(
  $$insert into public.restaurant_menu_items (restaurant_id, name, price_amount)
    values ('a1541000-0000-4000-8000-000000000031','Bad price',-5)$$,
  '23514', null, 'a negative price is rejected by the database');

select throws_ok(
  $$insert into public.restaurant_menu_items (restaurant_id, name, currency)
    values ('a1541000-0000-4000-8000-000000000031','Bad currency','pesos')$$,
  '23514', null, 'a non-ISO currency is rejected by the database');

select is(
  (select price_amount::text from public.restaurant_menu_items where id='a1541000-0000-4000-8000-000000000043'),
  '42000.00', 'the price is stored exactly as the operator entered it');

-- ── Partner B keeps full control of its own menu ────────────────────────────
select set_config('request.jwt.claim.sub','a1541000-0000-4000-8000-000000000002',true);
with updated as (
  update public.restaurant_menu_items set name='B soup updated'
  where id='a1541000-0000-4000-8000-000000000042'
  returning id
)
select is((select count(*)::int from updated), 1,
  'partner B updates their own menu item');

select is(
  (select name from public.restaurant_menu_items where id='a1541000-0000-4000-8000-000000000043'),
  'A main', 'partner B''s update did not touch restaurant A''s menu');

-- ── Photo bucket: public read, member-scoped write policies ─────────────────
reset role;
select is(
  (select public from storage.buckets where id='restaurant-photos'),
  true, 'the restaurant photo bucket allows public reads');
select is(
  (select file_size_limit from storage.buckets where id='restaurant-photos'),
  5242880::bigint, 'the photo upload limit is enforced');
select is(
  (select array_agg(mime order by mime) from (
     select unnest(allowed_mime_types) as mime from storage.buckets where id='restaurant-photos'
   ) as allowed),
  array['image/jpeg','image/png','image/webp']::text[],
  'only image mime types are accepted');

select is(
  (select count(*)::int from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('restaurant_photos_storage_insert','restaurant_photos_storage_update','restaurant_photos_storage_delete')),
  3, 'insert/update/delete policies exist for restaurant photos');

select is(
  (select bool_and(with_check like '%restaurant-photos%' and with_check like '%partner_ids_for_user%')
   from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='restaurant_photos_storage_insert'),
  true, 'photo writes are scoped to the caller''s partner folder');

select * from finish();
rollback;
