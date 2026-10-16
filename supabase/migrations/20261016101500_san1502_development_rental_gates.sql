-- SAN-1502 · Phase A rental development, with server-owned explicit phase.
-- Anonymous fixture exclusion is a technical privacy boundary, not a business gate.
-- Phase B requires an explicit reviewed update to 'launch'.
create table if not exists public.rental_runtime_settings (
  singleton boolean primary key default true check (singleton),
  phase text not null check (phase in ('development','launch')),
  changed_at timestamptz not null default now()
);
alter table public.rental_runtime_settings enable row level security;
revoke all on public.rental_runtime_settings from public, anon, authenticated;
insert into public.rental_runtime_settings(singleton,phase) values(true,'development')
  on conflict (singleton) do nothing;

create or replace function public.rental_development_active()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select coalesce((select phase='development' from public.rental_runtime_settings where singleton=true), false)
$function$;
revoke all on function public.rental_development_active() from public;
grant execute on function public.rental_development_active() to anon, authenticated, service_role;

-- Public discovery: active MDE catalog only. Business paperwork is deferred.
create or replace function public.rental_listing_is_public(
  p_status text,p_moderation_status text,p_listing_workflow_status text,p_landlord_id uuid,p_metadata jsonb)
returns boolean language sql stable set search_path = ''
as $function$
  select case when public.rental_development_active() then
    p_status='active'
    and coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
    and coalesce(lower(p_metadata->>'inventory_kind'),'') <> 'test_fixture'
  else
    p_status='active' and p_moderation_status='approved'
    and p_listing_workflow_status='published' and p_landlord_id is not null
    and coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
    and coalesce(lower(p_metadata->>'inventory_kind'),'') not in ('test_fixture','external_candidate')
    and coalesce(lower(p_metadata->>'inventory_type'),'') <> 'external'
    and coalesce(lower(p_metadata->>'allowed_action'),'') <> 'view_original_listing'
  end;
$function$;

-- Database-owned requestability projection shared by cards, Details, AI and the
-- atomic viewing RPC. This is a PostgREST computed column on apartments.
create or replace function public.rental_can_request_viewing(a public.apartments)
returns boolean language sql stable set search_path = ''
as $function$
  select coalesce(a.status='active' and a.landlord_id is not null and (
    public.rental_development_active()
    or (
      a.moderation_status='approved'
      and a.listing_workflow_status='published'
      and a.available_from is not null
      and (a.available_to is null or a.available_to >= (now() at time zone 'America/Bogota')::date)
      and coalesce(lower(a.metadata->>'is_test_fixture'),'false') <> 'true'
      and coalesce(lower(a.metadata->>'inventory_kind'),'') not in ('external_candidate','test_fixture')
      and coalesce(lower(a.metadata->>'inventory_type'),'') <> 'external'
      and coalesce(lower(a.metadata->>'allowed_action'),'') <> 'view_original_listing'
    )
  ), false);
$function$;
revoke all on function public.rental_can_request_viewing(public.apartments) from public;
grant execute on function public.rental_can_request_viewing(public.apartments)
  to anon, authenticated, service_role;

-- Any authenticated MDE renter may work with active fixtures in Phase A.
-- Existing RLS on writes and all private-data isolation remain unchanged.
drop policy if exists apartments_authenticated_development_access on public.apartments;
create policy apartments_authenticated_development_access on public.apartments
  for select to authenticated
  using (auth.uid() is not null and public.rental_development_active() and status='active');


CREATE OR REPLACE FUNCTION public.enforce_apartment_initial_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.rental_development_active() then return NEW; end if;
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
$function$


CREATE OR REPLACE FUNCTION public.apartments_material_edit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_material boolean := false;
  v_already_safe boolean;
  v_reason text;
