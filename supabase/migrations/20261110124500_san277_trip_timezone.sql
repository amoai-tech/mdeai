-- SAN-277: explicit trip-local timezone.
-- Existing Medellín trips default to America/Bogota. New trips inherit it
-- until a trip editor exposes a destination-specific timezone.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Bogota';

COMMENT ON COLUMN public.trips.timezone
  IS 'IANA timezone used to group and display the trip itinerary.';
