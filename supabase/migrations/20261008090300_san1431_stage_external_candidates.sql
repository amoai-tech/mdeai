-- =============================================================================
-- Migration: 20261008090300_san1431_stage_external_candidates.sql
-- Task:      SAN-1431 — Source, stage, and verify 10 real Medellín rental candidates
-- Parent:    SAN-468 · REAL-002
-- =============================================================================
-- Stages the 10 Rentberry-sourced, exact-address Medellín leads as PRIVATE,
-- fail-closed inventory. Every field is a lead, never a trusted MDE fact:
--   status = 'inactive', moderation_status = 'pending', listing_workflow_status = 'draft'
--   verified = false, freshness_status = 'unconfirmed', last_checked_at = null
--   landlord_id = null, latitude/longitude/location = null
--   unknown amenities stay null; no photos are copied
-- Metadata marks the row as external with allowed_action = 'view_original_listing',
-- using BOTH the long-standing inventory_kind = 'external_candidate' marker (read by
-- scripts/sql/san468-inventory-quality-report.sql and the SAN-468 RLS predicate) and
-- the SAN-1431 inventory_type = 'external' marker.
--
-- neighborhood is set to 'Pending verification' for every row: the lead addresses do
-- not prove a neighborhood, so asserting one would invent a fact. The lead's own
-- neighborhood claim is retained in metadata.source_neighborhood_claim when it exists.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING / ON CONFLICT (apartment_id) DO NOTHING.
-- =============================================================================

