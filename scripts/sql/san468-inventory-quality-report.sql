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
-- Definitions (SAN-468 § Quality states). The gate is deliberately conservative:
-- a missing or unverifiable fact fails; it is never counted as present.
--
--   publicly_eligible = active + approved + published + canonical landlord
--                       + not a test fixture + not an unverified external candidate
--                       (the SAN-386 canonical eligibility contract, materialized by
--                        public.rental_listing_is_public()).
--   searchable        = publicly_eligible + truthful positive price + currency
--   map_ready         = searchable + valid coordinate pair + consistent PostGIS location
--   launch_ready      = publicly_eligible
--                       + apartments.verified = true
--                       + valid price/currency
--                       + a verified genuine owner/agent (landlord_profiles.verification_status
--                         = 'approved' with a recorded verified_at)
--                       + a verified property (property_verifications.status = 'verified'
--                         with a recorded verified_at)
--                       + current active freshness inside the recency window
--                       + an authorized usable photo (rental_listing_images.rights_status
--                         = 'authorized')
--                       + valid coordinates + consistent PostGIS location
--                       + a known canonical property identity
--   requestable       = publicly_eligible + verified row + verified owner + verified property
--                       + current availability window
--
-- Freshness recency window: 30 days. A freshness record is only "current" when its
-- latest canonical status is 'active' AND the check happened inside this window.
-- 'stale', 'unconfirmed' and older-than-window evidence always fail.
--
-- Deduplication: launch_ready rows are counted by distinct canonical physical
-- property identity, so two database rows for the same address cannot inflate the
-- >= 3 launch gate. counts.launch_ready is the raw row count; the gate uses
-- counts.launch_ready_distinct.
--
-- This statement is read-only. It never writes.

