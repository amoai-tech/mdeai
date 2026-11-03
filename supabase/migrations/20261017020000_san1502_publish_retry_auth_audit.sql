-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Fix two confirmed defects in existing publish_self_attested_rental RPC.
-- A NULL ownership predicate must deny unauthorized brokers (42501).
-- An authorized repeat publish must preserve the first publication and workflow timestamps.
-- Development stays free of business approvals; existing service/admin behavior preserved.
-- Sequence after #352/#356 and #341 (20261017010000); CLI generated
-- an older UTC filename despite already committed future-dated migrations.

create or replace function public.publish_self_attested_rental(
  p_apartment_id uuid,
  p_advertising_authority boolean,
  p_photo_rights boolean
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.apartments;
  v_uid uuid := auth.uid();
  v_missing text[];
begin
  if v_uid is null
     and coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'authenticated publisher or trusted service required' using errcode = '42501';
  end if;

  select a.* into v_row from public.apartments a where a.id = p_apartment_id for update;
  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;

  -- Ownership boundary first: a foreign broker gets a denial and never a forged
  -- attestation. listing ownership is the one authorization fact this path keeps.
  -- Missing ownership evidence is not authorization: NULL must fail closed.
  if v_uid is not null
     and not coalesce(
       public.is_admin()
       or v_row.landlord_id in (select public.acting_landlord_ids())
       or (public.rental_development_active() and v_row.created_by = v_uid),
       false
     ) then
    raise exception 'not authorized to publish this listing' using errcode = '42501';
  end if;

  if public.rental_development_active() then
    -- A repeat of an authorized published state must not rewrite audit fields.
    if v_row.listing_workflow_status = 'published'
       and v_row.status = 'active'
       and v_row.moderation_status = 'approved' then
      return v_row;
    end if;
    -- Development publish is only an operational state change. Never fabricate
    -- self-attestation, copyrights, availability, or independent verification.
    UPDATE public.apartments a SET
      status='active', moderation_status='approved',
      listing_workflow_status='published', verified=false,
      published_at=now(), published_by=v_uid,
      workflow_changed_by=v_uid, workflow_changed_at=now(),
      metadata=coalesce(a.metadata,'{}'::jsonb) ||
        jsonb_build_object('development_published',true)
    WHERE a.id=p_apartment_id
    RETURNING a.* INTO v_row;
    RETURN v_row;
  END IF;

  if v_row.listing_workflow_status = 'rejected' then
    raise exception 'rejected listings must return to draft before publication'
      using errcode = 'check_violation';
  end if;

  if not (coalesce(p_advertising_authority, false) and coalesce(p_photo_rights, false)) then
    raise exception 'self-attestation required: advertising authority and photo rights'
      using errcode = 'check_violation';
  end if;

  -- Same-state retry is a true no-op and preserves every timestamp.
  if v_row.listing_workflow_status = 'published' then
    if v_row.status = 'active' and v_row.moderation_status = 'approved' then
      return v_row;
    end if;
    raise exception 'published listing has inconsistent state' using errcode = '23514';
  end if;

  v_missing := public.self_attested_listing_blockers(p_apartment_id);
  if array_length(v_missing, 1) > 0 then
    raise exception 'listing is not self-attestation-ready: missing %', array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;

  update public.apartments a
     set status = 'active',
         -- Publication is cleared automatically for a self-attested listing, and the
         -- independent-verification marker is explicitly cleared: choosing the
         -- self-attested path must never leave a row presenting as verified.
         moderation_status = 'approved',
         verified = false,
         listing_workflow_status = 'published',
         published_at = now(),
         published_by = v_uid,
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now(),
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'inventory_kind', 'self_attested',
                'inventory_type', 'self_attested',
                'allowed_action', 'schedule_viewing',
                'provenance', 'self_attested',
                'trust_level', 'self_attested',
                'owner_control_status', 'self_attested',
                'availability_status', 'self_attested',
                'photo_rights_status', 'self_attested',
                'self_attestation', jsonb_build_object(
                  'advertising_authority', true,
                  'photo_rights', true,
                  'attested_by', v_uid,
                  'attested_at', now()
                )
              )
   where a.id = p_apartment_id
   returning a.* into v_row;

  return v_row;
end;
$function$;
