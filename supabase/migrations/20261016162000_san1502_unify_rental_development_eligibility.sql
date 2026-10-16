-- SAN-1502: Reuse Phase A database setting; no second eligibility engine.
-- Do not certify third-party rights or expose explicit private/test listings.
BEGIN;

CREATE OR REPLACE FUNCTION public.rental_listing_is_public(
 p_status text,p_moderation_status text,p_listing_workflow_status text,
 p_landlord_id uuid,p_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $policy$
 SELECT CASE WHEN public.rental_development_active() THEN
    p_status='active'
    AND coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
    AND coalesce(lower(p_metadata->>'inventory_kind'),'') <> 'test_fixture'
    AND coalesce(lower(p_metadata->>'visibility'),'') NOT IN ('private','internal')
 ELSE
    p_status='active' AND p_moderation_status='approved'
    AND p_listing_workflow_status='published' AND p_landlord_id IS NOT NULL
    AND coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
    AND coalesce(lower(p_metadata->>'inventory_kind'),'') NOT IN ('test_fixture','external_candidate')
    AND coalesce(lower(p_metadata->>'inventory_type'),'') <> 'external'
    AND coalesce(lower(p_metadata->>'allowed_action'),'') <> 'view_original_listing'
 END;
$policy$;

-- This trigger was created with WHEN approved, so changing the function alone
-- cannot index pending Phase A records. Preserve the SAME embedding queue owner.
DROP TRIGGER IF EXISTS trg_enqueue_embed_apartment ON public.apartments;
CREATE TRIGGER trg_enqueue_embed_apartment
AFTER INSERT OR UPDATE OF title,description,neighborhood,amenities
ON public.apartments FOR EACH ROW
WHEN (NEW.moderation_status='approved' OR public.rental_development_active())
EXECUTE FUNCTION public.enqueue_embedding_job();

-- Existing admin-only RPC; preserve test marker and Phase B validation.
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

  IF public.rental_development_active() THEN
    -- Phase A is an operational publish, NEVER proof of photo/owner/price rights.
    UPDATE public.apartments a SET status='active',
      moderation_status='approved',listing_workflow_status='published',
      published_at=now(),published_by=v_uid,verified=false,
      workflow_changed_by=v_uid,workflow_changed_at=now()
    WHERE a.id=p_apartment_id
    RETURNING a.* INTO v_row;
    RETURN v_row;
  END IF;

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

-- ---------------------------------------------------------------------------
-- P0 corrections (2026-10-16 independent review).
--
-- 1. `rental_can_request_viewing()` short-circuited to TRUE whenever
--    `rental_development_active()` was true, so every INACTIVE apartment (and the
--    two inactive test fixtures) reported as requestable. The database is the single
--    owner of this decision, so the defect reached cards, Details, search and the agent.
--    Requestability now always requires an active, non-private record; Phase A merely
--    removes the approval/photo/move-in paperwork, it never resurrects an inactive row.
--
-- 2. `apartments_authenticated_development_access` let ANY signed-in user read any
--    active apartment during development, with no `visibility` check. Permissive
--    policies combine with OR, so it must be corrected at its own owner rather than
--    cancelled elsewhere. Private/internal records stay readable to their creator,
--    their broker and administrators only.
-- ---------------------------------------------------------------------------
create or replace function public.rental_can_request_viewing(a public.apartments)
returns boolean language sql stable set search_path = ''
as $function$
  select
    a.status = 'active'
    and coalesce(lower(a.metadata->>'visibility'), '') not in ('private', 'internal')
    and case when public.rental_development_active() then
      -- Phase A: an active, non-private development record is requestable without
      -- ownership, photo, publication or move-in paperwork. The atomic viewing RPC
      -- still enforces the authorized-actor grant for test-marked fixtures.
      true
    else
      a.landlord_id is not null
      and a.moderation_status = 'approved'
      and a.listing_workflow_status = 'published'
      and a.available_from is not null
      and (a.available_to is null or a.available_to >= (now() at time zone 'America/Bogota')::date)
      and coalesce(lower(a.metadata->>'is_test_fixture'), 'false') <> 'true'
      and coalesce(lower(a.metadata->>'inventory_kind'), '') not in ('external_candidate', 'test_fixture')
      and coalesce(lower(a.metadata->>'inventory_type'), '') <> 'external'
      and coalesce(lower(a.metadata->>'allowed_action'), '') <> 'view_original_listing'
    end;
$function$;
revoke all on function public.rental_can_request_viewing(public.apartments) from public;
grant execute on function public.rental_can_request_viewing(public.apartments)
  to anon, authenticated, service_role;

drop policy if exists apartments_authenticated_development_access on public.apartments;
create policy apartments_authenticated_development_access on public.apartments
  for select to authenticated
  using (
    auth.uid() is not null
    and public.rental_development_active()
    and status = 'active'
    and coalesce(lower(metadata->>'visibility'), '') not in ('private', 'internal')
  );

COMMIT;
