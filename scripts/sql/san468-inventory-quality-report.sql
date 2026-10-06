-- SAN-468 · REAL-002 — production rental inventory-quality report (READ ONLY).
--
-- Run:
--   npm run verify:inventory-quality
--   psql "$SUPABASE_DB_URL" -f scripts/sql/san468-inventory-quality-report.sql
--
-- Returns one JSON document:
--   rows[]   — one entry per apartment with deterministic pass/fail flags and launch_blockers
--   counts{} — aggregate counts for the launch gate
--
-- Definitions (SAN-468 § Quality states):
--   searchable   = not fixture + active + valid price/currency + canonical owner
--   map_ready    = searchable + valid coordinate pair + PostGIS location consistent
--   launch_ready = active + approved + published + not fixture + valid price/currency
--                  + usable image + map_ready + freshness evidence + canonical owner
--   requestable  = active + approved + published + canonical owner + current availability
--                  window — the SAN-1349 predicate, reused unchanged
--
-- This statement is read-only. It never writes.

with base as (
  select
    a.id, a.title, a.slug, a.neighborhood, a.source, a.metadata,
    a.status, a.moderation_status, a.listing_workflow_status, a.freshness_status,
    a.price_monthly, a.currency, a.latitude, a.longitude, a.location,
    a.available_from, a.available_to,
    a.last_checked_at, a.landlord_id, a.source_url, a.source_listing_id,
    (select count(*) from unnest(a.images) as img
      where coalesce(trim(img), '') <> '') as image_count,
    (select count(*) from public.rental_listing_images li
      where li.listing_id = a.id
        and (coalesce(trim(li.storage_path), '') <> ''
             or coalesce(trim(li.source_url), '') <> '')) as image_evidence,
    (select count(*) from public.rental_freshness_log f where f.listing_id = a.id) as freshness_evidence,
    (select count(*) from public.rental_grounding g where g.apartment_id = a.id) as grounding_evidence,
    (select count(*) from public.property_verifications pv where pv.apartment_id = a.id) as verification_evidence
  from public.apartments a
),
flags as (
  select b.*,
    (coalesce(lower(b.metadata->>'is_test_fixture'), 'false') = 'true'
      or coalesce(lower(b.metadata->>'inventory_kind'), '') = 'test_fixture') as is_test_fixture,
    (b.price_monthly is not null and b.price_monthly > 0
      and coalesce(b.currency in ('COP', 'USD'), false)) as valid_price_currency,
    (b.image_count >= 1 or b.image_evidence > 0) as has_usable_image,
    (b.latitude is not null and b.longitude is not null) as has_coords,
    ((b.latitude is null and b.longitude is null)
      or (b.latitude is not null and b.longitude is not null
          and b.latitude between -90 and 90 and b.longitude between -180 and 180)) as coord_pair_valid,
    ((b.latitude is null and b.longitude is null and b.location is null)
      or (b.latitude is not null and b.longitude is not null and b.location is not null
          and abs(st_x(b.location::geometry) - b.longitude) < 0.000001
          and abs(st_y(b.location::geometry) - b.latitude) < 0.000001)) as postgis_consistent,
    (b.last_checked_at is not null or b.freshness_evidence > 0) as has_freshness_evidence,
    (b.landlord_id is not null) as has_canonical_owner,
    (b.landlord_id is not null or b.source_url is not null
      or b.grounding_evidence > 0 or b.verification_evidence > 0) as has_provenance
  from base b
),
verdict as (
  select f.*,
    (not f.is_test_fixture and f.status = 'active' and f.valid_price_currency
      and f.has_canonical_owner) as searchable,
    (not f.is_test_fixture and f.status = 'active' and f.valid_price_currency
      and f.has_canonical_owner and f.has_coords and f.coord_pair_valid
      and f.postgis_consistent) as map_ready,
    (f.status = 'active' and f.moderation_status = 'approved'
      and f.listing_workflow_status = 'published' and not f.is_test_fixture
      and f.valid_price_currency and f.has_usable_image and f.has_coords
      and f.coord_pair_valid and f.postgis_consistent and f.has_freshness_evidence
      and f.has_canonical_owner) as launch_ready,
    (not f.is_test_fixture and f.status = 'active' and f.moderation_status = 'approved'
      and f.listing_workflow_status = 'published' and f.has_canonical_owner
      and (f.available_from is null or f.available_from <= current_date)
      and (f.available_to is null or f.available_to >= current_date)) as requestable
  from flags f
),
detail as (
  select
    v.id, v.title, v.slug, v.neighborhood, v.source, v.is_test_fixture,
    v.status, v.moderation_status, v.listing_workflow_status, v.freshness_status,
    v.price_monthly, v.currency, v.valid_price_currency, v.has_usable_image,
    v.has_coords, v.coord_pair_valid, v.postgis_consistent,
    v.has_freshness_evidence, v.has_canonical_owner, v.has_provenance,
    v.searchable, v.map_ready, v.launch_ready, v.requestable,
    v.source_url, v.source_listing_id,
    (select count(*) from public.apartments d
      where v.source_url is not null and d.source_url = v.source_url) as dup_source_url,
    (select count(*) from public.apartments d
      where v.source_listing_id is not null and d.source_listing_id = v.source_listing_id) as dup_source_listing_id,
    (select count(*) from public.apartments d
      where lower(d.title) = lower(v.title) and d.neighborhood = v.neighborhood
        and d.price_monthly is not distinct from v.price_monthly
        and d.currency is not distinct from v.currency) as dup_property_identity,
    (select array_remove(array[
       case when v.status <> 'active' then 'not active' end,
       case when v.moderation_status <> 'approved' then 'not approved' end,
       case when v.listing_workflow_status <> 'published' then 'not published' end,
       case when v.is_test_fixture then 'test fixture' end,
       case when not v.valid_price_currency then 'missing/invalid price or currency' end,
       case when not v.has_usable_image then 'no usable image' end,
       case when not v.has_coords then 'no coordinates' end,
       case when v.has_coords and not v.coord_pair_valid then 'invalid coordinate pair' end,
       case when v.has_coords and not v.postgis_consistent then 'PostGIS location drift' end,
       case when not v.has_freshness_evidence then 'no freshness evidence' end,
       case when not v.has_canonical_owner then 'no canonical owner' end
    ], null)) as launch_blockers
  from verdict v
)
select json_build_object(
  'rows', (
    select coalesce(json_agg(to_jsonb(d) order by d.launch_ready desc, d.status,
             d.price_monthly nulls last, d.title), '[]'::json)
    from detail d
  ),
  'counts', (
    select to_jsonb(c) from (
      select
        count(*) as total,
        count(*) filter (where status = 'active') as active,
        count(*) filter (where status = 'active' and moderation_status = 'approved'
                          and listing_workflow_status = 'published') as active_approved_published,
        count(*) filter (where is_test_fixture) as test_fixtures,
        count(*) filter (where searchable) as searchable,
        count(*) filter (where map_ready) as map_ready,
        count(*) filter (where launch_ready) as launch_ready,
        count(*) filter (where requestable) as requestable,
        count(*) filter (where valid_price_currency) as valid_price_currency,
        count(*) filter (where has_usable_image) as usable_image,
        count(*) filter (where has_coords and coord_pair_valid) as valid_coordinate_pairs,
        count(*) filter (where postgis_consistent) as postgis_consistent,
        count(*) filter (where has_freshness_evidence) as freshness_evidence,
        count(*) filter (where has_canonical_owner) as canonical_owner,
        count(*) filter (where has_provenance) as provenance,
        count(*) filter (where not valid_price_currency) as missing_price,
        count(*) filter (where not has_usable_image) as missing_image,
        count(*) filter (where not has_coords) as missing_coords,
        count(*) filter (where not has_freshness_evidence) as missing_freshness,
        count(*) filter (where not has_canonical_owner) as missing_owner,
        count(*) filter (where (latitude is null) <> (longitude is null)) as half_coords,
        count(*) filter (where latitude is not null
                          and (latitude not between -90 and 90
                               or longitude not between -180 and 180)) as out_of_range,
        count(*) filter (where latitude is not null and longitude is not null
                          and not postgis_consistent) as postgis_drift,
        (select count(*) from (select source_url from public.apartments
           where source_url is not null group by source_url having count(*) > 1) x) as duplicate_source_url_groups,
        (select count(*) from (select source_listing_id from public.apartments
           where source_listing_id is not null group by source_listing_id having count(*) > 1) x) as duplicate_source_listing_id_groups,
        (select count(*) from (select lower(title), neighborhood, price_monthly, currency
           from public.apartments group by 1, 2, 3, 4 having count(*) > 1) x) as duplicate_property_groups,
        count(*) filter (where metadata->>'inventory_kind' = 'external_candidate') as external_candidates,
        count(*) filter (where metadata->>'inventory_kind' = 'external_candidate'
                          and status = 'active') as active_external_candidates
      from verdict
    ) c
  )
) as report;
