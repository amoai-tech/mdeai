-- SAN-1502 post-merge Phase A correction: #484 introduced new source and
-- test-access business restrictions, and the exact-main SQL suite failed 2/63.
-- Phase A permits viewing requests for any non-private listing, regardless of
-- external source or development/test label. A request is NOT a claim that MDE
-- owns the source listing or has confirmed an appointment.
-- Preserve private/internal data isolation and the unchanged atomic
-- lead/showing/idempotency/identity checks; keep Phase B policy deferred.
begin;

create or replace function public.rental_can_request_viewing(a public.apartments)
returns boolean language sql stable set search_path = ''
as $function$
  select
    -- Phase A has NO listing-status, test-grant, fixture or source-classification
    -- business restrictions. Private/internal privacy is still enforced.
    coalesce(lower(a.metadata->>'visibility'), '') not in ('private', 'internal')
    and (
      public.rental_development_active()
      or (
        coalesce(lower(a.metadata->>'is_test_fixture'), 'false') <> 'true'
        and coalesce(lower(a.metadata->>'inventory_kind'), '') not in ('test_fixture', 'external_candidate')
        and coalesce(lower(a.metadata->>'inventory_type'), '') not in ('test_fixture', 'external')
        and coalesce(lower(a.metadata->>'allowed_action'), '') <> 'view_original_listing'
        and a.status = 'active'
        and a.landlord_id is not null
        and a.moderation_status = 'approved'
        and a.listing_workflow_status = 'published'
        and a.available_from is not null
        and (a.available_to is null or a.available_to >= (now() at time zone 'America/Bogota')::date)
      )
    );
$function$;

