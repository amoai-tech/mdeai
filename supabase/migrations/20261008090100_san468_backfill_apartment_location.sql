-- =============================================================================
-- Migration: 20261008090100_san468_backfill_apartment_location.sql
-- Task:      SAN-468 · REAL-002 — Make Production Rental Inventory Launch-Ready
-- =============================================================================
-- Restore the PostGIS invariant for rows written before the location-sync trigger.
--
-- Rows inserted before 20261006120000_san468_coordinate_integrity created
-- public.sync_apartment_location (for example 20260423130000_apartments_seed_enrichment)
-- carry latitude/longitude but a null location, which is exactly the "drift" the
-- inventory-quality report counts. A fresh database therefore showed 10 drift rows.
--
-- public.apartments.location is a DERIVED representation of the stored coordinate
-- pair, not an independent fact. Recomputing it from that pair adds no information
-- and is the same value the trigger would have written. The trigger keeps it synced
-- on every later coordinate/location write.
--
-- Only rows with a complete in-range pair are touched. The
-- apartments_coordinate_pair_check already guarantees that shape. Idempotent: a row
-- whose location already matches its pair is not updated.
-- =============================================================================

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
