-- =============================================================================
-- Migration: 20261008090500_san1433_candidate_coordinates.sql
-- Task:      SAN-1433 — Add verified coordinates and essential launch data to
--            staged rentals (parent SAN-1431)
-- =============================================================================
-- Adds trusted map pins for 8 of the 10 staged Rentberry candidates and the
-- confirmed Alizares availability date.
--
-- COORDINATE EVIDENCE ONLY. This migration must NOT mark landlord/owner-control,
-- property, freshness or photo verification, and must not publish anything. It
-- writes latitude/longitude plus a coordinate_evidence record; the existing
-- trg_sync_apartment_location trigger derives location geography(Point,4326) from
-- the pair, so PostGIS data is never constructed here.
--
-- HOLD (intentionally untouched): Pie de Cuesta (candidate-rentberry-119839663,
-- ambiguous building match) and El Laurel (candidate-rentberry-el-laurel-201,
-- unresolved).
--
-- Idempotent: each row is updated only while both coordinates are still null and
-- the evidence object is merged, so re-running is a no-op. Price, currency,
-- address, bedrooms, bathrooms and size are not touched.
--
-- NOTE: the source/check date/match type below are the values supplied with
-- SAN-1433. They are recorded as provenance, not as a stronger claim. Confirm the
-- exact check date and match type before relying on them.
-- =============================================================================

with coordinates (slug, latitude, longitude, source, checked_at, match_type) as (
  values
    ('candidate-rentberry-119391131', 6.2188538::numeric, -75.6034118::numeric, 'google_maps', date '2026-10-06', 'exact_named_building'),
    ('candidate-rentberry-119390518', 6.1884708::numeric, -75.5624821::numeric, 'google_maps', date '2026-10-06', 'exact_named_building'),
    ('candidate-rentberry-119839712', 6.1864096::numeric, -75.5686795::numeric, 'google_maps', date '2026-10-06', 'exact_named_building'),
    ('candidate-rentberry-119839707', 6.2220797::numeric, -75.5735020::numeric, 'google_maps', date '2026-10-06', 'exact_named_building'),
    ('candidate-rentberry-119840596', 6.1901416::numeric, -75.5726974::numeric, 'google_maps', date '2026-10-06', 'exact_named_building'),
    ('candidate-rentberry-119388617', 6.2140535::numeric, -75.5678635::numeric, 'google_maps', date '2026-10-06', 'exact_named_building'),
    ('candidate-rentberry-118796331', 6.2401220::numeric, -75.5983370::numeric, 'google_maps', date '2026-10-06', 'exact_street_address'),
    ('candidate-rentberry-telaviv-1204', 6.2462923::numeric, -75.5984332::numeric, 'google_maps', date '2026-10-06', 'exact_named_building')
)
update public.apartments a
   set latitude = c.latitude,
       longitude = c.longitude,
       metadata = coalesce(a.metadata, '{}'::jsonb)
         || jsonb_build_object(
              'coordinates_status', 'verified',
              'coordinate_evidence', jsonb_build_object(
                'source', c.source,
                'checked_at', c.checked_at,
                'match_type', c.match_type
              )
            )
  from coordinates c
 where a.slug = c.slug
   and a.latitude is null
   and a.longitude is null;

-- Confirmed availability for Alizares only; every other candidate stays unknown.
update public.apartments
   set available_from = date '2026-10-06'
 where slug = 'candidate-rentberry-119391131'
   and available_from is null;
