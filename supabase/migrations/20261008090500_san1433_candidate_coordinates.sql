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
-- PROVENANCE: the coordinates were supplied with SAN-1433, so the evidence records
-- 'provided_by' and 'supplied_at' only. source / checked_at / match_type are left
-- explicitly NULL until the operator confirms them against the real verification —
-- unverified task-supplied values are not asserted as provenance.
--
-- HOLD (intentionally untouched): Pie de Cuesta (candidate-rentberry-119839663,
-- ambiguous building match) and El Laurel (candidate-rentberry-el-laurel-201,
-- unresolved).
--
-- Idempotent: each row is updated only while both coordinates are still null and
-- the evidence object is merged, so re-running is a no-op. Price, currency,
-- address, bedrooms, bathrooms and size are not touched.
-- =============================================================================

with coordinates (slug, latitude, longitude, supplied_at) as (
  values
    ('candidate-rentberry-119391131', 6.2188538::numeric, -75.6034118::numeric, date '2026-10-06'),
    ('candidate-rentberry-119390518', 6.1884708::numeric, -75.5624821::numeric, date '2026-10-06'),
    ('candidate-rentberry-119839712', 6.1864096::numeric, -75.5686795::numeric, date '2026-10-06'),
    ('candidate-rentberry-119839707', 6.2220797::numeric, -75.5735020::numeric, date '2026-10-06'),
    ('candidate-rentberry-119840596', 6.1901416::numeric, -75.5726974::numeric, date '2026-10-06'),
    ('candidate-rentberry-119388617', 6.2140535::numeric, -75.5678635::numeric, date '2026-10-06'),
    ('candidate-rentberry-118796331', 6.2401220::numeric, -75.5983370::numeric, date '2026-10-06'),
    ('candidate-rentberry-telaviv-1204', 6.2462923::numeric, -75.5984332::numeric, date '2026-10-06')
)
update public.apartments a
   set latitude = c.latitude,
       longitude = c.longitude,
       metadata = coalesce(a.metadata, '{}'::jsonb)
         || jsonb_build_object(
              'coordinates_status', 'verified',
              'coordinate_evidence', jsonb_build_object(
                'provided_by', 'san1433',
                'supplied_at', c.supplied_at,
                'source', null,
                'checked_at', null,
                'match_type', null
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