with base as (
  select
    a.id, a.title, a.slug, a.neighborhood, a.address, a.city,
    a.source, a.metadata,
    a.status, a.moderation_status, a.listing_workflow_status, a.freshness_status,
    a.verified,
    a.price_monthly, a.currency, a.latitude, a.longitude, a.location,
    a.available_from, a.available_to,
    a.last_checked_at, a.landlord_id, a.source_url, a.source_listing_id,
    (select count(*) from unnest(a.images) as img
      where coalesce(trim(img), '') <> '') as image_count,
    (select count(*) from public.rental_listing_images li
      where li.listing_id = a.id
        and (coalesce(trim(li.storage_path), '') <> ''
             or coalesce(trim(li.source_url), '') <> '')) as image_evidence,
    (select count(*) from public.rental_listing_images li
      where li.listing_id = a.id
        and li.rights_status = 'authorized'
        and (coalesce(trim(li.storage_path), '') <> ''
             or coalesce(trim(li.source_url), '') <> '')) as authorized_image_evidence,
    (select count(*) from public.rental_freshness_log f where f.listing_id = a.id) as freshness_evidence,
    (select count(*) from public.rental_grounding g where g.apartment_id = a.id) as grounding_evidence,
    (select count(*) from public.property_verifications pv
      where pv.apartment_id = a.id) as verification_evidence,
    (select count(*) from public.property_verifications pv
      where pv.apartment_id = a.id
        and pv.status = 'verified' and pv.verified_at is not null) as verified_property_evidence,
    exists (
      select 1 from public.landlord_profiles lp
       where lp.id = a.landlord_id
         and lp.verification_status = 'approved'
         and lp.verified_at is not null
    ) as has_verified_owner
  from public.apartments a
),
latest_freshness as (
  select listing_id, status, checked_at
  from (
    select
      f.listing_id, f.status, f.checked_at,
      row_number() over (partition by f.listing_id order by f.checked_at desc) as rn
    from public.rental_freshness_log f
  ) ranked
  where rn = 1
),
flags as (
  select
    b.*,
    lf.status as latest_freshness_status,
    lf.checked_at as latest_freshness_at,
    (coalesce(lower(b.metadata->>'is_test_fixture'), 'false') = 'true'
      or coalesce(lower(b.metadata->>'inventory_kind'), '') = 'test_fixture') as is_test_fixture,
    (coalesce(lower(b.metadata->>'inventory_kind'), '') = 'external_candidate'
      or coalesce(lower(b.metadata->>'inventory_type'), '') = 'external'
      or coalesce(lower(b.metadata->>'allowed_action'), '') = 'view_original_listing') as is_external_candidate,
    (b.price_monthly is not null and b.price_monthly > 0
      and coalesce(b.currency in ('COP', 'USD'), false)) as valid_price_currency,
    (b.image_count >= 1 or b.image_evidence > 0) as has_any_image,
    (b.authorized_image_evidence > 0) as has_authorized_photo,
    (b.latitude is not null and b.longitude is not null) as has_coords,
    ((b.latitude is null and b.longitude is null)
      or (b.latitude is not null and b.longitude is not null
          and b.latitude between -90 and 90 and b.longitude between -180 and 180)) as coord_pair_valid,
    ((b.latitude is null and b.longitude is null and b.location is null)
      or (b.latitude is not null and b.longitude is not null and b.location is not null
          and abs(st_x(b.location::geometry) - b.longitude) < 0.000001
          and abs(st_y(b.location::geometry) - b.latitude) < 0.000001)) as postgis_consistent,
    (b.last_checked_at is not null or b.freshness_evidence > 0) as has_freshness_evidence,
    -- The canonical rental_freshness_log is authoritative whenever any row exists.
    -- The denormalized apartments columns must never override a stale/unconfirmed
    -- log entry, or the two could drift and false-green the gate.
    case
      when lf.listing_id is not null then
        (lf.status = 'active' and lf.checked_at >= now() - interval '30 days')
      else
        (b.freshness_status = 'active' and b.last_checked_at is not null
         and b.last_checked_at >= now() - interval '30 days')
    end as has_current_freshness,
    (lf.listing_id is not null
      and (b.freshness_status is distinct from lf.status
           or b.last_checked_at is distinct from lf.checked_at)) as has_freshness_denorm_drift,
    (b.landlord_id is not null) as has_canonical_owner,
    (b.verified_property_evidence > 0) as has_verified_property,
    (coalesce(b.verified, false) = true) as is_verified,
    (nullif(trim(coalesce(b.address, '')), '') is not null
      or nullif(trim(coalesce(b.source_listing_id, '')), '') is not null
      or coalesce(b.metadata->>'canonical_property_id', '') <> '') as has_canonical_identity,
    (lower(coalesce(
       nullif(trim(b.address), ''),
       nullif(trim(b.source_listing_id), ''),
       regexp_replace(b.title, '\s+', ' ', 'g')
     ))
     || '|' || lower(coalesce(nullif(trim(b.neighborhood), ''), ''))) as canonical_key,
    (b.landlord_id is not null or b.source_url is not null
      or b.grounding_evidence > 0 or b.verification_evidence > 0) as has_provenance
  from base b
  left join latest_freshness lf on lf.listing_id = b.id
),
verdict as (
  select
    f.*,
    (not f.is_test_fixture and not f.is_external_candidate
      and f.status = 'active' and f.moderation_status = 'approved'
      and f.listing_workflow_status = 'published' and f.has_canonical_owner) as publicly_eligible,
    (not f.is_test_fixture and not f.is_external_candidate
      and f.status = 'active' and f.moderation_status = 'approved'
      and f.listing_workflow_status = 'published' and f.has_canonical_owner
      and f.valid_price_currency) as searchable,
    (not f.is_test_fixture and not f.is_external_candidate
      and f.status = 'active' and f.moderation_status = 'approved'
      and f.listing_workflow_status = 'published' and f.has_canonical_owner
      and f.valid_price_currency and f.has_coords and f.coord_pair_valid
      and f.postgis_consistent) as map_ready,
    -- One canonical predicate: the same contract the publish operation enforces.
    (cardinality(public.rental_listing_launch_blockers(f.id)) = 0) as launch_ready,
    (not f.is_test_fixture and not f.is_external_candidate
      and f.status = 'active' and f.moderation_status = 'approved'
      and f.listing_workflow_status = 'published' and f.has_canonical_owner
      and f.is_verified and f.has_verified_owner and f.has_verified_property
      and (f.available_from is null or f.available_from <= current_date)
      and (f.available_to is null or f.available_to >= current_date)) as requestable
  from flags f
),
dedup as (
  select
    v.*,
    row_number() over (
      partition by v.canonical_key
      order by v.launch_ready desc, v.id
    ) as canonical_rank
  from verdict v
),
detail as (
  select
    v.id, v.title, v.slug, v.neighborhood, v.address, v.source, v.is_test_fixture,
    v.is_external_candidate, v.canonical_key,
    v.status, v.moderation_status, v.listing_workflow_status, v.freshness_status,
    v.latest_freshness_status, v.price_monthly, v.currency, v.valid_price_currency,
    v.latitude, v.longitude,
    v.has_any_image, v.has_authorized_photo, v.has_coords, v.coord_pair_valid,
    v.postgis_consistent, v.has_freshness_evidence, v.has_current_freshness,
    v.has_freshness_denorm_drift,
    v.has_canonical_owner, v.has_verified_owner, v.has_verified_property,
    v.is_verified, v.has_canonical_identity, v.has_provenance,
    v.publicly_eligible, v.searchable, v.map_ready, v.launch_ready, v.requestable,
    (v.launch_ready and v.canonical_rank = 1) as is_canonical_launch_ready,
    v.source_url, v.source_listing_id,
    (select count(*) from public.apartments d
      where v.source_url is not null and d.source_url = v.source_url) as dup_source_url,
    (select count(*) from public.apartments d
      where v.source_listing_id is not null and d.source_listing_id = v.source_listing_id) as dup_source_listing_id,
    (select count(*) from public.apartments d
      where lower(d.title) = lower(v.title) and d.neighborhood = v.neighborhood
        and d.price_monthly is not distinct from v.price_monthly
        and d.currency is not distinct from v.currency) as dup_property_identity,
    public.rental_listing_launch_blockers(v.id) as launch_blockers
  from dedup v
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
        count(*) filter (where is_external_candidate) as external_candidates,
        count(*) filter (where is_external_candidate and status = 'active') as active_external_candidates,
        count(*) filter (where publicly_eligible) as publicly_eligible,
        count(*) filter (where searchable) as searchable,
        count(*) filter (where map_ready) as map_ready,
        count(*) filter (where launch_ready) as launch_ready,
        count(*) filter (where is_canonical_launch_ready) as launch_ready_distinct,
        count(*) filter (where launch_ready and not is_canonical_launch_ready) as duplicate_launch_ready_rows,
        count(*) filter (where requestable) as requestable,
        count(*) filter (where valid_price_currency) as valid_price_currency,
        count(*) filter (where has_any_image) as any_image,
        count(*) filter (where has_authorized_photo) as authorized_photo,
        count(*) filter (where has_coords and coord_pair_valid) as valid_coordinate_pairs,
        count(*) filter (where postgis_consistent) as postgis_consistent,
        count(*) filter (where has_freshness_evidence) as freshness_evidence,
        count(*) filter (where has_current_freshness) as current_freshness,
        count(*) filter (where has_freshness_denorm_drift) as freshness_denorm_drift,
        count(*) filter (where has_canonical_owner) as canonical_owner,
        count(*) filter (where has_verified_owner) as verified_owner,
        count(*) filter (where has_verified_property) as verified_property,
        count(*) filter (where has_canonical_identity) as canonical_identity,
        count(*) filter (where has_provenance) as provenance,
        count(*) filter (where not valid_price_currency) as missing_price,
        count(*) filter (where not has_authorized_photo) as missing_authorized_photo,
        count(*) filter (where not has_coords) as missing_coords,
        count(*) filter (where not has_current_freshness) as missing_current_freshness,
        count(*) filter (where not has_verified_owner) as missing_verified_owner,
        count(*) filter (where not has_verified_property) as missing_verified_property,
        count(*) filter (where not has_canonical_owner) as missing_owner,
        count(*) filter (where (latitude is null) <> (longitude is null)) as half_coords,
        count(*) filter (where latitude is not null
                          and (latitude not between -90 and 90
                               or longitude not between -180 and 180)) as out_of_range,
        count(*) filter (where latitude is not null and longitude is not null
                          and not postgis_consistent) as postgis_drift,
        count(*) filter (where publicly_eligible and not postgis_consistent) as publicly_eligible_with_drift,
        count(*) filter (where launch_ready and not postgis_consistent) as launch_ready_with_drift,
        (select count(*) from (select source_url from public.apartments
           where source_url is not null group by source_url having count(*) > 1) x) as duplicate_source_url_groups,
        (select count(*) from (select source_listing_id from public.apartments
           where source_listing_id is not null group by source_listing_id having count(*) > 1) x) as duplicate_source_listing_id_groups,
        (select count(*) from (select lower(title), neighborhood, price_monthly, currency
           from public.apartments group by 1, 2, 3, 4 having count(*) > 1) x) as duplicate_property_groups
      from detail
    ) c
  )
) as report;
