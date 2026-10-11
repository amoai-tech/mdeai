-- =============================================================================
-- Migration: 20261009090300_san1431_neighborhood_gate.sql
-- Task:      SAN-1431 §4.1 — fail-closed verified-neighborhood requirement
-- =============================================================================
-- The canonical launch predicate ignored apartments.neighborhood, so every staged
-- candidate carried the literal placeholder 'Pending verification' and could still
-- satisfy the location requirement. Add a fail-closed neighborhood blocker to the
-- existing predicate (no second readiness definition).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rental_listing_launch_blockers(p_apartment_id uuid, p_include_state boolean DEFAULT true)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  r public.apartments;
  b text[] := array[]::text[];
  v_latest_count integer;
  v_latest_status text;
  v_latest_checked_at timestamptz;
  v_current_freshness boolean;
begin
  select a.* into r from public.apartments a where a.id = p_apartment_id;
  if not found then
    return array['listing not found']::text[];
  end if;

  if coalesce(lower(r.metadata->>'is_test_fixture'), 'false') = 'true'
     or coalesce(lower(r.metadata->>'inventory_kind'), '') = 'test_fixture' then
    b := b || 'test fixture'::text;
  end if;

  if p_include_state and (
       coalesce(lower(r.metadata->>'inventory_kind'), '') = 'external_candidate'
       or coalesce(lower(r.metadata->>'inventory_type'), '') = 'external'
       or coalesce(lower(r.metadata->>'allowed_action'), '') = 'view_original_listing'
  ) then
    b := b || 'unverified external candidate'::text;
  end if;

  -- Null-safe state checks: a NULL status must be treated as NOT active/approved/
  -- published, otherwise the missing value would silently skip the blocker.
  if p_include_state and r.status is distinct from 'active' then
    b := b || 'not active'::text;
  end if;
  if p_include_state and r.moderation_status is distinct from 'approved' then
    b := b || 'not approved'::text;
  end if;
  if p_include_state and r.listing_workflow_status is distinct from 'published' then
    b := b || 'not published'::text;
  end if;

  if not (r.price_monthly is not null and r.price_monthly > 0
          and coalesce(r.currency in ('COP', 'USD'), false)) then
    b := b || 'missing/invalid price or currency'::text;
  end if;

  -- Availability must be explicit and current. A recent freshness check does not
  -- prove the unit is still offered, so an absent or expired window fails closed.
  if not (r.available_from is not null
          and r.available_from <= current_date
          and (r.available_to is null or r.available_to >= current_date)) then
    b := b || 'no current availability evidence'::text;
  end if;

  if p_include_state and coalesce(r.verified, false) is not true then
    b := b || 'listing not verified'::text;
  end if;

  if not exists (
    select 1 from public.landlord_profiles lp
     where lp.id = r.landlord_id
       and lp.verification_status = 'approved'
       and lp.verified_at is not null
  ) then
    b := b || 'no verified owner/agent'::text;
  end if;

  if not exists (
    select 1 from public.property_verifications pv
     where pv.apartment_id = r.id
       and pv.status = 'verified'
       and pv.verified_at is not null
  ) then
    b := b || 'no verified property evidence'::text;
  end if;

  -- Listing-specific authorization: a verified MDE partner is not the same as that
  -- partner authorizing THIS property to be published and to receive viewings.
  if not exists (
    select 1 from public.property_verifications pv
     where pv.apartment_id = r.id
       and lower(coalesce(pv.metadata->>'owner_control', '')) = 'verified'
  ) then
    b := b || 'no owner-control evidence'::text;
  end if;

  if not exists (
    select 1 from public.property_verifications pv
     where pv.apartment_id = r.id
       and lower(coalesce(pv.metadata->>'publish_permission', '')) = 'granted'
  ) then
    b := b || 'no publish permission'::text;
  end if;

  if not exists (
    select 1 from public.property_verifications pv
     where pv.apartment_id = r.id
       and lower(coalesce(pv.metadata->>'viewings_permission', '')) = 'granted'
  ) then
    b := b || 'no viewing permission'::text;
  end if;

  select count(*) into v_latest_count
    from public.rental_freshness_log f
   where f.listing_id = r.id
     and f.checked_at = (select max(checked_at) from public.rental_freshness_log where listing_id = r.id);

  if v_latest_count > 1 then
    -- The unique constraint below makes this unreachable; it stays as defence in
    -- depth against a plan-dependent "latest" row.
    b := b || 'conflicting freshness evidence'::text;
  else
    select f.status, f.checked_at into v_latest_status, v_latest_checked_at
      from public.rental_freshness_log f
     where f.listing_id = r.id
     order by f.checked_at desc
     limit 1;

    if v_latest_status is not null then
      v_current_freshness := v_latest_status = 'active'
        and v_latest_checked_at >= now() - interval '30 days';
    else
      v_current_freshness := r.freshness_status = 'active'
        and r.last_checked_at is not null
        and r.last_checked_at >= now() - interval '30 days';
    end if;
    -- Fail closed unless freshness is explicitly true (a NULL denormalized
    -- freshness_status must not skip the blocker).
    if v_current_freshness is distinct from true then
      b := b || 'no current active freshness'::text;
    end if;
  end if;

  if not exists (
    select 1 from public.rental_listing_images li
     where li.listing_id = r.id
       and li.rights_status = 'authorized'
       and (coalesce(trim(li.storage_path), '') <> ''
            or coalesce(trim(li.source_url), '') <> '')
  ) then
    b := b || 'no authorized usable photo'::text;
  end if;

  if r.latitude is null or r.longitude is null then
    b := b || 'no coordinates'::text;
  elsif not (r.latitude between -90 and 90 and r.longitude between -180 and 180) then
    b := b || 'invalid coordinate pair'::text;
  elsif r.location is null
        or abs(public.st_x(r.location::public.geometry) - r.longitude) >= 0.000001
        or abs(public.st_y(r.location::public.geometry) - r.latitude) >= 0.000001 then
    b := b || 'PostGIS location drift'::text;
  end if;

  -- A valid, consistent pair is not the same as a VERIFIED pair. Require a
  -- coordinate receipt on the admin/service-writable verification row; trusting
  -- apartments.metadata would let a broker self-certify their own pin.
  if not exists (
    select 1 from public.property_verifications pv
     where pv.apartment_id = r.id
       and pv.status = 'verified'
       and lower(coalesce(pv.metadata->>'coordinates', pv.metadata->>'coordinates_status', '')) = 'verified'
  ) then
    b := b || 'no verified coordinate evidence'::text;
  end if;

  if not (nullif(trim(coalesce(r.address, '')), '') is not null
          or nullif(trim(coalesce(r.source_listing_id, '')), '') is not null
          or coalesce(r.metadata->>'canonical_property_id', '') <> '') then
    b := b || 'no canonical property identity'::text;
  end if;


  -- SAN-1431 §4.1: a real neighborhood is required. The staging placeholder
  -- 'Pending verification' and other blank/unknown values must block publication.
  -- (Ceiling: this rejects placeholders/blanks; a plausible value still depends on
  -- the independent owner/review process, as every other verified fact does.)
  if not (nullif(btrim(coalesce(r.neighborhood, '')), '') is not null
          and lower(btrim(coalesce(r.neighborhood, ''))) not in (
            'pending verification','pending','unknown','tbd','unreviewed',
            'n/a','na','por verificar','sin verificar'
          )) then
    b := b || 'no verified neighborhood'::text;
  end if;
  return b;
end;
$function$

