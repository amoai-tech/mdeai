-- SAN-279: harden the canonical trip-item writer.
--
-- Adds the explicit venue/café type so a venue_anchors UUID is not forced
-- through the restaurants table.
--
-- Fixes:
--   * events.name, not the nonexistent events.title
--   * real event coordinates/address instead of NULL
--   * explicit empty search_path and schema-qualified objects
--   * authenticated-only execution (no anon/PUBLIC execute)
--   * retry-safe conflict handling: return the existing item unchanged
--
-- The conflict branch deliberately does not overwrite title or schedule on a
-- retry. Editing an existing stop is a separate user action, not a side effect
-- of pressing "Add to trip" twice.

ALTER TABLE public.trip_items DROP CONSTRAINT IF EXISTS trip_items_item_type_check;
ALTER TABLE public.trip_items ADD CONSTRAINT trip_items_item_type_check
  CHECK (item_type IN (
    'rental','event','restaurant','venue','poi','showing','booking','custom_note','other'
  ));

CREATE OR REPLACE FUNCTION public.insert_trip_item_for_user(
  p_trip_id uuid,
  p_item_type text,
  p_source_id uuid,
  p_title text DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item_id uuid;
  v_title text;
  v_lat numeric;
  v_lng numeric;
  v_address text;
  v_found boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id AND t.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Trip not found or not owned by user';
  END IF;

  v_title := NULL;
  v_lat := NULL;
  v_lng := NULL;
  v_address := NULL;

  CASE p_item_type
    WHEN 'event' THEN
      SELECT e.name, e.latitude, e.longitude, e.address
      INTO v_title, v_lat, v_lng, v_address
      FROM public.events e
      WHERE e.id = p_source_id;
      v_found := FOUND;
    WHEN 'restaurant' THEN
      SELECT r.name, r.latitude, r.longitude, r.address
      INTO v_title, v_lat, v_lng, v_address
      FROM public.restaurants r
      WHERE r.id = p_source_id;
      v_found := FOUND;
    WHEN 'rental' THEN
      SELECT a.title, a.latitude, a.longitude, a.address
      INTO v_title, v_lat, v_lng, v_address
      FROM public.apartments a
      WHERE a.id = p_source_id;
      v_found := FOUND;
    WHEN 'venue' THEN
      SELECT v.name, v.latitude, v.longitude, NULL::text
      INTO v_title, v_lat, v_lng, v_address
      FROM public.venue_anchors v
      WHERE v.id = p_source_id;
      v_found := FOUND;
    WHEN 'showing' THEN
      SELECT COALESCE(p_title, 'Showing'), NULL::numeric, NULL::numeric, NULL::text
      INTO v_title, v_lat, v_lng, v_address
      FROM public.showings s
      WHERE s.id = p_source_id;
      v_found := FOUND;
    WHEN 'booking' THEN
      SELECT COALESCE(p_title, 'Booking'), NULL::numeric, NULL::numeric, NULL::text
      INTO v_title, v_lat, v_lng, v_address
      FROM public.bookings b
      WHERE b.id = p_source_id;
      v_found := FOUND;
    WHEN 'custom_note', 'poi', 'other' THEN
      v_title := COALESCE(p_title, 'Item');
      v_found := true;
    ELSE
      RAISE EXCEPTION 'Unsupported item_type: %', p_item_type;
  END CASE;

  IF NOT v_found OR (v_title IS NULL AND p_item_type NOT IN ('custom_note', 'poi', 'other')) THEN
    RAISE EXCEPTION 'Source entity not found for type % id %', p_item_type, p_source_id;
  END IF;

  v_title := COALESCE(p_title, v_title, 'Item');

  INSERT INTO public.trip_items (
    trip_id, item_type, source_id, title, start_at, end_at,
    latitude, longitude, address, created_by
  )
  VALUES (
    p_trip_id, p_item_type, p_source_id, v_title, p_start_at, p_end_at,
    v_lat, v_lng, v_address, v_user_id
  )
  ON CONFLICT (trip_id, item_type, source_id)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_trip_item_for_user(uuid, text, uuid, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_trip_item_for_user(uuid, text, uuid, text, timestamptz, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.insert_trip_item_for_user(uuid, text, uuid, text, timestamptz, timestamptz)
  IS 'SAN-279: owner-scoped, authenticated-only trip writer. Retries return the existing item unchanged.';
