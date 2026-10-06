-- SAN-468 · REAL-002 — Apartment inventory quality
-- External rental candidates — operator-run seed (NOT a migration).
--
-- Applied to: production project zkwcbyxiwklihegjhuql on 2026-10-05 via psql.
-- This file is intentionally OUTSIDE supabase/migrations/ so `supabase db push`
-- does not auto-replay it. Apply it deliberately to a chosen environment:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 \
--     -f supabase/seeds/rentals/external-candidates-2026-10-05.sql
--
-- What it does: stores 5 real external marketplace listings as fail-closed
-- `external_candidate` rows in public.apartments. They are NEVER publicly
-- requestable until separately verified and promoted through the normal workflow.
--
-- State contract (do not change in this seed):
--   status='inactive', moderation_status='pending', listing_workflow_status='draft',
--   verified=false, freshness_status='unconfirmed'; no coordinates, owner, or images.
--
-- Idempotent: the NOT EXISTS guard is keyed on source_url / source_listing_id, so
-- re-running inserts 0 rows and never duplicates an existing candidate.
--
-- Verification (run after applying):
--   select title, neighborhood, price_monthly, currency, status, moderation_status,
--          listing_workflow_status, freshness_status, landlord_id, latitude, longitude,
--          source_listing_id, source_url
--   from public.apartments
--   where metadata->>'inventory_kind' = 'external_candidate'
--   order by price_monthly;
--
-- Expected: fresh environment INSERT 0 5; replay INSERT 0 0.

WITH candidates (
  title,
  slug,
  neighborhood,
  address,
  city,
  bedrooms,
  bathrooms,
  size_sqm,
  price_monthly,
  currency,
  source_url,
  source_listing_id,
  metadata
) AS (
  VALUES

  (
    'Apartamento en Arriendo 2do Parque Laureles Medellín',
    'external-mercadolibre-mco-4491119468',
    'Laureles',
    NULL,
    'Medellín',
    2,
    2,
    74,
    3200000,
    'COP',
    'https://apartamento.mercadolibre.com.co/MCO-4491119468-apartamento-en-arriendo-2do-parque-laureles-medellin-_JM',
    'mercadolibre:MCO-4491119468',
    '{"inventory_kind":"external_candidate","source_name":"Mercado Libre","source_observed_date":"2026-10-05"}'::jsonb
  ),

  (
    'Apartamento en Arriendo Laureles 473-23491',
    'external-mercadolibre-mco-4487495618',
    'Laureles',
    NULL,
    'Medellín',
    3,
    2,
    168,
    4500000,
    'COP',
    'https://apartamento.mercadolibre.com.co/MCO-4487495618-apartamento-en-arriendo-laureles-473-23491-_JM',
    'mercadolibre:MCO-4487495618',
    '{"inventory_kind":"external_candidate","source_name":"Mercado Libre","source_observed_date":"2026-10-05"}'::jsonb
  ),

  (
    'Apartamento en Laureles — Zitios 10131396',
    'external-zitios-10131396',
    'Laureles',
    NULL,
    'Medellín',
    2,
    2,
    70,
    2500000,
    'COP',
    'https://zitios.com.co/inmueble/arriendo-apartamento-sector-laureles_10131396',
    'zitios:10131396',
    '{"inventory_kind":"external_candidate","source_name":"Zitios","source_observed_date":"2026-10-05"}'::jsonb
  ),

  (
    'Apartamento en Laureles — Zitios 10361973',
    'external-zitios-10361973',
    'Laureles',
    NULL,
    'Medellín',
    3,
    3,
    110,
    7000000,
    'COP',
    'https://zitios.com.co/inmueble/arriendo-apartamento-laureles_10361973',
    'zitios:10361973',
    '{"inventory_kind":"external_candidate","source_name":"Zitios","source_observed_date":"2026-10-05"}'::jsonb
  ),

  (
    'Apartamento en Arriendo Las Acacias / Laureles',
    'external-ciencuadras-3454339',
    'Las Acacias',
    NULL,
    'Medellín',
    3,
    3,
    130,
    5500000,
    'COP',
    'https://www.ciencuadras.com/inmueble/apartamento-en-arriendo-en-las-acacias-medellin-3454339',
    'ciencuadras:3454339',
    '{"inventory_kind":"external_candidate","source_name":"Ciencuadras","source_observed_date":"2026-10-05"}'::jsonb
  )
)

INSERT INTO public.apartments (
  title,
  slug,
  neighborhood,
  address,
  city,
  bedrooms,
  bathrooms,
  size_sqm,
  price_monthly,
  currency,

  -- Unknown facts must remain unknown.
  furnished,
  utilities_included,
  pet_friendly,
  smoking_allowed,
  parking_included,

  -- External provenance.
  source,
  source_url,
  source_listing_id,
  metadata,

  -- Fail closed until verified.
  status,
  moderation_status,
  listing_workflow_status,
  verified,
  freshness_status,
  last_checked_at,

  -- No fabricated geo/media/ownership.
  latitude,
  longitude,
  location,
  images,
  landlord_id,
  host_id
)

SELECT
  c.title,
  c.slug,
  c.neighborhood,
  c.address,
  c.city,
  c.bedrooms,
  c.bathrooms,
  c.size_sqm,
  c.price_monthly,
  c.currency,

  NULL,
  NULL,
  NULL,
  NULL,
  NULL,

  'manual',
  c.source_url,
  c.source_listing_id,
  c.metadata,

  'inactive',
  'pending',
  'draft',
  false,
  'unconfirmed',
  NULL,

  NULL,
  NULL,
  NULL,
  ARRAY[]::text[],
  NULL,
  NULL

FROM candidates c

-- Make the script safe to rerun.
WHERE NOT EXISTS (
  SELECT 1
  FROM public.apartments a
  WHERE a.source_url = c.source_url
     OR a.source_listing_id = c.source_listing_id
)

RETURNING
  id,
  title,
  neighborhood,
  price_monthly,
  currency,
  status,
  listing_workflow_status,
  source_url;
