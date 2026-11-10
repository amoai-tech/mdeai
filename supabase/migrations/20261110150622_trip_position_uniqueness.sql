-- A trip cannot have two stops in the same explicit slot.
ALTER TABLE public.trip_items
  DROP CONSTRAINT IF EXISTS trip_items_trip_id_position_unique;

-- Historical migration window: an explicit position could have been written
-- before this constraint existed. Lock, reassign only duplicates, then add the
-- constraint in the same transaction. No rows are dropped.
LOCK TABLE public.trip_items IN ACCESS EXCLUSIVE MODE;
WITH duplicates AS (
  SELECT id,
         trip_id,
         row_number() OVER (
           PARTITION BY trip_id, position
           ORDER BY created_at, id
         ) AS duplicate_number,
         max(position) OVER (PARTITION BY trip_id) AS max_position
  FROM public.trip_items
),
pending AS (
  SELECT id, trip_id, max_position
  FROM duplicates
  WHERE duplicate_number > 1
),
renumbered AS (
  SELECT id,
         max_position + row_number() OVER (
           PARTITION BY trip_id
           ORDER BY id
         ) AS new_position
  FROM pending
)
UPDATE public.trip_items ti
SET position = renumbered.new_position
FROM renumbered
WHERE ti.id = renumbered.id;

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
