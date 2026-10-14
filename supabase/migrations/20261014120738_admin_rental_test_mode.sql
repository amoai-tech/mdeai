-- =============================================================================
-- Migration: 20261014120738_admin_rental_test_mode.sql
-- Task:      Administrator rental testing mode (production, admin-only)
-- =============================================================================
-- Lets a trusted administrator exercise the complete rental workflow inside the
-- existing production project, with no staging environment, WITHOUT weakening
-- protections for ordinary users:
--   * create an explicitly test-marked rental (metadata.is_test_fixture = true);
--   * publish it for internal testing — this bypasses the independent-verification
--     gate but NEVER sets verified = true and NEVER exposes it to customers,
--     because rental_listing_is_public() excludes fixtures;
--   * request a real viewing through the existing atomic RPC (fixtures remain
--     reachable there), persisting exactly one lead + one showing;
--   * clean up: remove the test leads/showings and return the listing to draft.
--
-- Every operation is gated by public.is_admin(), audited on the row
-- (workflow_changed_by/at + test markers) and reversible. Ordinary customer
-- permissions, cross-tenant RLS and financial operations are untouched, and the
-- nine external Fincaraíz advertisements are not involved.
-- =============================================================================

create or replace function public.admin_create_test_rental(
  p_title text,
  p_neighborhood text,
  p_address text,
  p_price_monthly numeric,
  p_currency text,
  p_available_from date,
  p_image_url text,
  p_landlord_id uuid default null
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid;
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_title, '')), '') is null
     or nullif(btrim(coalesce(p_neighborhood, '')), '') is null
     or nullif(btrim(coalesce(p_address, '')), '') is null
     or p_price_monthly is null or p_price_monthly <= 0
     or upper(coalesce(p_currency, '')) not in ('COP', 'USD')
     or p_available_from is null
     or nullif(btrim(coalesce(p_image_url, '')), '') is null then
    raise exception 'title, neighborhood, address, positive price, COP/USD currency, available_from and image_url are required'
      using errcode = 'check_violation';
  end if;

  -- Internal test inventory must belong to the requesting administrator.
  -- A caller-provided profile ID must not attach synthetic inventory to
  -- another landlord, where it could contaminate their dashboard/workflows.
  select lp.id into v_landlord
    from public.landlord_profiles lp
   where lp.user_id = v_uid
     and (p_landlord_id is null or lp.id = p_landlord_id)
   order by lp.created_at
   limit 1;
  if v_landlord is null then
    raise exception 'test landlord profile must belong to the administrator'
      using errcode = '42501';
  end if;

  insert into public.apartments (
    title, slug, description, neighborhood, city, address,
    status, moderation_status, listing_workflow_status,
    landlord_id, created_by, verified,
    price_monthly, currency, available_from, available_to, images, metadata
  ) values (
    btrim(p_title),
    'test-rental-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'Administrator test listing — not a real offering.',
    btrim(p_neighborhood), 'Medellín', btrim(p_address),
    'inactive', 'pending', 'draft',
    v_landlord, v_uid, false,
    p_price_monthly, upper(p_currency), p_available_from, null,
    array[btrim(p_image_url)],
    jsonb_build_object(
      'is_test_fixture', 'true',
      'test_mode', 'true',
      'test_run_id', gen_random_uuid()::text,
      'inventory_kind', 'test_fixture',
      'inventory_type', 'test_fixture',
      'admin_test_created_by', v_uid,
      'admin_test_created_at', now()
    )
  )
  returning * into v_row;

  -- Test photos are supplied as authorized HTTPS URLs in apartments.images.
  -- Never invent an object-storage path when no object was actually uploaded.

  return v_row;
end;
$function$;

comment on function public.admin_create_test_rental(text, text, text, numeric, text, date, text, uuid) is
  'Admin test mode: create an explicitly test-marked rental. Never customer-visible.';

