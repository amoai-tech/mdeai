-- =============================================================================
-- Migration: 20261008090100_san468_backfill_apartment_location.sql
-- Task:      SAN-468 · REAL-002 — Make Production Rental Inventory Launch-Ready
-- =============================================================================
-- Restore the PostGIS invariant for rows written before the location-sync trigger.
--
-- ORDERING: this migration is dated after 20261006120000_san468_coordinate_integrity,
-- which created public.trg_sync_apartment_location. A guard below fails closed if that
-- trigger is somehow absent, so new writes are already protected before this backfill
-- runs.
--
-- CAUSE: rows inserted before that trigger (for example
-- 20260423130000_apartments_seed_enrichment) carry latitude/longitude but a null
-- location. A fresh database therefore reported 10 drift rows, and production
-- reports 1 (the inactive Bright 2BR row).
--
-- public.apartments.location is a DERIVED representation of the stored coordinate
-- pair, not an independent fact. Recomputing it from that pair adds no information
-- and is the same value the trigger would have written.
--
-- Only rows with a complete in-range pair are touched; the
-- apartments_coordinate_pair_check already guarantees that shape. Idempotent: a row
-- whose location already matches its pair is not updated. The NOTICE reports the
-- affected row count so an operator can confirm it matches the drift count.
-- =============================================================================

do $$
declare
  affected integer;
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_sync_apartment_location'
       and tgrelid = 'public.apartments'::regclass
  ) then
    raise exception 'SAN-468 backfill requires trg_sync_apartment_location (20261006120000); refusing to run';
  end if;

  update public.apartments
     set location = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
   where latitude is not null
     and longitude is not null
     and latitude between -90 and 90
     and longitude between -180 and 180
     and (
       location is null
       or abs(st_x(location::geometry) - longitude) >= 0.000001
       or abs(st_y(location::geometry) - latitude) >= 0.000001
     );

  get diagnostics affected = row_count;
  raise notice 'SAN-468 backfill synchronized location for % row(s)', affected;
end $$;
