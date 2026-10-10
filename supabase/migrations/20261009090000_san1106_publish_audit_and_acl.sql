-- SAN-1106 · Rental publishing is RPC-only, attributable, and retry-idempotent.
--
-- Scope (one focused migration, no new function/table):
--   1. add workflow_changed_by / workflow_changed_at provenance columns (nullable, no backfill);
--   2. redefine the existing transition_listing_workflow so a real state change stamps the
--      actor + database time, and a same-state retry performs no UPDATE at all;
--   3. make the three client wrappers authenticated-only and keep the transition function
--      non-client-callable;
--   4. stop normal authenticated (and anon) partners from writing workflow/security columns
--      directly, while keeping the content columns the product actually edits.
--
-- Why column privileges and not a trigger
--   RLS controls which rows a partner can touch; it does not control which columns. The only
--   way to stop an owning partner from directly writing listing_workflow_status / status /
--   moderation_status / published_* is to remove the table-wide UPDATE grant and re-grant only
--   the content columns. The SECURITY DEFINER wrappers update workflow columns as the owner,
--   so they are unaffected.
--
-- Timestamp note: the system clock is behind the repository's future-dated migrations, so this
-- file was generated with the CLI and then retimestamped to 20261009... so it sorts after the
-- last applied migration (20261008090000) and applies without --include-all.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1 · Workflow provenance. Unknown history stays NULL; there is no backfill.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.apartments
  add column if not exists workflow_changed_by uuid references auth.users (id) on delete set null,
  add column if not exists workflow_changed_at timestamptz;

comment on column public.apartments.workflow_changed_by is
  'SAN-1106: auth.uid() of the last real workflow-state change. Never client-supplied.';
comment on column public.apartments.workflow_changed_at is
  'SAN-1106: database time of the last real workflow-state change.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2 · Redefine the one transition function. Behavior preserved from
--     20260617022518_ptr_rentals_publish_fsm.sql + 20260929120000_san1106_*,
--     with the same-state no-op and the provenance stamp added.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.transition_listing_workflow(
  p_apartment_id uuid,
  p_target_status text,
  p_rejection_reason text default null
)
returns public.apartments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.apartments;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_row from public.apartments where id = p_apartment_id for update;
  if not found then
    raise exception 'apartment not found' using errcode = 'P0002';
  end if;

  if v_row.landlord_id is null
     or v_row.landlord_id not in (select public.acting_landlord_ids()) then
    raise exception 'broker does not own this apartment' using errcode = '42501';
  end if;

  -- Same-state retry is a true no-op: return the locked row without an UPDATE, so
  -- every workflow timestamp and the audit pair are preserved exactly.
  if v_row.listing_workflow_status = p_target_status then
    return v_row;
  end if;

  perform public.assert_listing_workflow_transition(v_row.listing_workflow_status, p_target_status);

  if p_target_status = 'rejected'
     and (p_rejection_reason is null or btrim(p_rejection_reason) = '') then
    raise exception 'rejection_reason required when rejecting a listing'
      using errcode = 'check_violation';
  end if;

  update public.apartments
  set
    listing_workflow_status = p_target_status,
    ready_for_review_at = case when p_target_status = 'ready_for_review' then now() else ready_for_review_at end,
    published_at = case when p_target_status = 'published' then now() else published_at end,
    published_by = case when p_target_status = 'published' then v_uid else published_by end,
    paused_at = case when p_target_status = 'paused' then now() else paused_at end,
    rejection_reason = case
      when p_target_status = 'rejected' then p_rejection_reason
      when p_target_status = 'draft' then null
      else rejection_reason
    end,
    status = case
      when p_target_status = 'published' then 'active'
      when p_target_status = 'paused' then 'inactive'
      else status
    end,
    -- SAN-1106 (2026-09-29): the sanctioned publish transition records approval.
    moderation_status = case
      when p_target_status = 'published' then 'approved'
      when v_row.listing_workflow_status = 'rejected' and p_target_status = 'draft' then 'pending'
      else moderation_status
    end,
    -- SAN-1106: truthful provenance. The actor is database-derived, never request-supplied.
    workflow_changed_by = v_uid,
    workflow_changed_at = now(),
    updated_at = now()
  where id = p_apartment_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3 · EXECUTE boundary. The entry point is not client-callable; only the three
