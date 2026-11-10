-- A trip cannot have two stops in the same explicit slot.
ALTER TABLE public.trip_items
  DROP CONSTRAINT IF EXISTS trip_items_trip_id_position_unique;
ALTER TABLE public.trip_items
  ADD CONSTRAINT trip_items_trip_id_position_unique UNIQUE (trip_id, position);

-- Serialize append position allocation per trip. The advisory lock is held
-- until transaction end, so concurrent appends cannot read the same MAX().
CREATE OR REPLACE FUNCTION public.assign_trip_item_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.position IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.trip_id::text, 0));
    SELECT COALESCE(MAX(position), -1) + 1
      INTO NEW.position
      FROM public.trip_items
     WHERE trip_id = NEW.trip_id;
  END IF;
  RETURN NEW;
END;
$$;
