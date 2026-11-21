-- Position 0 must remain available to a future reorder RPC; only NULL means
-- "append". NOT NULL is still satisfied because the BEFORE INSERT trigger runs
-- before constraint checks.
ALTER TABLE public.trip_items ALTER COLUMN position DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.assign_trip_item_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.position IS NULL THEN
    PERFORM 1 FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
    SELECT COALESCE(MAX(position), -1) + 1
      INTO NEW.position
      FROM public.trip_items
     WHERE trip_id = NEW.trip_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.trip_items.position
  IS 'Per-trip order; NULL on insert means append, 0 is a valid explicit slot.';