create or replace function public.admin_publish_test_rental(p_apartment_id uuid)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  select a.* into v_row from public.apartments a where a.id = p_apartment_id for update;
  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;

  if coalesce(lower(v_row.metadata->>'is_test_fixture'), 'false') <> 'true' then
    raise exception 'only a test-marked listing can be test-published' using errcode = '42501';
  end if;

  -- Keep live fixtures live on repeated publish requests (button double-click,
  -- retries). Rewriting the audit timestamp on a live row would be treated as
  -- a material metadata edit and cause the normal review trigger to demote it.
  if v_row.status = 'active'
     and v_row.moderation_status = 'approved'
     and v_row.listing_workflow_status = 'published'
     and v_row.verified = false then
    return v_row;
  end if;

  if not (v_row.price_monthly is not null and v_row.price_monthly > 0
          and upper(coalesce(v_row.currency, '')) in ('COP', 'USD')
          and v_row.available_from is not null
          and (v_row.available_to is null or v_row.available_to >= (now() at time zone 'America/Bogota')::date)
          and nullif(btrim(coalesce(v_row.address, '')), '') is not null
          and nullif(btrim(coalesce(v_row.neighborhood, '')), '') is not null
          and exists (
                select 1 from unnest(coalesce(v_row.images, array[]::text[])) as img
                 where btrim(img) <> ''
              )) then
    raise exception 'test listing is missing price, availability, address, neighborhood or image'
      using errcode = 'check_violation';
  end if;

  update public.apartments a
     set status = 'active',
         moderation_status = 'approved',
         listing_workflow_status = 'published',
         published_at = now(),
         published_by = v_uid,
         -- A test listing is never independently verified and never customer-visible.
         verified = false,
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now(),
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                'test_mode', 'true',
                'inventory_kind', 'test_fixture',
                'inventory_type', 'test_fixture',
                'admin_test_published_by', v_uid,
                'admin_test_published_at', now()
              )
   where a.id = p_apartment_id
   returning a.* into v_row;

  return v_row;
end;
$function$;

comment on function public.admin_publish_test_rental(uuid) is
  'Admin test mode: publish a test-marked rental for internal testing. verified stays false; customers never see fixtures.';

create or replace function public.admin_cleanup_test_rental(p_apartment_id uuid)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.apartments;
  v_leads integer := 0;
  v_showings integer := 0;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  select a.* into v_row from public.apartments a where a.id = p_apartment_id for update;
  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;

  if coalesce(lower(v_row.metadata->>'is_test_fixture'), 'false') <> 'true' then
    raise exception 'only a test-marked listing can be cleaned up' using errcode = '42501';
  end if;

  -- Existing production fixtures may have historical/guest viewings without
  -- an admin_test marker. An ID match alone is NEVER proof of test ownership.
  -- Check the lead and every showing linked to that lead before any deletion;
  -- a different apartment_id on a linked showing must also fail closed.
  if exists (
    select 1 from public.leads l
     where l.apartment_id = p_apartment_id
       and coalesce(l.metadata->>'admin_test', 'false') <> 'true'
  ) or exists (
    select 1 from public.showings s
    left join public.leads l on l.id = s.lead_id
     where (s.apartment_id = p_apartment_id or l.apartment_id = p_apartment_id)
       and (coalesce(s.metadata->>'admin_test', 'false') <> 'true'
            or s.apartment_id is distinct from p_apartment_id)
  ) then
    raise exception 'test fixture has unclassified viewings; manual review required'
      using errcode = '42501';
  end if;

  with deleted as (
    delete from public.showings
     where apartment_id = p_apartment_id
       and metadata->>'admin_test' = 'true'
    returning 1
  ) select count(*) into v_showings from deleted;

  with deleted as (
    delete from public.leads
     where apartment_id = p_apartment_id
       and metadata->>'admin_test' = 'true'
    returning 1
  ) select count(*) into v_leads from deleted;

  update public.apartments a
     set status = 'inactive',
         moderation_status = 'pending',
         listing_workflow_status = 'draft',
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now(),
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                'test_mode', 'true',
                'admin_test_cleaned_by', v_uid,
                'admin_test_cleaned_at', now(),
                'admin_test_leads_removed', v_leads,
                'admin_test_showings_removed', v_showings
              )
   where a.id = p_apartment_id
   returning a.* into v_row;

  return v_row;