begin
  if public.rental_development_active() then return NEW; end if;
  -- Only OLD live rows need re-review. Initial publishing/republishing starts
  -- from a non-live OLD row, so publish_verified_rental() remains untouched.
  -- Never skip a material edit merely because the UPDATE also changes workflow.
  if OLD.listing_workflow_status = 'published'
     or (OLD.status = 'active' and OLD.moderation_status = 'approved') then
    v_material :=
         (NEW.price_monthly is distinct from OLD.price_monthly)
      or (NEW.price_weekly is distinct from OLD.price_weekly)
      or (NEW.price_daily is distinct from OLD.price_daily)
      or (NEW.currency is distinct from OLD.currency)
      or (NEW.deposit_amount is distinct from OLD.deposit_amount)
      or (NEW.utilities_included is distinct from OLD.utilities_included)
      or (NEW.available_from is distinct from OLD.available_from)
      or (NEW.available_to is distinct from OLD.available_to)
      or (NEW.minimum_stay_days is distinct from OLD.minimum_stay_days)
      or (NEW.maximum_stay_days is distinct from OLD.maximum_stay_days)
      or (NEW.address is distinct from OLD.address)
      or (NEW.neighborhood is distinct from OLD.neighborhood)
      or (NEW.city is distinct from OLD.city)
      or (NEW.latitude is distinct from OLD.latitude)
      or (NEW.longitude is distinct from OLD.longitude)
      -- A null owner is left to the SAN-1349 CHECK, which rejects it outright;
      -- a non-null ownership transfer is material and re-enters review — except
      -- for an administrator repointing a TEST fixture at its responsible
      -- broker, which is development bookkeeping, not a real ownership transfer.
      or (NEW.landlord_id is distinct from OLD.landlord_id
          and NEW.landlord_id is not null
          and not (
            public.is_admin()
            and lower(coalesce(OLD.metadata ->> 'is_test_fixture', 'false')) = 'true'
          ))
      or (NEW.bedrooms is distinct from OLD.bedrooms)
      or (NEW.bathrooms is distinct from OLD.bathrooms)
      or (NEW.size_sqm is distinct from OLD.size_sqm)
      or (NEW.floor_number is distinct from OLD.floor_number)
      or (NEW.total_floors is distinct from OLD.total_floors)
      or (NEW.wifi_speed is distinct from OLD.wifi_speed)
      or (NEW.building_amenities is distinct from OLD.building_amenities)
      or (NEW.video_url is distinct from OLD.video_url)
      or (NEW.virtual_tour_url is distinct from OLD.virtual_tour_url)
      or (NEW.source_url is distinct from OLD.source_url)
      or (NEW.source_listing_id is distinct from OLD.source_listing_id)
      or (NEW.furnished is distinct from OLD.furnished)
      or (NEW.pet_friendly is distinct from OLD.pet_friendly)
      or (NEW.smoking_allowed is distinct from OLD.smoking_allowed)
      or (NEW.parking_included is distinct from OLD.parking_included)
      or (NEW.images is distinct from OLD.images)
      -- Only real administrators may change the internal TEST-operator and
      -- SAN-1502 development keys without reopening an otherwise unchanged
      -- published rental. Other metadata, photo, ownership and material changes
      -- still fail closed.
      -- WARNING: every new administrative test-metadata key MUST be added to the
      -- two exemption lists below, or changing it will demote a live fixture.
      or (
        case when public.is_admin() then
          (coalesce(NEW.metadata, '{}'::jsonb)
            - 'internal_note'
            - 'admin_test_operator_active'
            - 'admin_test_operator_user_id'
            - 'admin_test_operator_updated_by'
            - 'admin_test_operator_updated_at'
            - 'admin_test_owner_user_id'
            - 'admin_test_owner_assigned_by'
            - 'admin_test_owner_assigned_at'
            - 'admin_test_broker_user_id'
            - 'admin_test_broker_assigned_by'
            - 'admin_test_broker_assigned_at'
            - 'admin_test_photo_rights'
            - 'admin_test_publish_state'
            - 'admin_test_rights_updated_by'
            - 'admin_test_rights_updated_at'
            - 'admin_test_approved_by'
            - 'admin_test_approved_at'
            - 'admin_test_rejected_by'
            - 'admin_test_rejected_at'
            - 'admin_test_reopened_by'
            - 'admin_test_reopened_at')
          is distinct from
          (coalesce(OLD.metadata, '{}'::jsonb)
            - 'internal_note'
            - 'admin_test_operator_active'
            - 'admin_test_operator_user_id'
            - 'admin_test_operator_updated_by'
            - 'admin_test_operator_updated_at'
            - 'admin_test_owner_user_id'
            - 'admin_test_owner_assigned_by'
            - 'admin_test_owner_assigned_at'
            - 'admin_test_broker_user_id'
            - 'admin_test_broker_assigned_by'
            - 'admin_test_broker_assigned_at'
            - 'admin_test_photo_rights'
            - 'admin_test_publish_state'
            - 'admin_test_rights_updated_by'
            - 'admin_test_rights_updated_at'
            - 'admin_test_approved_by'
            - 'admin_test_approved_at'
            - 'admin_test_rejected_by'
            - 'admin_test_rejected_at'
            - 'admin_test_reopened_by'
            - 'admin_test_reopened_at')
        else
          (coalesce(NEW.metadata, '{}'::jsonb) - 'internal_note')
          is distinct from (coalesce(OLD.metadata, '{}'::jsonb) - 'internal_note')
        end
      );
  end if;

  if v_material then
    -- The evidence AFTER triggers intentionally update the parent to a safe
    -- draft and provide a specific reason. Preserve that reason; do not turn
    -- it into the generic apartment-edit reason on the nested BEFORE trigger.
    v_already_safe := NEW.listing_workflow_status = 'draft'
                  and NEW.status = 'inactive'
                  and NEW.moderation_status = 'pending'
                  and NEW.verified = false
                  and NEW.published_at is null
                  and NEW.published_by is null;
    v_reason := case
      when v_already_safe
       and nullif(NEW.metadata->>'review_required_reason', '') is distinct from
           nullif(OLD.metadata->>'review_required_reason', '')
      then NEW.metadata->>'review_required_reason'
      else 'material edit after publication'
    end;

    NEW.listing_workflow_status := 'draft';
    NEW.status := 'inactive';
    NEW.moderation_status := 'pending';
    NEW.verified := false;
    NEW.published_at := null;
    NEW.published_by := null;
    -- A missing JWT must never be replaced by a fabricated human UUID.
    NEW.workflow_changed_by := auth.uid();
    NEW.workflow_changed_at := now();
    NEW.updated_at := now();
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'review_required_reason', v_reason,
      'review_required_at', now(),
      'review_actor_kind', case
        when auth.uid() is not null then 'authenticated_user'
        when current_setting('role', true) = 'service_role' then 'service_role'
        else 'database_operation'
      end,
      'review_actor_db_role', coalesce(
        nullif(current_setting('role', true), ''), current_user
      )
    );
  end if;
  return NEW;
