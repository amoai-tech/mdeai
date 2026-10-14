-- =============================================================================
-- Migration: 20261014092734_san1449_self_attested_publish.sql
-- Task:      SAN-1449 — Publish First, Verify Later (self-attested landlord listing)
-- =============================================================================
-- An authenticated landlord that owns an apartment can publish a genuine
-- self-attested listing without an administrator or independent verification.
--
-- The advertiser attests, at publication time, that they are authorised to
-- advertise the apartment and to grant MDE the right to display the photos they
-- supplied. The attestation is recorded on the row and the listing is published
-- with verified = false and explicit provenance, so it is never presented as
-- independently verified.
--
-- This is a second, deliberately narrower publication path. The canonical
-- independently-verified path (publish_verified_rental) is untouched, and
-- external source-linked advertisements (inventory_kind = 'external_candidate')
-- and synthetic fixtures stay non-publishable here.
--
-- Reused unchanged: the apartments column boundary (workflow/publication columns
-- stay RPC-only), rental_listing_is_public(), p1_schedule_tour_atomic() and every
-- RLS policy. A self-attested row reaches active + approved + published with a
-- canonical landlord, so it becomes publicly searchable and requestable exactly
-- like any other MDE-owned listing. verified = false plus
-- metadata.provenance = 'self_attested' is the truthful label.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Reduced launch gate for a self-attested listing.
--     Retains the real, landlord-supplied facts (ownership is checked by the
--     RPC; price, availability window, canonical identity, neighbourhood, at
--     least one usable photo) and the fixture/external exclusions. It does NOT
--     require the independent-evidence receipts that only a reviewed listing can
--     have (property verification, owner-control, publish/viewing permission,
--     freshness, verified coordinates).
-- -----------------------------------------------------------------------------
create or replace function public.self_attested_listing_blockers(p_apartment_id uuid)
returns text[]
language plpgsql
stable
set search_path = ''
as $function$
declare
  r public.apartments;
  b text[] := array[]::text[];
begin
  select a.* into r from public.apartments a where a.id = p_apartment_id;
  if not found then
    return array['listing not found']::text[];
  end if;

  if coalesce(lower(r.metadata->>'is_test_fixture'), 'false') = 'true'
     or coalesce(lower(r.metadata->>'inventory_kind'), '') = 'test_fixture' then
    b := b || 'test fixture'::text;
  end if;

  if lower(coalesce(r.metadata->>'inventory_kind', '')) = 'external_candidate'
     or lower(coalesce(r.metadata->>'inventory_type', '')) = 'external'
     or lower(coalesce(r.metadata->>'allowed_action', '')) = 'view_original_listing' then
    b := b || 'unverified external candidate'::text;
  end if;

  if not (r.price_monthly is not null and r.price_monthly > 0
          and coalesce(r.currency in ('COP', 'USD'), false)) then
    b := b || 'missing/invalid price or currency'::text;
  end if;

  if not (r.available_from is not null
          and (r.available_to is null or r.available_to >= (now() at time zone 'America/Bogota')::date)
          and (r.available_to is null or r.available_from <= r.available_to)) then
    b := b || 'no current availability evidence'::text;
  end if;

  if not (nullif(btrim(coalesce(r.address, '')), '') is not null
          or nullif(btrim(coalesce(r.source_listing_id, '')), '') is not null
          or coalesce(r.metadata->>'canonical_property_id', '') <> '') then
    b := b || 'no canonical property identity'::text;
  end if;

  if coalesce(btrim(r.neighborhood), '') = ''
     or lower(btrim(r.neighborhood)) in (
          'pending verification','pending','unknown','tbd','unreviewed',
          'n/a','na','por verificar','sin verificar'
        ) then
    b := b || 'no usable neighborhood'::text;
  end if;

  if not exists (
    select 1 from public.rental_listing_images li
     where li.listing_id = r.id
       and (coalesce(trim(li.storage_path), '') <> ''
            or coalesce(trim(li.source_url), '') <> '')
  ) then
    b := b || 'no usable photo'::text;
  end if;

  -- The cards and search read apartments.images, not rental_listing_images. A
  -- listing that only has a gallery row would publish with no displayable image.
  if not exists (
    select 1 from unnest(coalesce(r.images, array[]::text[])) as img
     where coalesce(btrim(img), '') <> ''
  ) then
    b := b || 'no displayable listing photo'::text;
  end if;

  return b;
