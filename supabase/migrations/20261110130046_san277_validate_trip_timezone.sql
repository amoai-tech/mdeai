-- SAN-277: reject non-IANA timezone values even when an owner updates the row directly.
CREATE OR REPLACE FUNCTION public.validate_trip_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names
    WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', NEW.timezone
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_validate_timezone ON public.trips;
CREATE TRIGGER trips_validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_trip_timezone();

COMMENT ON FUNCTION public.validate_trip_timezone()
  IS 'SAN-277: trips.timezone must be a valid IANA name from pg_timezone_names.';