end;
$function$


CREATE OR REPLACE FUNCTION public.demote_published_listing_for_review(p_apartment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.apartments;
begin
  if public.rental_development_active() then return; end if;
  select * into v_row from public.apartments where id = p_apartment_id for update;
  if not found then return; end if;

  if v_row.listing_workflow_status = 'published'
     or (v_row.status = 'active' and v_row.moderation_status = 'approved') then
    update public.apartments
       set listing_workflow_status = 'draft',
           status = 'inactive',
           moderation_status = 'pending',
           verified = false,
           published_at = null,
           published_by = null,
           workflow_changed_by = (select auth.uid()),
           workflow_changed_at = now(),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'review_required_reason', p_reason,
             'review_required_at', now(),
             -- DB role is diagnostic provenance, NEVER a human UUID.
             'review_actor_kind', case
               when auth.uid() is not null then 'authenticated_user'
               when current_setting('role', true) = 'service_role' then 'service_role'
               else 'database_operation'
             end,
             'review_actor_db_role', coalesce(
               nullif(current_setting('role', true), ''), current_user
             )
           )
     where id = p_apartment_id;
  end if;
end;
$function$


CREATE OR REPLACE FUNCTION public.block_nonadmin_test_viewing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_renter_id uuid;
  v_old_apartment_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_apartment_id := OLD.apartment_id;
    -- Normal status/contact edits keep the original booking identity.
    -- Apartment or renter/lead reassignment must pass the authorization check.
    IF NEW.apartment_id IS NOT DISTINCT FROM OLD.apartment_id THEN
      -- Keep table-specific record fields in separate branches. Evaluating
      -- NEW.lead_id on leads (or NEW.user_id on showings) raises SQLSTATE 42703.
      IF TG_TABLE_NAME = 'leads' THEN
        IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
          RETURN NEW;
        END IF;
      ELSIF TG_TABLE_NAME = 'showings' THEN
        IF NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id THEN
          RETURN NEW;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Inspect both old and new apartment associations: a changed identity must
  -- not escape the fixture guard by pointing the row at a different apartment.
  IF EXISTS (
       SELECT 1 FROM public.apartments a
       WHERE a.id IN (NEW.apartment_id, v_old_apartment_id)
         AND lower(coalesce(a.metadata->>'is_test_fixture','false')) = 'true'
     ) THEN
    -- Phase A skips tester grants; authenticated identity and broker RLS remain.
    IF public.rental_development_active() THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'leads' THEN
      v_renter_id := NEW.user_id;
    ELSIF TG_TABLE_NAME = 'showings' THEN
      SELECT l.user_id INTO v_renter_id
      FROM public.leads l
      WHERE l.id = NEW.lead_id
        AND l.apartment_id = NEW.apartment_id;
    END IF;

    IF NOT (
      coalesce(public.is_admin(), false)
      OR (
        v_renter_id IS NOT NULL
        AND public.is_authorized_test_actor(v_renter_id, 'renter')
      )
    ) THEN
      RAISE EXCEPTION 'development rental viewing requires an authorized renter'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.p1_schedule_tour_atomic(p_listing_id text, p_user_id uuid, p_idempotency_key text, p_source text, p_email text, p_name text, p_phone text, p_trip_id uuid, p_scheduled_at timestamp with time zone, p_lead_metadata jsonb, p_showing_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_apartment public.apartments%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_showing public.showings%ROWTYPE;
  v_listing_id text := nullif(btrim(p_listing_id), '');
  v_idempotency_key text := nullif(btrim(p_idempotency_key), '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_name text := nullif(btrim(p_name), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_source text := coalesce(nullif(btrim(p_source), ''), 'form');
  v_viewing_identity jsonb;
  v_identity_apartment_id uuid;
  v_replay boolean := false;
BEGIN
  IF v_listing_id IS NULL THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: listing_id required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: idempotency_key required (min 8 chars)'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_user_id IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: guest email required for idempotency'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency is stronger than volatile new-request validation. If this exact
  -- logical request already committed, return the existing pair even when the
  -- requested time has since passed or the listing is no longer requestable.
  IF p_user_id IS NOT NULL THEN
    SELECT l.* INTO v_lead
    FROM public.leads AS l
    WHERE l.user_id = p_user_id
      AND l.idempotency_key = v_idempotency_key;
  ELSE
    SELECT l.* INTO v_lead
    FROM public.leads AS l
    WHERE l.user_id IS NULL
      AND l.idempotency_key = v_idempotency_key;
  END IF;

  -- A published third-party source advertisement is discoverable via the
  -- original source link, but is never MDE-requestable. Do not rely on UI
  -- can_schedule_viewing=false: reject both new requests and early replays.
  IF NOT public.rental_development_active() AND EXISTS (
    SELECT 1 FROM public.apartments a
     WHERE (
       a.id::text = lower(v_listing_id)
       OR a.slug = v_listing_id
       OR a.id = v_lead.apartment_id
       OR a.id::text = lower(v_lead.metadata #>> '{schedule_viewing_identity,apartment_id}')
     )
       AND (
         lower(coalesce(a.metadata->>'inventory_kind', '')) = 'external_candidate'
         OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'external'
         OR lower(coalesce(a.metadata->>'allowed_action', '')) = 'view_original_listing'
       )
  ) THEN
    RAISE EXCEPTION 'source-linked rental is not requestable'
      USING ERRCODE = '42501';
  END IF;

  -- An existing viewing is normally replayable after listing changes,
  -- but development viewing access still requires an authorized renter grant.
  -- Resolve the requested UUID/slug AND the saved immutable apartment ID:
  -- a fixture may have been renamed since its original guest request.
  -- This must run before the early idempotent-replay return above all writes.
  IF (
    EXISTS (
      SELECT 1 FROM public.apartments a
       WHERE (a.id::text = lower(v_listing_id) OR a.slug = v_listing_id)
         AND lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
    )
    OR EXISTS (
      SELECT 1 FROM public.apartments a
       WHERE a.id = v_lead.apartment_id
         AND lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
    )
    OR EXISTS (
      SELECT 1 FROM public.apartments a
       WHERE a.id::text = lower(v_lead.metadata #>> '{schedule_viewing_identity,apartment_id}')
         AND lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
    )
  ) AND NOT (public.rental_development_active() AND p_user_id IS NOT NULL)
    AND NOT (coalesce(public.is_admin(), false) OR (p_user_id IS NOT NULL AND public.is_authorized_test_actor(p_user_id, 'renter'))) THEN
    RAISE EXCEPTION 'development rental viewing requires an authorized renter'
      USING ERRCODE = '42501';
  END IF;

  IF v_lead.id IS NOT NULL THEN
    -- Replay against the immutable request snapshot, never mutable CRM columns.
    -- This keeps one idempotency key bound to one logical viewing even when the
    -- renter later edits their lead profile or preferred time.
    v_viewing_identity := v_lead.metadata -> 'schedule_viewing_identity';
    v_identity_apartment_id := nullif(v_viewing_identity ->> 'apartment_id', '')::uuid;

    IF v_viewing_identity IS NULL OR v_identity_apartment_id IS NULL THEN
      RAISE EXCEPTION 'p1_schedule_tour_atomic: committed viewing identity snapshot missing'
        USING ERRCODE = 'P1286';
    END IF;

    IF nullif(v_viewing_identity ->> 'user_id', '')::uuid IS DISTINCT FROM p_user_id
      OR (v_viewing_identity ->> 'listing_id') IS DISTINCT FROM v_listing_id
      OR nullif(v_viewing_identity ->> 'scheduled_at', '')::timestamptz IS DISTINCT FROM p_scheduled_at
      OR nullif(v_viewing_identity ->> 'trip_id', '')::uuid IS DISTINCT FROM p_trip_id
      OR nullif(v_viewing_identity ->> 'email', '') IS DISTINCT FROM v_email
      OR nullif(v_viewing_identity ->> 'name', '') IS DISTINCT FROM lower(v_name)
      OR nullif(v_viewing_identity ->> 'phone', '') IS DISTINCT FROM v_phone
    THEN
      RAISE EXCEPTION 'p1_schedule_tour_atomic: idempotency key reused for different viewing request'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT s.* INTO v_showing
    FROM public.showings AS s
    WHERE s.lead_id = v_lead.id
      AND s.apartment_id = v_identity_apartment_id
      AND s.scheduled_at = p_scheduled_at;

    IF v_showing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'lead', to_jsonb(v_lead),
        'showing', to_jsonb(v_showing),
        'idempotent_replay', true
      );
    END IF;
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: future scheduled_at required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve UUID or slug inside the same database transaction that performs the write.
  -- Production customer listings keep their normal approval and availability
  -- contract. Development fixtures need only active status and an owner. The
  -- ownership requirement is what makes a lead/showing reachable by exactly one broker;
  -- without it a request strands on a listing nobody can be held responsible for.
  IF v_listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.id = v_listing_id::uuid
      AND a.status = 'active'
      AND (
        public.rental_development_active()
        OR lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
        OR (a.moderation_status = 'approved' AND a.listing_workflow_status = 'published')
      )
      AND a.landlord_id IS NOT NULL
      -- SAN-486: viewing eligibility mirrors the publication contract — a known
      -- move-in date, not an expired or reversed window. It is independent of the
      -- move-in date itself, so a tour can be booked before move-in. The row is locked
      -- so a concurrent withdrawal serializes with the lead/showing inserts below.
      AND (
        public.rental_development_active()
        OR lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
        OR (
          a.available_from IS NOT NULL
          AND (a.available_to IS NULL OR a.available_from <= a.available_to)
          AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
        )
      )
    FOR UPDATE;
  ELSE
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.slug = v_listing_id
      AND a.status = 'active'
      AND (
        public.rental_development_active()
        OR lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
        OR (a.moderation_status = 'approved' AND a.listing_workflow_status = 'published')
      )
      AND a.landlord_id IS NOT NULL
      -- SAN-486: viewing eligibility mirrors the publication contract — a known
      -- move-in date, not an expired or reversed window. It is independent of the
      -- move-in date itself, so a tour can be booked before move-in. The row is locked
      -- so a concurrent withdrawal serializes with the lead/showing inserts below.
      AND (
        public.rental_development_active()
        OR lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
        OR (
          a.available_from IS NOT NULL
          AND (a.available_to IS NULL OR a.available_from <= a.available_to)
          AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
        )
      )
    FOR UPDATE;
  END IF;

  IF v_apartment.id IS NULL THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: listing is not requestable'
      USING ERRCODE = 'P0001';
  END IF;

  -- A browser-provided trip id must never attach a rental lead to another
  -- user's trip. Anonymous viewing requests therefore cannot carry trip_id.
  IF p_trip_id IS NOT NULL THEN
    IF p_user_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.trips AS t
      WHERE t.id = p_trip_id
        AND t.user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'p1_schedule_tour_atomic: trip does not belong to user'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.leads (
      user_id,
      source,
      email,
      phone,
      name,
      apartment_id,
      preferred_showing_at,
      trip_id,
      intent,
      status,
      pipeline_stage,
      metadata,
      idempotency_key
    )
    VALUES (
      p_user_id,
      v_source,
      v_email,
      v_phone,
      v_name,
      v_apartment.id,
      p_scheduled_at,
      p_trip_id,
      'rental',
      'new',
      'showing_scheduled',
      coalesce(p_lead_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'listing_id', v_listing_id,
          'preferred_at', p_scheduled_at,
          'schedule_viewing_identity', jsonb_build_object(
            'user_id', p_user_id,
            'listing_id', v_listing_id,
            'apartment_id', v_apartment.id,
            'scheduled_at', p_scheduled_at,
            'trip_id', p_trip_id,
            'email', v_email,
            'name', lower(v_name),
            'phone', v_phone
          )
        ),
      v_idempotency_key
    )
    ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_lead;

    IF v_lead.id IS NULL THEN
      v_replay := true;
      SELECT l.* INTO v_lead
      FROM public.leads AS l
      WHERE l.user_id = p_user_id
        AND l.idempotency_key = v_idempotency_key;
    END IF;
  ELSE
    INSERT INTO public.leads (
      user_id,
      source,
      email,
      phone,
      name,
      apartment_id,
      preferred_showing_at,
      trip_id,
      intent,
      status,
      pipeline_stage,
      metadata,
      idempotency_key
    )
    VALUES (
      NULL,
      v_source,
      v_email,
      v_phone,
      v_name,
      v_apartment.id,
      p_scheduled_at,
      NULL,
      'rental',
      'new',
      'showing_scheduled',
      coalesce(p_lead_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'listing_id', v_listing_id,
          'preferred_at', p_scheduled_at,
          'schedule_viewing_identity', jsonb_build_object(
            'user_id', p_user_id,
            'listing_id', v_listing_id,
            'apartment_id', v_apartment.id,
            'scheduled_at', p_scheduled_at,
            'trip_id', p_trip_id,
            'email', v_email,
            'name', lower(v_name),
            'phone', v_phone
          )
        ),
      v_idempotency_key
    )
    ON CONFLICT (idempotency_key)
      WHERE user_id IS NULL
        AND idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_lead;

    IF v_lead.id IS NULL THEN
      v_replay := true;
      SELECT l.* INTO v_lead
      FROM public.leads AS l
      WHERE l.user_id IS NULL
        AND l.idempotency_key = v_idempotency_key;
    END IF;
  END IF;

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: idempotency conflict could not be resolved'
      USING ERRCODE = 'P1286';
  END IF;

  -- Reusing an idempotency key for a different logical viewing is an error.
  -- Compare the immutable commit snapshot, not mutable CRM lead fields.
  v_viewing_identity := v_lead.metadata -> 'schedule_viewing_identity';
  v_identity_apartment_id := nullif(v_viewing_identity ->> 'apartment_id', '')::uuid;

  IF v_viewing_identity IS NULL OR v_identity_apartment_id IS NULL THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: committed viewing identity snapshot missing'
      USING ERRCODE = 'P1286';
  END IF;

  IF nullif(v_viewing_identity ->> 'user_id', '')::uuid IS DISTINCT FROM p_user_id
    OR (v_viewing_identity ->> 'listing_id') IS DISTINCT FROM v_listing_id
    OR v_identity_apartment_id IS DISTINCT FROM v_apartment.id
    OR nullif(v_viewing_identity ->> 'scheduled_at', '')::timestamptz IS DISTINCT FROM p_scheduled_at
    OR nullif(v_viewing_identity ->> 'trip_id', '')::uuid IS DISTINCT FROM p_trip_id
    OR nullif(v_viewing_identity ->> 'email', '') IS DISTINCT FROM v_email
    OR nullif(v_viewing_identity ->> 'name', '') IS DISTINCT FROM lower(v_name)
    OR nullif(v_viewing_identity ->> 'phone', '') IS DISTINCT FROM v_phone
    OR v_lead.intent IS DISTINCT FROM 'rental'
  THEN
    RAISE EXCEPTION 'p1_schedule_tour_atomic: idempotency key reused for different viewing request'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT s.* INTO v_showing
  FROM public.showings AS s
  WHERE s.lead_id = v_lead.id
    AND s.apartment_id = v_apartment.id
    AND s.scheduled_at = p_scheduled_at;

  IF v_showing.id IS NULL THEN
    INSERT INTO public.showings (
      lead_id,
      apartment_id,
      scheduled_at,
      status,
      trip_id,
      metadata
    )
    VALUES (
      v_lead.id,
      v_apartment.id,
      p_scheduled_at,
      'scheduled',
      p_trip_id,
      coalesce(p_showing_metadata, '{}'::jsonb)
        || jsonb_build_object('listing_id', v_listing_id)
    )
    ON CONFLICT (
      lead_id,
      apartment_id,
      ((scheduled_at AT TIME ZONE 'America/Bogota')::date)
    ) DO NOTHING
    RETURNING * INTO v_showing;

    IF v_showing.id IS NULL THEN
      SELECT s.* INTO v_showing
      FROM public.showings AS s
      WHERE s.lead_id = v_lead.id
        AND s.apartment_id = v_apartment.id
        AND s.scheduled_at = p_scheduled_at;
    END IF;
  END IF;

  IF v_showing.id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.showings AS s
      WHERE s.lead_id = v_lead.id
        AND s.apartment_id = v_apartment.id
        AND (s.scheduled_at AT TIME ZONE 'America/Bogota')::date
          = (p_scheduled_at AT TIME ZONE 'America/Bogota')::date
    ) THEN
      RAISE EXCEPTION 'p1_schedule_tour_atomic: a showing already exists this calendar day for this lead and apartment'
        USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'p1_schedule_tour_atomic: showing not created or resolved'
      USING ERRCODE = 'P1286';
  END IF;

  RETURN jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'showing', to_jsonb(v_showing),
    'idempotent_replay', v_replay
  );
END;
$function$;

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
  v_neighborhood text;
begin
  if public.rental_development_active() then
    if exists (select 1 from public.apartments where id = p_apartment_id) then
      return array[]::text[];
    end if;
    return array['listing not found']::text[];
  end if;
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

  -- Availability must be explicit. SAN-486: a verified FUTURE move-in date is a
  -- valid upcoming listing (a renter can still tour it now); only a missing window or
  -- an already-expired available_to fails closed. A recent freshness check does not
  -- prove the unit is still offered.
  if not (r.available_from is not null
          -- America/Bogota calendar date, like the future-date check below and the viewing RPC:
          -- the database's own current_date is UTC, which is a day ahead for five hours every night.
          and (r.available_to is null or r.available_to >= (now() at time zone 'America/Bogota')::date)
          -- A window that ends before it starts can never accommodate a stay.
          and (r.available_to is null or r.available_from <= r.available_to)) then
    b := b || 'no current availability evidence'::text;
  end if;

  -- SAN-486: a FUTURE move-in date is a claim about a unit that is not available yet, so a
  -- declared date alone is not enough. It needs a reviewed receipt on the existing
  -- property_verifications row (insert/update is admin or service_role only, never the
  -- owner) that names THIS exact date, a reviewer who is not the listing owner, a review
  -- timestamp and the evidence that was reviewed. Because the receipt names the date, a
  -- receipt for an earlier date cannot authorize a different one; moving available_from
  -- is also a material edit, which already demotes the live listing for re-review.
  -- "Future" is the America/Bogota calendar date, the same zone the viewing RPC uses.
  -- No new table, approval flow or availability engine.
  if r.available_from is not null
     and r.available_from > (now() at time zone 'America/Bogota')::date
     and not exists (
       select 1
         from public.property_verifications pv
        where pv.apartment_id = r.id
          and pv.status = 'verified'
          and pv.verified_at is not null
          and pv.verified_by is not null
          and pv.verified_by is distinct from (
                select lp.user_id from public.landlord_profiles lp where lp.id = r.landlord_id)
          -- Text equality on purpose: no cast that a malformed receipt could make fail.
          and pv.metadata->>'move_in_verified_for' = to_char(r.available_from, 'YYYY-MM-DD')
          and nullif(btrim(coalesce(pv.metadata->>'move_in_evidence', '')), '') is not null
     ) then
    b := b || 'no verified move-in date'::text;
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


  -- SAN-1431 §4.1: a real neighborhood is required. Normalize ALL surrounding
  -- whitespace (spaces, tabs, newlines) before testing, so whitespace-only or padded
  -- values cannot slip through. The staging placeholder 'Pending verification' and
  -- other blank/unknown values must block publication.
  -- (Ceiling: this rejects placeholders/blanks; a plausible value still depends on
  -- the independent owner/review process, as every other verified fact does.)
  v_neighborhood := lower(btrim(coalesce(r.neighborhood, ''), E' \t\n\r\f'));
  if v_neighborhood = ''
     or v_neighborhood in (
       'pending verification','pending','unknown','tbd','unreviewed',
       'n/a','na','por verificar','sin verificar'
     ) then
    b := b || 'no verified neighborhood'::text;
  end if;
  return b;
end;
$function$


do $check$
begin
  if has_function_privilege('anon','public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)','execute')
    or has_function_privilege('authenticated','public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)','execute') then
    raise exception 'unsafe public viewing RPC grant';
  end if;
end
$check$;