-- Continue to expose the same computed field to the existing app consumers.
revoke all on function public.rental_can_request_viewing(public.apartments) from public;
grant execute on function public.rental_can_request_viewing(public.apartments) to anon, authenticated, service_role;

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

  -- Phase B only: a source-linked advertisement stays source-only.
  -- Phase A must not use source markers as a business booking gate.
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
  -- Phase B fixture grants only; Phase A uses ordinary viewing semantics.
  -- The historical snapshot still protects idempotency after renaming.
  IF NOT public.rental_development_active() AND (
    EXISTS (
      SELECT 1 FROM public.apartments a
       WHERE (a.id::text = lower(v_listing_id) OR a.slug = v_listing_id)
         AND (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
    )
    OR EXISTS (
      SELECT 1 FROM public.apartments a
       WHERE a.id = v_lead.apartment_id
         AND (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
    )
    OR EXISTS (
      SELECT 1 FROM public.apartments a
       WHERE a.id::text = lower(v_lead.metadata #>> '{schedule_viewing_identity,apartment_id}')
         AND (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
    )
  ) AND NOT (
    coalesce(public.is_admin(), false)
    OR (
      p_user_id IS NOT NULL
      AND (
        public.has_role(p_user_id, 'admin')
        OR public.has_role(p_user_id, 'super_admin')
        OR public.is_authorized_test_actor(p_user_id, 'renter')
      )
    )
  ) THEN
    RAISE EXCEPTION 'development rental viewing requires an authorized renter'
      USING ERRCODE = '42501';
  END IF;

  -- Privacy is a boundary, not a volatile new-request validation. A viewing that
  -- committed before the listing was marked private/internal must not be
  -- replayed through the early idempotent return. New requests are still denied
  -- by the visibility predicate in the lookup below; this guard covers replay.
  IF v_lead.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.apartments a
     WHERE (
       a.id::text = lower(v_listing_id)
       OR a.slug = v_listing_id
       OR a.id = v_lead.apartment_id
       OR a.id::text = lower(v_lead.metadata #>> '{schedule_viewing_identity,apartment_id}')
     )
       AND coalesce(lower(a.metadata->>'visibility'), '') IN ('private', 'internal')
  ) THEN
    RAISE EXCEPTION 'private rental is not requestable'
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
  -- Phase A removes business paperwork, not privacy: a normal development apartment
  -- is requestable in any status, while private/internal and source-linked inventory
  -- stays out and fixture access remains an independent authorization decision.
  -- Phase B keeps the normal approval, publication, ownership and availability
  -- contract. The row is locked so a concurrent withdrawal serializes below.
  IF v_listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.id = v_listing_id::uuid
      -- Privacy always applies; source classification is a Phase B rule.
      AND coalesce(lower(a.metadata->>'visibility'), '') NOT IN ('private', 'internal')
      AND (public.rental_development_active() OR lower(coalesce(a.metadata->>'inventory_kind', '')) <> 'external_candidate')
      AND (public.rental_development_active() OR lower(coalesce(a.metadata->>'inventory_type', '')) <> 'external')
      AND (public.rental_development_active() OR lower(coalesce(a.metadata->>'allowed_action', '')) <> 'view_original_listing')
      -- Phase A: a non-fixture development record is requestable regardless of
      -- status, moderation, publication or move-in paperwork. Phase B restores
      -- the active-status requirement.
      AND (public.rental_development_active() OR a.status = 'active')
      AND (
        public.rental_development_active()
        OR (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
        OR (a.moderation_status = 'approved' AND a.listing_workflow_status = 'published')
      )
      AND (public.rental_development_active() OR a.landlord_id IS NOT NULL)
      -- SAN-486: viewing eligibility mirrors the publication contract — a known
      -- move-in date, not an expired or reversed window. It is independent of the
      -- move-in date itself, so a tour can be booked before move-in. The row is locked
      -- so a concurrent withdrawal serializes with the lead/showing inserts below.
      AND (
        public.rental_development_active()
        OR (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
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
      -- Privacy always applies; source classification is a Phase B rule.
      AND coalesce(lower(a.metadata->>'visibility'), '') NOT IN ('private', 'internal')
      AND (public.rental_development_active() OR lower(coalesce(a.metadata->>'inventory_kind', '')) <> 'external_candidate')
      AND (public.rental_development_active() OR lower(coalesce(a.metadata->>'inventory_type', '')) <> 'external')
      AND (public.rental_development_active() OR lower(coalesce(a.metadata->>'allowed_action', '')) <> 'view_original_listing')
      -- Phase A: a non-fixture development record is requestable regardless of
      -- status, moderation, publication or move-in paperwork. Phase B restores
      -- the active-status requirement.
      AND (public.rental_development_active() OR a.status = 'active')
      AND (
        public.rental_development_active()
        OR (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
        OR (a.moderation_status = 'approved' AND a.listing_workflow_status = 'published')
      )
      AND (public.rental_development_active() OR a.landlord_id IS NOT NULL)
      -- SAN-486: viewing eligibility mirrors the publication contract — a known
      -- move-in date, not an expired or reversed window. It is independent of the
      -- move-in date itself, so a tour can be booked before move-in. The row is locked
      -- so a concurrent withdrawal serializes with the lead/showing inserts below.
      AND (
        public.rental_development_active()
        OR (
           lower(coalesce(a.metadata->>'is_test_fixture', 'false')) = 'true'
           OR lower(coalesce(a.metadata->>'inventory_kind', '')) = 'test_fixture'
           OR lower(coalesce(a.metadata->>'inventory_type', '')) = 'test_fixture'
         )
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
          'routing_status', CASE WHEN v_apartment.landlord_id IS NULL THEN 'admin_triage' ELSE 'assigned_landlord' END,
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
          'routing_status', CASE WHEN v_apartment.landlord_id IS NULL THEN 'admin_triage' ELSE 'assigned_landlord' END,
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

-- Browser users may not forge p_user_id or bypass the canonical Edge auth path.
revoke all on function public.p1_schedule_tour_atomic(
  text, uuid, text, text, text, text, text, uuid, timestamp with time zone, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.p1_schedule_tour_atomic(
  text, uuid, text, text, text, text, text, uuid, timestamp with time zone, jsonb, jsonb
) to service_role;

comment on function public.p1_schedule_tour_atomic(
  text, uuid, text, text, text, text, text, uuid, timestamp with time zone, jsonb, jsonb
) is 'SAN-1502 Phase A: any non-private listing may receive a development viewing request regardless of source/test/business flags; service-role, atomic and idempotent; Phase B gates remain deferred.';

commit;