end;
$function$;

comment on function public.admin_cleanup_test_rental(uuid) is
  'Admin test mode: remove a test listing''s leads/showings and return it to draft. Audited on the row.';

-- Produce a NEW administrator-controlled test fixture from an existing rental.
-- The source listing remains untouched, and the new listing cannot be exposed to
-- customers by rental_listing_is_public(). All approvals below are test-scoped.
create or replace function public.admin_clone_rental_for_testing(
  p_source_apartment_id uuid,
  p_available_from date,
  p_test_image_url text,
  p_fallback_price_monthly numeric default 2400000
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_source public.apartments;
  v_test public.apartments;
  v_title text;
  v_neighborhood text;
  v_address text;
  v_price numeric;
  v_currency text;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_source_apartment_id is null then
    raise exception 'source apartment required' using errcode = '22004';
  end if;
  if p_available_from is null
     or nullif(btrim(coalesce(p_test_image_url, '')), '') is null
     or p_test_image_url !~ '^https://[^[:space:]]+$' then
    raise exception 'test date and HTTPS test photo URL required' using errcode = 'check_violation';
  end if;

  select a.* into v_source from public.apartments a
   where a.id = p_source_apartment_id;
  if not found then
    raise exception 'source apartment not found' using errcode = 'P0002';
  end if;
  if coalesce(lower(v_source.metadata->>'is_test_fixture'), 'false') = 'true' then
    raise exception 'source must be an original apartment, not a test fixture' using errcode = '42501';
  end if;

  -- Repeat clicks/retries reuse this administrator's existing test copy.
  perform pg_advisory_xact_lock(hashtext('mde-rental-test-clone'),
                                hashtext(p_source_apartment_id::text || v_uid::text));
  select a.* into v_test from public.apartments a
   where a.created_by = v_uid
     and a.metadata->>'is_test_fixture' = 'true'
     and a.metadata->>'admin_test_source_apartment_id' = p_source_apartment_id::text
   order by a.created_at desc, a.id desc limit 1 for update;
  if found then
    if v_test.listing_workflow_status <> 'published' then
      -- Cleanup intentionally preserves the test copy, but its old dates and
      -- photo may be stale. Reuse the same ID with this request's test inputs.
      -- No real source listing is changed, and the draft is not publicly visible.
      update public.apartments a
         set available_from = p_available_from,
             available_to = null,
             images = array[p_test_image_url]::text[],
             updated_at = now()
       where a.id = v_test.id;
      return public.admin_publish_test_rental(v_test.id);
    end if;
    return v_test;
  end if;

  v_title := 'DEVELOPMENT TEST — ' || coalesce(nullif(btrim(v_source.title), ''), 'Apartment');
  v_neighborhood := coalesce(nullif(btrim(v_source.neighborhood), ''), 'Medellín test location');
  v_address := coalesce(nullif(btrim(v_source.address), ''), 'Test address — source location not confirmed');
  v_price := case when v_source.price_monthly > 0 then v_source.price_monthly
                  else p_fallback_price_monthly end;
  v_currency := case when upper(coalesce(v_source.currency, '')) in ('COP', 'USD')
                     then upper(v_source.currency) else 'COP' end;

  -- The canonical create/publish RPCs provide test ownership through this
  -- admin's own landlord profile, not the unrelated source's landlord_id.
  v_test := public.admin_create_test_rental(v_title, v_neighborhood, v_address,
                              v_price, v_currency, p_available_from,
                              p_test_image_url, null);
  update public.apartments a
     set metadata = a.metadata || jsonb_build_object(
       'admin_test_source_apartment_id', p_source_apartment_id,
       'admin_test_approval', 'approved_for_testing',
       'admin_test_verification', 'verified_for_testing',
       'admin_test_photo_rights', 'test_image_only',
       'admin_test_operator_user_id', v_uid,
       'admin_test_operator_active', true)
   where a.id = v_test.id;
  return public.admin_publish_test_rental(v_test.id);
end;
$function$;

comment on function public.admin_clone_rental_for_testing(uuid, date, text, numeric) is
  'Clone an existing source into an MDE-admin-owned, internally approved test fixture. Never changes real ownership or verification.';
revoke all on function public.admin_clone_rental_for_testing(uuid, date, text, numeric) from public, anon;
grant execute on function public.admin_clone_rental_for_testing(uuid, date, text, numeric) to authenticated, service_role;

-- Admin-only viewing path for development fixtures. Reuse the canonical
-- atomic lead/showing RPC, its retry identity, and the existing broker linkage;
-- do not grant service-role RPC access to the browser or bypass the lead guard.
create or replace function public.admin_request_test_viewing(
  p_apartment_id uuid,
  p_scheduled_at timestamptz,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_listing_id uuid;
  v_key text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now()
     or nullif(btrim(coalesce(p_email,'')), '') is null then
    raise exception 'valid future time and admin email required'
      using errcode = '22023';
  end if;
  select a.id into v_listing_id
    from public.apartments a
   where a.id = p_apartment_id
     and lower(coalesce(a.metadata->>'is_test_fixture','false')) = 'true'
     and a.status = 'active'
     and a.moderation_status = 'approved'
     and a.listing_workflow_status = 'published';
  if not found then
    raise exception 'active test listing required' using errcode = '42501';
  end if;

  v_key := 'admin-test-' || md5(v_uid::text || ':' || p_apartment_id::text
    || ':' || p_scheduled_at::text || ':' || lower(btrim(p_email)));
  return public.p1_schedule_tour_atomic(
    p_apartment_id::text, v_uid, v_key, 'form', lower(btrim(p_email)),
    'Admin test renter', null, null::uuid, p_scheduled_at,
    jsonb_build_object('admin_test', true),
    jsonb_build_object('admin_test', true)
  );
end;
$function$;

revoke all on function public.admin_request_test_viewing(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_request_test_viewing(uuid, timestamptz, text) to authenticated, service_role;

-- Allow a trusted administrator to operate on existing catalog records for
-- TESTING only, without transferring ownership or changing publication claims.
-- This marker cannot make a listing searchable, requestable, or verified.
create or replace function public.admin_assign_rental_test_operator(
  p_apartment_id uuid,
  p_enabled boolean default true
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled must not be null' using errcode = '22004';
  end if;

  update public.apartments a
     set metadata = (coalesce(a.metadata, '{}'::jsonb) - 'admin_test_operator_user_id')
       || jsonb_build_object(
            'admin_test_operator_active', p_enabled,
            'admin_test_operator_updated_by', v_uid,
            'admin_test_operator_updated_at', now()
          )
       || case when p_enabled
            then jsonb_build_object('admin_test_operator_user_id', v_uid)
            else '{}'::jsonb end
   where a.id = p_apartment_id
   returning a.* into v_row;

  if not found then
    raise exception 'apartment % not found', p_apartment_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$;

comment on function public.admin_assign_rental_test_operator(uuid, boolean) is
  'Admin-only internal test operator assignment. Does not imply property ownership, verification, or advertiser permission.';

revoke all on function public.admin_assign_rental_test_operator(uuid, boolean) from public, anon;
grant execute on function public.admin_assign_rental_test_operator(uuid, boolean) to authenticated, service_role;

revoke all on function public.admin_create_test_rental(text, text, text, numeric, text, date, text, uuid) from public, anon;
revoke all on function public.admin_publish_test_rental(uuid) from public, anon;
revoke all on function public.admin_cleanup_test_rental(uuid) from public, anon;
grant execute on function public.admin_create_test_rental(text, text, text, numeric, text, date, text, uuid) to authenticated, service_role;
grant execute on function public.admin_publish_test_rental(uuid) to authenticated, service_role;
grant execute on function public.admin_cleanup_test_rental(uuid) to authenticated, service_role;