--     wrappers are, and only for authenticated partners.
-- ═══════════════════════════════════════════════════════════════════════════════

revoke all on function public.transition_listing_workflow(uuid, text, text) from public, anon, authenticated;
revoke all on function public.assert_listing_workflow_transition(text, text) from public, anon, authenticated;

revoke all on function public.request_listing_publish(uuid) from public, anon, authenticated;
revoke all on function public.publish_listing(uuid) from public, anon, authenticated;
revoke all on function public.pause_listing(uuid) from public, anon, authenticated;

grant execute on function public.request_listing_publish(uuid) to authenticated;
grant execute on function public.publish_listing(uuid) to authenticated;
grant execute on function public.pause_listing(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4 · Column boundary. Remove table-wide UPDATE and grant only partner-editable
--     content. Workflow/security columns (listing_workflow_status, status,
--     moderation_status, published_at/by, paused_at, ready_for_review_at,
--     rejection_reason, workflow_changed_by/at, landlord_id) are therefore
--     RPC-only. The allowlist is the Step 1 inventory: the onboarding patch at
--     src/lib/rentals/broker-onboarding-apartment-patch.ts.
-- ═══════════════════════════════════════════════════════════════════════════════

revoke update on table public.apartments from anon, authenticated;

-- Partner-editable listing CONTENT only. Every workflow, ownership, publication and
-- administrative column is deliberately absent: listing_workflow_status, status,
-- moderation_status, published_at, published_by, paused_at, ready_for_review_at,
-- rejection_reason, workflow_changed_by, workflow_changed_at, landlord_id, host_id,
-- created_by, featured, verified, slug, source, source_url, source_listing_id,
-- freshness_status, last_checked_at, location, raw_amenities, rating, review_count,
-- fts_content, id, created_at, updated_at.
grant update (
  title,
  description,
  neighborhood,
  city,
  address,
  latitude,
  longitude,
  metadata,
  bedrooms,
  bathrooms,
  size_sqm,
  floor_number,
  total_floors,
  furnished,
  amenities,
  building_amenities,
  wifi_speed,
  price_monthly,
  price_weekly,
  price_daily,
  currency,
  deposit_amount,
  utilities_included,
  available_from,
  available_to,
  minimum_stay_days,
  maximum_stay_days,
  pet_friendly,
  smoking_allowed,
  parking_included,
  images,
  video_url,
  virtual_tour_url
) on table public.apartments to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5 · #258 compatibility. public.publish_verified_rental writes the trusted
--     workflow/publication columns step 4 just made RPC-only, so it must run as
--     SECURITY DEFINER. A definer function bypasses RLS, which would turn the
--     hidden-draft case into a 42501 existence oracle; the body therefore
--     explicitly replays the apartments SELECT visibility predicate and still
--     returns P0002 for a row the caller cannot see. Authorization, the canonical
--     launch gate, attribution and search_path='' are unchanged. ACL from 20261008090400
--     is preserved by CREATE OR REPLACE (authenticated/service_role only).
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.publish_verified_rental(
  p_apartment_id uuid,
  p_actor_id uuid default null
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.apartments;
  v_uid uuid := auth.uid();
  v_actor uuid;
  v_missing text[];
begin
  -- SECURITY DEFINER is not an authorization boundary by itself.
  -- A client without an authenticated user must never bypass owner checks by
  -- supplying p_actor_id. Only the validated service_role JWT may do that.
  if v_uid is null
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'authenticated publisher or trusted service required'
      using errcode = '42501';
  end if;

  select a.* into v_row from public.apartments a where a.id = p_apartment_id;
  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;

  -- SECURITY DEFINER bypasses RLS, so replay the visibility rule of policies
  -- anyone_can_view_active_apartments / apartments_select_broker_or_catalog:
  -- a row the caller cannot see stays indistinguishable from a missing id.
  if v_uid is not null
     and not (public.is_admin()
              or v_row.landlord_id in (select public.acting_landlord_ids())
              or public.rental_listing_is_public(
                   v_row.status, v_row.moderation_status, v_row.listing_workflow_status,
                   v_row.landlord_id, v_row.metadata)) then
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

commit;
