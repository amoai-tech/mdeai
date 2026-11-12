-- A future reorder can swap/shift positions inside one transaction by running
-- SET CONSTRAINTS trip_items_trip_id_position_unique DEFERRED.
ALTER TABLE public.trip_items
  DROP CONSTRAINT IF EXISTS trip_items_trip_id_position_unique;
ALTER TABLE public.trip_items
  ADD CONSTRAINT trip_items_trip_id_position_unique
  UNIQUE (trip_id, position)
  DEFERRABLE INITIALLY IMMEDIATE;
