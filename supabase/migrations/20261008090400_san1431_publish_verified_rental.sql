-- =============================================================================
-- Migration: 20261008090400_san1431_publish_verified_rental.sql
-- Task:      SAN-1431 — Source, stage, and verify 10 real Medellín rental candidates
-- =============================================================================
-- One canonical launch-readiness predicate plus the gated publish operation.
--
-- WHY
--   1. public.transition_listing_workflow (SAN-1106) publishes on ownership and
--      workflow state alone: no verified owner, no price, no canonical property
--      identity, no coordinates, no verified property, no authorized photo and no
--      freshness. A listing could go live — and become requestable — while the
--      repository's launch gate still rejects it.
--   2. A staged candidate carries metadata.inventory_kind='external_candidate',
--      inventory_type='external' and allowed_action='view_original_listing'.
--      public.rental_listing_is_public() excludes exactly those markers, so
--      promoting a candidate without clearing them yields an invisible listing.
--   3. rental_freshness_log has no uniqueness on (listing_id, checked_at), so a
--      tied latest record makes "latest freshness" depend on the query plan.
--
-- WHAT
--   * public.rental_listing_launch_blockers(uuid, boolean) — the single predicate
--     that answers "why is this listing not launch-ready?". With the default
--     p_include_state = true it is the full contract used by the certification
--     report; with false it returns only the evidence facts that the promotion
--     itself resolves (used before publishing).
--   * rental_freshness_log UNIQUE (listing_id, checked_at) — pre-existing ties are
--     first resolved conservatively (keep the least optimistic status), then a tied
--     latest record becomes impossible and a racing duplicate insert fails closed.
--   * public.publish_verified_rental(uuid, uuid) — replaces the earlier one-argument
--     overload (dropped first, so a single-argument call resolves via the default
--     p_actor_id) and locks the row, re-authorizes
--     against the locked owner (no read-check-lock TOCTOU), refuses unless the
--     canonical evidence predicate is empty (verified owner, valid price/currency,
--     explicit current availability, canonical identity, coordinates, verified
--     property, authorized photo, current freshness), requires publisher
--     attribution, then promotes and converts the provenance metadata to
--     MDE-controlled. The permanent database-wide invariant (so direct UPDATE and
--     transition_listing_workflow cannot bypass it) remains SAN-1349.
--
-- SECURITY
--   SECURITY INVOKER, search_path = '', fully qualified names. Anon has no EXECUTE
--   on the publish function; an authenticated caller must be admin or owner/agent.
-- =============================================================================

