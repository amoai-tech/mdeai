-- =============================================================================
-- Migration: 20261012090000_san486_future_move_in.sql
-- Task:      SAN-486 — support verified future move-in dates
-- =============================================================================
-- MDE should publish apartments with a verified upcoming move-in date. Two rules
-- blocked that:
--   1. the launch gate required available_from <= current_date, so a Nov 1 move-in
--      was reported as missing availability;
--   2. p1_schedule_tour_atomic required available_from <= viewing_date, so an
--      October viewing of a Nov 1 apartment failed even though a tour is allowed
--      before move-in.
-- Both are corrected here; every ownership, permission, photo, location and
-- freshness requirement is unchanged. Viewing date and move-in date are distinct.
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
  v_neighborhood text;
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

  -- Availability must be explicit. SAN-486: a verified FUTURE move-in date is a
  -- valid upcoming listing (a renter can still tour it now); only a missing window or
  -- an already-expired available_to fails closed. A recent freshness check does not
  -- prove the unit is still offered.
  if not (r.available_from is not null
          and (r.available_to is null or r.available_to >= current_date)
          -- A window that ends before it starts can never accommodate a stay.
          and (r.available_to is null or r.available_from <= r.available_to)) then
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
$function$;;


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
  -- SAN-1349: a listing is requestable only when it is active, moderation-approved,
  -- published, canonically owned, and inside its declared availability window. The
  -- ownership requirement is what makes a lead/showing reachable by exactly one broker;
  -- without it a request strands on a listing nobody can be held responsible for.
  IF v_listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.id = v_listing_id::uuid
      AND a.status = 'active'
      AND a.moderation_status = 'approved'
      AND a.listing_workflow_status = 'published'
      AND a.landlord_id IS NOT NULL
      -- SAN-486: viewing eligibility is independent of the move-in date. A missing
      -- move-in date keeps the established "available now" meaning; only an expired or
      -- reversed window blocks a viewing. The row is locked so a concurrent withdrawal
      -- serializes with the lead/showing inserts below.
      AND (a.available_from IS NULL OR a.available_to IS NULL OR a.available_from <= a.available_to)
      AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
    FOR UPDATE;
  ELSE
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.slug = v_listing_id
      AND a.status = 'active'
      AND a.moderation_status = 'approved'
      AND a.listing_workflow_status = 'published'
      AND a.landlord_id IS NOT NULL
      -- SAN-486: viewing eligibility is independent of the move-in date. A missing
      -- move-in date keeps the established "available now" meaning; only an expired or
      -- reversed window blocks a viewing. The row is locked so a concurrent withdrawal
      -- serializes with the lead/showing inserts below.
      AND (a.available_from IS NULL OR a.available_to IS NULL OR a.available_from <= a.available_to)
      AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
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

