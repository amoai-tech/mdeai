-- SAN-1539: guarded, source-backed corrections from the 2026-10-27 Places audit.
-- Sources: local audit CSV/JSON + live Google Places API (New) + Elcielo official site.
-- Existing restaurant rows all had a Google ID; some identified the WRONG place.
-- Do not invent replacement Place IDs for unresolved identities.
-- Ambiguous rows stay visible in Phase A; this does not enforce any booking gate.
--
-- Verification report:
-- /home/sk/Downloads/mde-restaurant-place-id-audit-2026-10-27.csv
-- /home/sk/Downloads/mde-restaurant-place-id-audit-2026-10-27.json
-- /home/sk/Downloads/mde-restaurant-place-id-alternatives-2026-10-27.json

-- Fresh migrations insert these canonical restaurant rows with NULL Google IDs.
-- The independently audited existing catalog instead has the known old IDs.
-- Accept both VERIFIED starting states, but never a conflicting non-NULL
-- Place ID, a renamed/missing source restaurant, or a destination assigned
-- to a different restaurant.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000004'::uuid
      AND name = 'El Cielo'
      AND (google_place_id IS NULL
           OR google_place_id = 'ChIJ9dyLhikoRI4R1IEZoWSmNOo')
  ) THEN
    RAISE EXCEPTION 'SAN-1539: El Cielo source identity conflict or missing row';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000002'::uuid
      AND name = 'Hacienda Junín'
      AND (google_place_id IS NULL
           OR google_place_id = 'ChIJw67M_fgoRI4RMiM53OU6lnQ')
  ) THEN
    RAISE EXCEPTION 'SAN-1539: Hacienda Junín source identity conflict or missing row';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE google_place_id = 'ChIJF8IIwLcoRI4RKCdeMuiochQ'
      AND id <> 'a1b2c3d4-e5f6-4789-abcd-100000000004'::uuid
  ) THEN
    RAISE EXCEPTION 'SAN-1539: Elcielo restaurant Place ID assigned to another restaurant';
  END IF;
END $;

-- Elcielo official restaurant is Calle 7D #43C-36, not Bar Restaurante Divino Cielo.
-- Google Text Search independently returned the following restaurant Place ID.
UPDATE public.restaurants
SET name = 'Elcielo Restaurant Medellín',
    google_place_id = 'ChIJF8IIwLcoRI4RKCdeMuiochQ',
    address = 'Calle 7D #43C-36, El Poblado, Medellín',
    neighborhood = 'El Poblado',
    latitude = 6.2091132,
    longitude = -75.5732386,
    maps_url = 'https://www.google.com/maps/search/?api=1&query=Elcielo%20Restaurant%20Medellin&query_place_id=ChIJF8IIwLcoRI4RKCdeMuiochQ',
    updated_at = now()
WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000004'::uuid
  AND name = 'El Cielo'
  AND (google_place_id IS NULL
       OR google_place_id = 'ChIJ9dyLhikoRI4R1IEZoWSmNOo');

-- The second existing El Cielo row resolves to the HOTEL, not its restaurant.
-- Correct its identity, retaining the verified hotel ID (do not merge UUIDs).
UPDATE public.restaurants
SET name = 'Elcielo Hotel Medellín',
    address = 'Calle 7D #43C-36, El Poblado, Medellín',
    updated_at = now()
WHERE id = 'fc6031d7-dcf6-44c3-9547-f7172c37ee95'::uuid
  AND google_place_id = 'ChIJr0z5xCooRI4Ra4Xl8WYtmk4';

-- Hacienda Junín existing Place ID resolves to its actual downtown branch.
-- Replace the conflicting Laureles street address/coordinates; do not change ID.
UPDATE public.restaurants
SET address = 'Carrera 49 Junín #52-98, La Candelaria, Medellín',
    neighborhood = 'La Candelaria',
    latitude = 6.250762,
    longitude = -75.56577,
    updated_at = now()
WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000002'::uuid
  AND name = 'Hacienda Junín'
  AND (google_place_id IS NULL
       OR google_place_id = 'ChIJw67M_fgoRI4RMiM53OU6lnQ');

