-- SAN-468 §2.2 / §2.3 regression proof — apartment coordinate integrity + fail-closed default.
--
-- Run with: supabase test db
--
-- Transaction-owned fixtures are rolled back at the end. The assertions cover the
-- exact invariant SAN-468 requires: null/null ok; valid pair ok and synced into the
-- PostGIS `location`; half pair, out-of-range, and direct-location drift rejected or
-- corrected; new apartments inactive by default.

begin;

select plan(18);

-- ── Database objects exist ────────────────────────────────────────────────────
select is(
  (select count(*)::int
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'apartments'
      and con.conname = 'apartments_coordinate_pair_check'),
  1, 'coordinate pair CHECK exists');
select has_function('public', 'sync_apartment_location',
  'location sync function exists');
select has_trigger('public', 'apartments', 'trg_sync_apartment_location',
  'location sync trigger exists');

-- ── Invalid coordinate shapes are rejected (23514 = check_violation) ──────────
select throws_ok(
  $$insert into public.apartments (title, neighborhood, latitude)
    values ('SAN468 half', 'Laureles', 6.2)$$,
  '23514', null::text, 'half coordinate pair (lat only) rejected');

select throws_ok(
  $$insert into public.apartments (title, neighborhood, latitude, longitude)
    values ('SAN468 lat range', 'Laureles', 91, -75)$$,
  '23514', null::text, 'out-of-range latitude rejected');

select throws_ok(
  $$insert into public.apartments (title, neighborhood, latitude, longitude)
    values ('SAN468 lng range', 'Laureles', 6, -181)$$,
  '23514', null::text, 'out-of-range longitude rejected');

-- ── Coordinate-less draft is legitimate and fails closed ─────────────────────
select lives_ok(
  $$insert into public.apartments (id, title, slug, neighborhood)
    values ('c4680000-0000-4000-8000-000000000001', 'SAN468 no coords',
            'san468-no-coords', 'Laureles')$$,
  'null/null coordinates allowed');

select is(
  (select status from public.apartments where id = 'c4680000-0000-4000-8000-000000000001'),
  'inactive', 'new apartment defaults to inactive');

-- ── Valid pair is stored and location is synchronized ────────────────────────
select lives_ok(
  $$insert into public.apartments (id, title, slug, neighborhood, latitude, longitude)
    values ('c4680000-0000-4000-8000-000000000002', 'SAN468 coords',
            'san468-coords', 'Laureles', 6.2447, -75.5916)$$,
  'valid coordinate pair allowed');

select is(
  (select round(st_x(location::geometry)::numeric, 6)
   from public.apartments where id = 'c4680000-0000-4000-8000-000000000002'),
  -75.591600::numeric, 'location longitude derived from longitude');

select is(
  (select round(st_y(location::geometry)::numeric, 6)
   from public.apartments where id = 'c4680000-0000-4000-8000-000000000002'),
  6.244700::numeric, 'location latitude derived from latitude');

-- ── Updating coordinates re-synchronizes location ────────────────────────────
select lives_ok(
  $$update public.apartments set latitude = 7.0, longitude = -74.0
    where id = 'c4680000-0000-4000-8000-000000000002'$$,
  'coordinate update allowed');

select is(
  (select round(st_x(location::geometry)::numeric, 6)
   from public.apartments where id = 'c4680000-0000-4000-8000-000000000002'),
  -74.000000::numeric, 'location re-synchronized after coordinate update');

-- ── Clearing coordinates clears location ─────────────────────────────────────
select lives_ok(
  $$update public.apartments set latitude = null, longitude = null
    where id = 'c4680000-0000-4000-8000-000000000002'$$,
  'clearing coordinates allowed');

select is(
  (select location is null from public.apartments
   where id = 'c4680000-0000-4000-8000-000000000002'),
  true, 'location cleared when coordinates are cleared');

-- ── A direct location write cannot drift from the coordinates ────────────────
select lives_ok(
  $$update public.apartments
    set latitude = 7.0, longitude = -75.0,
        location = st_setsrid(st_makepoint(-70, 1), 4326)::geography
    where id = 'c4680000-0000-4000-8000-000000000002'$$,
  'direct location write allowed');

select is(
  (select round(st_x(location::geometry)::numeric, 6)
   from public.apartments where id = 'c4680000-0000-4000-8000-000000000002'),
  -75.000000::numeric, 'direct location write is overwritten from the coordinates');

-- ── Updating a valid row into a half pair is rejected ────────────────────────
select throws_ok(
  $$update public.apartments set latitude = 6.1, longitude = null
    where id = 'c4680000-0000-4000-8000-000000000002'$$,
  '23514', null::text, 'half pair on update rejected');

select * from finish();
rollback;
