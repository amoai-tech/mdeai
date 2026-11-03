-- SAN-1539: the MDE restaurant UUID is a valid booking identifier.
-- Phase A prelaunch: Google Places enrichment must not be a business booking gate.
-- Existing café and nightclub requests still identify their venue with a Place ID.
-- Retain canonical FK, per-user RLS, unique idempotency index and pending status.
ALTER TABLE public.venue_booking_requests
  ALTER COLUMN place_id DROP NOT NULL;

ALTER TABLE public.venue_booking_requests
  ADD CONSTRAINT venue_booking_requests_resource_identity_check
  CHECK (
    (
      venue_kind = 'restaurant'
      AND (
        restaurant_id IS NOT NULL
        OR nullif(btrim(place_id), '') IS NOT NULL
      )
    )
    OR (
      venue_kind IN ('cafe', 'nightclub')
      AND nullif(btrim(place_id), '') IS NOT NULL
    )
  );

COMMENT ON COLUMN public.venue_booking_requests.place_id IS
  'Optional for a canonical MDE restaurant UUID request; required for Google-only restaurants, cafés and nightclubs.';