-- Mandatory corrections must actually be present after both UPDATE statements.
-- Keep failure atomic: do not allow a green migration that updated zero rows.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000004'::uuid
      AND name = 'Elcielo Restaurant Medellín'
      AND google_place_id = 'ChIJF8IIwLcoRI4RKCdeMuiochQ'
      AND address = 'Calle 7D #43C-36, El Poblado, Medellín'
  ) THEN
    RAISE EXCEPTION 'SAN-1539: Elcielo restaurant correction not applied';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000002'::uuid
      AND name = 'Hacienda Junín'
      AND address = 'Carrera 49 Junín #52-98, La Candelaria, Medellín'
  ) THEN
    RAISE EXCEPTION 'SAN-1539: Hacienda Junín correction not applied';
  END IF;
END $;

-- Correct the coordinate drift for the independently name-matched venue.
UPDATE public.restaurants
SET address = 'Calle 10B #35-27, El Poblado, Medellín',
    latitude = 6.2100964,
    longitude = -75.5650459,
    updated_at = now()
WHERE id = 'c561298a-0223-4248-b682-7df235f22d53'::uuid
  AND google_place_id = 'ChIJvRHAGS4pRI4RHkZo2NXtFAc';

-- MDE Verdeo's stored Place ID resolves to BURDO (~487m away).
-- No verified replacement found. Remove the WRONG ID/pin; retain the UUID.
UPDATE public.restaurants
SET google_place_id = NULL, maps_url = NULL,
    latitude = NULL, longitude = NULL, updated_at = now()
WHERE id = 'a1b2c3d4-e5f6-4789-abcd-100000000005'::uuid
  AND google_place_id = 'ChIJqWx0yikoRI4R62vONfeQ86M';

-- El Colombiano's stored Place ID resolves to a street address, not a restaurant.
-- No reliable replacement was found. Preserve MDE UUID and unknown Google ID.
UPDATE public.restaurants
SET google_place_id = NULL, maps_url = NULL,
    latitude = NULL, longitude = NULL, updated_at = now()
WHERE id = '73c6454d-c690-4b7b-949a-9268ca789682'::uuid
  AND google_place_id = 'ChIJ6Z6glysoRI4RI1q640G2lJ4';

-- Store audit evidence only, not a Phase A business-approval/booking gate.
-- Google business status is a dated observation, NOT an authoritative MDE approval.
UPDATE public.restaurants
SET details = jsonb_set(
    CASE WHEN jsonb_typeof(details) = 'object' THEN details ELSE '{}'::jsonb END,
    '{google_places_status_audit}',
    jsonb_build_object(
      'status', CASE
        WHEN id IN ('479bfb88-5e09-4719-b7ee-c1f3f5758477'::uuid,
                    '1585f3fb-d5eb-4ec3-83eb-39acf9113a88'::uuid)
          THEN 'CLOSED_PERMANENTLY'
        ELSE 'CLOSED_TEMPORARILY'
      END,
      'checked_at', '2026-10-27',
      'source', 'Google Places API (New)',
      'review_required', true
    ), true
  ), updated_at = now()
WHERE (id, google_place_id) IN (
  ('479bfb88-5e09-4719-b7ee-c1f3f5758477'::uuid, 'ChIJ7QzOqECDRo4RiQfSwxV7fbo'),
  ('1585f3fb-d5eb-4ec3-83eb-39acf9113a88'::uuid, 'ChIJ7fBJUgApRI4REwgd1Vw4sCI'),
  ('aff88933-a93c-4d22-82e3-7187b16626c9'::uuid, 'ChIJ_zRtl4KCRo4RcgzllYybHec'),
  ('c561298a-0223-4248-b682-7df235f22d53'::uuid, 'ChIJvRHAGS4pRI4RHkZo2NXtFAc'),
  ('3325a454-4632-4bfc-9427-94bdd2ab6c62'::uuid, 'ChIJYbI3K7kpRI4Rnugvn8-3wEU')
);
