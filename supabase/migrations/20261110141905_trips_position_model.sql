-- Follow-up: explicit per-trip order for future manual Reorder.
-- Existing trips are backfilled in their current deterministic order.
ALTER TABLE public.trip_items ADD COLUMN IF NOT EXISTS position integer;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY trip_id
           ORDER BY start_at ASC NULLS LAST, created_at ASC, id ASC
         ) - 1 AS pos
  FROM public.trip_items
)
UPDATE public.trip_items ti
SET position = ranked.pos
FROM ranked
WHERE ti.id = ranked.id
  AND ti.position IS NULL;

ALTER TABLE public.trip_items ALTER COLUMN position SET DEFAULT 0;
ALTER TABLE public.trip_items ALTER COLUMN position SET NOT NULL;

ALTER TABLE public.trip_items DROP CONSTRAINT IF EXISTS trip_items_position_check;
ALTER TABLE public.trip_items ADD CONSTRAINT trip_items_position_check
  CHECK (position >= 0);

CREATE OR REPLACE FUNCTION public.assign_trip_item_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.position IS NULL OR NEW.position = 0 THEN
    -- Serialize appends per trip; a future reorder RPC can write an explicit position.
    PERFORM 1 FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
    SELECT COALESCE(MAX(position), -1) + 1
      INTO NEW.position
      FROM public.trip_items
     WHERE trip_id = NEW.trip_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_trip_item_position() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_trip_item_position() TO service_role;

DROP TRIGGER IF EXISTS trip_items_assign_position ON public.trip_items;
CREATE TRIGGER trip_items_assign_position
  BEFORE INSERT ON public.trip_items
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_trip_item_position();

COMMENT ON COLUMN public.trip_items.position
  IS 'Per-trip append position; reserved for explicit manual reorder.';