with candidates (
  title, slug, address, bedrooms, bathrooms, size_sqm, price_monthly,
  source_url, source_listing_id, source_neighborhood_claim
) as (
  values
    ('Alizares Apt 301', 'candidate-rentberry-119391131',
     'Cl 7 81 49 Urb Alizares Ap 301, Medellín, Antioquia', 3, 2, 98, 2900000,
     'https://rentberry.com/co/apartments/119391131-three-br-cl-7-81-49-urb-alizares-ap-301-medellin-antioquia',
     '119391131', 'Loma de los Bernal'),
    ('Torres del Arroyo Apt 1104', 'candidate-rentberry-119390518',
     'Cl 11 Sur 25 150 Urb Torres Del Arroyo Ap 1104, Medellín, Antioquia', 2, 2, 90, 4300000,
     'https://rentberry.com/co/apartments/119390518-two-br-cl-11-sur-25-150-urb-torres-del-arroyo-ap-1104-medellin-antioquia',
     '119390518', 'Los Balsos'),
    ('Edificio Cantero Apt 801', 'candidate-rentberry-119839712',
     'Cl 15d Sur 32 72 Ed Cantero Ap 801, Medellín, Antioquia', 2, 3, 207, 18000000,
     'https://rentberry.com/co/apartments/119839712-two-br-cl-15d-sur-32-72-ed-cantero-ap-801-medellin-antioquia',
     '119839712', 'El Poblado'),
    ('Plaza del Rio Apt 1805', 'candidate-rentberry-119839707',
     'Cl 19 43g 80 Ap 1805 Urb. Plaza Plaza Del Rio, Medellín, Antioquia', 3, 2, 70, 5800000,
     'https://rentberry.com/co/apartments/119839707-three-br-cl-19-43g-80-ap-1805-urb-plaza-plaza-del-rio-medellin-antioquia',
     '119839707', null),
    ('Cioccolato Apt 1702', 'candidate-rentberry-119840596',
     'Cr 37b 13sur 15 Cioccolato 1702, Medellín, Antioquia', 3, 2, 226, 14000000,
     'https://rentberry.com/co/apartments/119840596-three-br-cr-37b-13sur-15-cioccolato-1702-medellin-antioquia',
     '119840596', 'Los Balsos'),
    ('Castropol Apt 501', 'candidate-rentberry-119388617',
     'Cl 14 40a 95 Urb Castropol Señorial Ap 501, Medellín, Antioquia', 3, 3, 110, 5500000,
     'https://rentberry.com/co/apartments/119388617-three-br-cl-14-40a-95-urb-castropol-sea-a-orial-ap-501-medellin-antioquia',
     '119388617', 'Castropol'),
    ('Edificio Pie de Cuesta Apt 802', 'candidate-rentberry-119839663',
     'Cl 1s 35 388 Ap 802 Ed Pie De Cuesta, Medellín, Antioquia', 3, 2, 150, 6000000,
     'https://rentberry.com/co/apartments/119839663-three-br-cl-1s-35-388-ap-802-ed-pie-de-cuesta-medellin-antioquia',
     '119839663', 'Milla de Oro'),
    ('Laureles Carrera 78', 'candidate-rentberry-118796331',
     'Cr 78 33a 62, Medellín, Antioquia', 3, 2, 164, 4100000,
     'https://rentberry.com/co/apartments/118796331-three-br-cr-78-33a-62-medellin-antioquia',
     '118796331', 'Laureles'),
    ('Telaviv Apt 1204', 'candidate-rentberry-telaviv-1204',
     'Cq 77 38 133 Urb Telaviv Ap 1204, Medellín, Antioquia', 3, 5, 115, 5500000,
     'https://rentberry.com/co/apartments/s/antioquia-colombia/3-bed?page=8',
     null, 'Laureles'),
    ('Edificio El Laurel Apt 201', 'candidate-rentberry-el-laurel-201',
     'Dg 75 B 33b 103 Ed El Laurel Ap 201, Medellín, Antioquia', 3, 3, 93, 3200000,
     'https://rentberry.com/co/apartments/s/antioquia-colombia/3-bed?page=8',
     null, 'Laureles')
)
insert into public.apartments (
  title, slug, neighborhood, address, city, bedrooms, bathrooms, size_sqm,
  furnished, price_monthly, currency, utilities_included, minimum_stay_days,
  pet_friendly, smoking_allowed, parking_included,
  status, verified, source, source_url, source_listing_id,
  freshness_status, last_checked_at, moderation_status, listing_workflow_status, metadata
)
select
  c.title,
  c.slug,
  'Pending verification',
  c.address,
  'Medellín',
  c.bedrooms,
  c.bathrooms,
  c.size_sqm,
  null,
  c.price_monthly,
  'COP',
  null,
  null,
  null,
  null,
  null,
  'inactive',
  false,
  'manual',
  c.source_url,
  c.source_listing_id,
  'unconfirmed',
  null,
  'pending',
  'draft',
  jsonb_strip_nulls(jsonb_build_object(
    'inventory_kind', 'external_candidate',
    'inventory_type', 'external',
    'allowed_action', 'view_original_listing',
    'source_name', 'Rentberry',
    'source_checked_at', '2026-10-06T14:14:00Z',
    'owner_control_status', 'unverified',
    'availability_status', 'source_claim_unverified',
    'coordinates_status', 'missing',
    'photo_rights_status', 'unverified',
    'source_neighborhood_claim', c.source_neighborhood_claim
  ))
from candidates c
on conflict (slug) do nothing;

-- One pending verification checklist per staged candidate. The UNIQUE(apartment_id)
-- constraint makes this idempotent and guarantees a candidate can never acquire a
-- second, conflicting verification row.
insert into public.property_verifications (apartment_id, status, notes, metadata)
select
  a.id,
  'pending',
  'External candidate. Verify owner/control, availability, price, coordinates and photo rights before publication.',
  jsonb_build_object(
    'owner_control', 'unverified',
    'availability', 'unverified',
    'price', 'unverified',
    'coordinates', 'unverified',
    'photo_rights', 'unverified',
    'allowed_action', 'view_original_listing'
  )
from public.apartments a
where a.slug like 'candidate-rentberry-%'
on conflict (apartment_id) do nothing;