-- ── 1. Canonical launch-readiness predicate ──────────────────────────────────
create or replace function public.rental_listing_launch_blockers(
  p_apartment_id uuid,
  p_include_state boolean default true
)
returns text[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
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

  if p_include_state and r.status <> 'active' then
    b := b || 'not active'::text;
  end if;
  if p_include_state and r.moderation_status <> 'approved' then
    b := b || 'not approved'::text;
  end if;
  if p_include_state and r.listing_workflow_status <> 'published' then
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
    if not v_current_freshness then
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

  if not (nullif(trim(coalesce(r.address, '')), '') is not null
          or nullif(trim(coalesce(r.source_listing_id, '')), '') is not null
          or coalesce(r.metadata->>'canonical_property_id', '') <> '') then
    b := b || 'no canonical property identity'::text;
  end if;

  return b;
end;
$$;

revoke all on function public.rental_listing_launch_blockers(uuid, boolean) from public;
grant execute on function public.rental_listing_launch_blockers(uuid, boolean)
  to anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant execute on function public.rental_listing_launch_blockers(uuid, boolean)
      to supabase_read_only_user;
  end if;
end $$;

comment on function public.rental_listing_launch_blockers(uuid, boolean) is
  'SAN-1431: canonical launch-readiness blockers. p_include_state=true is the full certification contract; false returns only the evidence facts a promotion must already satisfy.';

-- ── 2. Fail closed on tied freshness evidence ────────────────────────────────
-- PostgreSQL cannot add a unique constraint over existing duplicates, so first
-- resolve any pre-existing (listing_id, checked_at) ties deterministically and
-- conservatively: keep the LEAST optimistic status (stale < unconfirmed < active),
-- i.e. a tie can only make a listing fail closed, never pass. This is a bounded
-- data change (freshness rows only) and is a no-op on a clean table.
do $$
declare
  v_removed integer;
begin
  with ranked as (
    select f.id,
           row_number() over (
             partition by f.listing_id, f.checked_at
             order by case lower(f.status)
                        when 'stale' then 1
                        when 'unconfirmed' then 2
                        when 'active' then 3
                        else 0
                      end asc,
                      f.created_at asc,
                      f.id asc
           ) as rn
      from public.rental_freshness_log f
  )
  delete from public.rental_freshness_log f
   using ranked r
   where f.id = r.id
     and r.rn > 1;
  get diagnostics v_removed = row_count;
  raise notice 'SAN-1431: removed % conflicting freshness row(s) before adding the uniqueness constraint', v_removed;
end $$;

alter table public.rental_freshness_log
  drop constraint if exists rental_freshness_log_listing_checked_key;
alter table public.rental_freshness_log
  add constraint rental_freshness_log_listing_checked_key
  unique (listing_id, checked_at);

comment on constraint rental_freshness_log_listing_checked_key on public.rental_freshness_log is
  'SAN-1431: one freshness status per (listing, checked_at); a tied latest record can no longer make publication depend on the query plan.';

-- ── 3. Gated publish operation ───────────────────────────────────────────────
-- Remove any earlier one-argument overload so the two-argument signature is the only
-- one and a single-argument call resolves unambiguously (p_actor_id defaults to null).
drop function if exists public.publish_verified_rental(uuid);

create or replace function public.publish_verified_rental(
  p_apartment_id uuid,
  p_actor_id uuid default null
)
returns public.apartments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.apartments;
  v_uid uuid := auth.uid();
  v_actor uuid;
  v_missing text[];
begin
  -- Pre-check. Visibility follows the RLS SELECT policy: a caller who can see the
  -- row (a public listing, or their own) but does not own it gets 42501. A row
  -- hidden by RLS (another broker's unpublished draft) is indistinguishable from a
  -- missing id and returns P0002. That hidden-vs-missing property is the RLS
  -- guarantee, so we deliberately do NOT add a SECURITY DEFINER existence oracle.
  select a.* into v_row from public.apartments a where a.id = p_apartment_id;
  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;
  if v_uid is not null
     and not (public.is_admin()
              or v_row.landlord_id in (select public.acting_landlord_ids())) then
    raise exception 'not authorized to publish this listing' using errcode = '42501';
  end if;

  -- Lock, then re-authorize against the locked owner: closes the read-check-lock race.
  select a.* into v_row
    from public.apartments a
   where a.id = p_apartment_id
   for update;
  if v_uid is not null
     and not (public.is_admin()
              or v_row.landlord_id in (select public.acting_landlord_ids())) then
    raise exception 'not authorized to publish this listing' using errcode = '42501';
  end if;

  -- One canonical evidence contract; the state blockers are resolved by this promotion.
  v_missing := public.rental_listing_launch_blockers(p_apartment_id, false);
  if array_length(v_missing, 1) > 0 then
    raise exception 'listing is not launch-ready: missing %', array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;

  v_actor := coalesce(v_uid, p_actor_id);
  if v_actor is null then
    raise exception 'publisher attribution required: authenticate or pass p_actor_id'
      using errcode = '42501';
  end if;

  update public.apartments a
     set status = 'active',
         verified = true,
         freshness_status = 'active',
         moderation_status = 'approved',
         listing_workflow_status = 'published',
         published_at = now(),
         published_by = v_actor,
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

revoke all on function public.publish_verified_rental(uuid, uuid) from public, anon;
grant execute on function public.publish_verified_rental(uuid, uuid)
  to authenticated, service_role;

comment on function public.publish_verified_rental(uuid, uuid) is
  'SAN-1431 Step 6: gated publish. Reuses rental_listing_launch_blockers, converts external-lead metadata to MDE-controlled, and requires publisher attribution (auth.uid() or p_actor_id).';