end;
$function$;

comment on function public.self_attested_listing_blockers(uuid) is
  'SAN-1449: reduced launch gate for a self-attested landlord listing. Retains real facts and fixture/external exclusions; independent-verification receipts are deferred.';

revoke all on function public.self_attested_listing_blockers(uuid) from public, anon, authenticated;
grant execute on function public.self_attested_listing_blockers(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2 · Self-attested publication.
--     SECURITY DEFINER because it writes the RPC-only workflow/publication
--     columns. Ownership is re-checked against the locked row. search_path is
--     empty and every object is schema-qualified.
-- -----------------------------------------------------------------------------
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
  if v_uid is not null
     and not (public.is_admin()
              or v_row.landlord_id in (select public.acting_landlord_ids())) then
    raise exception 'not authorized to publish this listing' using errcode = '42501';
  end if;

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

comment on function public.publish_self_attested_rental(uuid, boolean, boolean) is
  'SAN-1449: owning landlord publishes a genuine self-attested listing. Sets provenance = self_attested; verified stays false.';

revoke all on function public.publish_self_attested_rental(uuid, boolean, boolean) from public, anon;
grant execute on function public.publish_self_attested_rental(uuid, boolean, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3 · Database-controlled initial state and provenance.
--     The SAN-1106 column boundary governs UPDATE only. Without this guard an
--     authenticated landlord could INSERT an apartment already active/approved/
--     published/verified and bypass both publication RPCs, or clear an external/
--     fixture classification out of editable metadata. Both are now enforced in
--     trusted database logic rather than by client discipline.
-- -----------------------------------------------------------------------------
drop function if exists public.apartment_state_is_trusted_writer();

create or replace function public.enforce_apartment_initial_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if public.is_admin() or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  -- A client-created listing always starts as a draft/unverified row. Publication
  -- and independent verification stay reachable only through the gated RPCs.
  new.status := 'inactive';
  new.moderation_status := 'pending';
  new.listing_workflow_status := 'draft';
  new.verified := false;
  new.published_at := null;
  new.published_by := null;
  return new;
end;
$function$;

create or replace function public.protect_apartment_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_old_fixture boolean;
  v_new_fixture boolean;
  v_old_external boolean;
  v_new_external boolean;
begin
  if public.is_admin() or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  -- Classification is one-way: an ordinary writer may never REMOVE a fixture or
  -- external marker, even while leaving another marker in place.
  v_old_fixture :=
       coalesce(lower(old.metadata->>'is_test_fixture'), 'false') = 'true'
    or lower(coalesce(old.metadata->>'inventory_kind', '')) = 'test_fixture';
  v_new_fixture :=
       coalesce(lower(new.metadata->>'is_test_fixture'), 'false') = 'true'
    or lower(coalesce(new.metadata->>'inventory_kind', '')) = 'test_fixture';
  v_old_external :=
       lower(coalesce(old.metadata->>'inventory_kind', '')) = 'external_candidate'
    or lower(coalesce(old.metadata->>'inventory_type', '')) = 'external'
    or lower(coalesce(old.metadata->>'allowed_action', '')) = 'view_original_listing';
  v_new_external :=
       lower(coalesce(new.metadata->>'inventory_kind', '')) = 'external_candidate'
    or lower(coalesce(new.metadata->>'inventory_type', '')) = 'external'
    or lower(coalesce(new.metadata->>'allowed_action', '')) = 'view_original_listing';
  if (v_old_fixture and not v_new_fixture) or (v_old_external and not v_new_external) then
    raise exception 'listing provenance is database-controlled' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists apartments_enforce_initial_state on public.apartments;
create trigger apartments_enforce_initial_state
  before insert on public.apartments
  for each row execute function public.enforce_apartment_initial_state();

drop trigger if exists apartments_protect_provenance on public.apartments;
create trigger apartments_protect_provenance
  before update of metadata on public.apartments
  for each row execute function public.protect_apartment_provenance();

-- Trigger functions are not client-callable; the trigger machinery invokes them.
-- service_role keeps EXECUTE, matching every other app-owned trigger function (SAN-1284).
revoke all on function public.enforce_apartment_initial_state() from public, anon, authenticated;
revoke all on function public.protect_apartment_provenance() from public, anon, authenticated;
grant execute on function public.enforce_apartment_initial_state() to service_role;
grant execute on function public.protect_apartment_provenance() to service_role;

