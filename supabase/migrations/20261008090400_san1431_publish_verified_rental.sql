-- =============================================================================
-- Migration: 20261008090400_san1431_publish_verified_rental.sql
-- Task:      SAN-1431 — Source, stage, and verify 10 real Medellín rental candidates
-- =============================================================================
-- The canonical gated publish operation for a verified candidate (Step 6).
--
-- WHAT IS WRONG WITHOUT IT
--   1. public.transition_listing_workflow (SAN-1106) publishes on ownership and
--      workflow state alone. It does not require verified coordinates, a verified
--      property, an authorized photo or current freshness, so a listing could go
--      live — and become requestable — with no map, no photo and no evidence.
--   2. A staged candidate still carries metadata.inventory_kind='external_candidate',
--      inventory_type='external' and allowed_action='view_original_listing'. The
--      canonical predicate public.rental_listing_is_public() excludes exactly those
--      markers, so promoting a candidate without clearing them yields an active but
--      invisible listing.
--
-- WHAT THIS DOES
--   public.publish_verified_rental(uuid) refuses unless every launch fact exists,
--   then promotes the row and rewrites the provenance metadata to the
--   MDE-controlled state so the canonical eligibility predicate accepts it.
--
-- SECURITY
--   SECURITY INVOKER, search_path = ''. Anon has no EXECUTE. An authenticated
--   caller must be an admin or the listing's owner/agent; service_role and direct
--   connections (auth.uid() is null) are trusted. All object references are fully
--   qualified.
-- =============================================================================

create or replace function public.publish_verified_rental(p_apartment_id uuid)
returns public.apartments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.apartments;
  v_uid uuid := auth.uid();
  v_missing text[] := array[]::text[];
  v_latest_status text;
  v_latest_checked_at timestamptz;
  v_landlord_id uuid;
begin
  -- Read ownership first under the SELECT policy (a public or owned row is visible),
  -- then authorize, then lock. Locking first would turn a non-owner into a "not
  -- found" error because SELECT ... FOR UPDATE uses the UPDATE policy.
  select a.landlord_id into v_landlord_id
    from public.apartments a
   where a.id = p_apartment_id;

  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;

  if v_uid is not null
     and not (public.is_admin()
              or v_landlord_id in (select public.acting_landlord_ids())) then
    raise exception 'not authorized to publish this listing' using errcode = '42501';
  end if;

  select a.* into v_row
    from public.apartments a
   where a.id = p_apartment_id
   for update;

  if v_row.landlord_id is null then
    v_missing := v_missing || 'canonical owner/agent'::text;
  end if;

  if v_row.latitude is null or v_row.longitude is null or v_row.location is null then
    v_missing := v_missing || 'verified coordinates'::text;
  end if;

  if not exists (
    select 1 from public.property_verifications pv
     where pv.apartment_id = p_apartment_id
       and pv.status = 'verified'
       and pv.verified_at is not null
  ) then
    v_missing := v_missing || 'verified property'::text;
  end if;

  if not exists (
    select 1 from public.rental_listing_images li
     where li.listing_id = p_apartment_id
       and li.rights_status = 'authorized'
       and (coalesce(trim(li.storage_path), '') <> ''
            or coalesce(trim(li.source_url), '') <> '')
  ) then
    v_missing := v_missing || 'authorized photo'::text;
  end if;

  select f.status, f.checked_at
    into v_latest_status, v_latest_checked_at
    from public.rental_freshness_log f
   where f.listing_id = p_apartment_id
   order by f.checked_at desc
   limit 1;

  if v_latest_status is not null then
    -- The canonical log wins whenever a row exists (mirrors the certification report).
    if not (v_latest_status = 'active'
            and v_latest_checked_at >= now() - interval '30 days') then
      v_missing := v_missing || 'current freshness'::text;
    end if;
  else
    if not (v_row.freshness_status = 'active'
            and v_row.last_checked_at is not null
            and v_row.last_checked_at >= now() - interval '30 days') then
      v_missing := v_missing || 'current freshness'::text;
    end if;
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'listing is not launch-ready: missing %', array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;

  update public.apartments a
     set status = 'active',
         verified = true,
         freshness_status = 'active',
         moderation_status = 'approved',
         listing_workflow_status = 'published',
         published_at = now(),
         published_by = v_uid,
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'inventory_kind', 'mde_controlled',
                'inventory_type', 'mde_controlled',
                'allowed_action', 'schedule_viewing',
                'owner_control_status', 'verified',
                'availability_status', 'verified',
                'coordinates_status', 'verified',
                'photo_rights_status', 'authorized'
              )
   where a.id = p_apartment_id
   returning a.* into v_row;

  return v_row;
end;
$$;

revoke all on function public.publish_verified_rental(uuid) from public, anon;
grant execute on function public.publish_verified_rental(uuid)
  to authenticated, service_role;

comment on function public.publish_verified_rental(uuid) is
  'SAN-1431 Step 6: gated publish. Requires a canonical owner, verified coordinates, a verified property, an authorized photo and current freshness; converts external-lead metadata to MDE-controlled so public.rental_listing_is_public() accepts the listing.';
