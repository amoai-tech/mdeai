-- =============================================================================
-- Migration: 20261009090100_san1349_gate_only_publish.sql
-- Task:      SAN-1349 — Make publish_verified_rental the sole publication path
-- =============================================================================
-- Before this migration an owning broker could call public.publish_listing(),
-- which crossed the FSM straight into 'published' without ever consulting the
-- canonical launch contract. The column boundary from 20261009090000 stopped
-- direct UPDATEs, but this RPC remained an open door to an unevidenced listing.
--
-- Fix:
--   1. transition_listing_workflow refuses the 'published' target outright, so no
--      caller can reach publication through the workflow FSM.
--   2. publish_listing keeps its explicit ownership refusal (42501) and same-state
--      no-op, then delegates to publish_verified_rental — the one operation that
--      enforces rental_listing_launch_blockers and stamps publication provenance.
--
-- request_listing_publish (draft -> ready_for_review) and pause_listing
-- (-> paused) are unchanged: they cannot reach 'published'.
-- =============================================================================

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

  -- SAN-1349: publication is reserved for the canonical gated operation.
  if p_target_status = 'published' then
    raise exception 'published state is reserved for publish_verified_rental()'
      using errcode = '42501';
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

  -- Publication never reaches this UPDATE (refused above), so there are no
  -- published_at/published_by/status/moderation branches for a published target.
  update public.apartments
  set
    listing_workflow_status = p_target_status,
    ready_for_review_at = case when p_target_status = 'ready_for_review' then now() else ready_for_review_at end,
    paused_at = case when p_target_status = 'paused' then now() else paused_at end,
    rejection_reason = case
      when p_target_status = 'rejected' then p_rejection_reason
      when p_target_status = 'draft' then null
      else rejection_reason
    end,
    status = case
      when p_target_status = 'paused' then 'inactive'
      else status
    end,
    moderation_status = case
      when v_row.listing_workflow_status = 'rejected' and p_target_status = 'draft' then 'pending'
      else moderation_status
    end,
    workflow_changed_by = v_uid,
    workflow_changed_at = now(),
    updated_at = now()
  where id = p_apartment_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.publish_listing(p_apartment_id uuid)
returns public.apartments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.apartments;
begin
  select * into v_row from public.apartments where id = p_apartment_id;
  if not found then
    raise exception 'apartment not found' using errcode = 'P0002';
  end if;

  -- Explicit ownership refusal, checked before the gate so a foreign broker gets
  -- the same 42501 the workflow wrapper always returned.
  if not (public.is_admin()
          or v_row.landlord_id in (select public.acting_landlord_ids())) then
    raise exception 'not authorized to publish this listing' using errcode = '42501';
  end if;

  -- SAN-1106: a same-state retry is a true no-op.
  if v_row.listing_workflow_status = 'published' then
    return v_row;
  end if;

  -- SAN-1349: the canonical, evidence-gated publication path.
  --
  -- auth.uid() reads request.jwt.claim.sub (the caller's JWT), NOT current_user, so
  -- this SECURITY DEFINER wrapper still stamps the calling broker as published_by.
  -- The ownership check above is the authorization boundary; this argument is
  -- attribution, and publish_verified_rental re-checks the actor against the owner.
  return public.publish_verified_rental(p_apartment_id, auth.uid());
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- publish_verified_rental is directly callable, so the workflow-state guard belongs
-- in the canonical operation too. A rejected listing must be returned to draft
-- first; a fully evidenced draft still publishes directly (the supported path).
-- Body is otherwise unchanged from 20261009090000; CREATE OR REPLACE preserves the
-- ACL (authenticated/service_role only) and search_path = ''.
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
  if v_uid is null
     and coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'authenticated publisher or trusted service required'
      using errcode = '42501';
  end if;

  select a.* into v_row from public.apartments a where a.id = p_apartment_id;
  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;

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

  select a.* into v_row from public.apartments a where a.id = p_apartment_id for update;
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

  -- SAN-1349: a rejected listing must return to draft before publication.
  if v_row.listing_workflow_status = 'rejected' then
    raise exception 'rejected listings must return to draft before publication'
      using errcode = 'check_violation';
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

  if v_row.listing_workflow_status = 'published' then
    if v_row.status = 'active'
       and v_row.moderation_status = 'approved'
       and v_row.verified is true then
      return v_row;
    end if;
    raise exception 'published listing has inconsistent state'
      using errcode = '23514';
  end if;

  update public.apartments a
     set status = 'active',
         verified = true,
         freshness_status = 'active',
         moderation_status = 'approved',
         listing_workflow_status = 'published',
         published_at = now(),
         published_by = v_actor,
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
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
