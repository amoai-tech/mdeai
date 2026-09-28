-- SAN-1349 · Enforce the ownership boundary on production rental supply
--
-- An apartment that is simultaneously active, moderation-approved, and published is
-- production-requestable. Production-requestable supply must have a real owner:
--
--   auth.users.id → landlord_profiles.user_id → landlord_profiles.id → apartments.landlord_id
--
-- This migration does three things and nothing else:
--
--   A. Adds a named CHECK ... NOT VALID that blocks any NEW or UPDATED row from entering
--      active + approved + published without landlord_id. NOT VALID is deliberate: the
--      historical production rows are already violating, and a fully validated constraint
--      would abort this deployment. New writes are enforced immediately; VALIDATE happens
--      in 20260927200926_san1349_validate_owner_boundary.sql after the supply is remediated
--      by 20260927200925_san1349_remediate_ownerless_supply.sql.
--      Reference: https://www.postgresql.org/docs/17/sql-altertable.html (ADD CONSTRAINT ...
--      NOT VALID: the constraint is not checked against existing rows, but later inserts and
--      updates are checked, and VALIDATE CONSTRAINT proves history afterwards).
--
--   B. Hardens public.p1_schedule_tour_atomic's NEW-REQUEST eligibility so a listing is
--      requestable only when it is active AND approved AND published AND owned, in addition
--      to the existing availability window. The function's signature, ACL, SECURITY DEFINER
--      mode, pinned empty search_path, atomic lead+showing write, idempotency, and committed
--      replay path are all unchanged. Replay deliberately stays ahead of eligibility: a
--      request that already committed must remain replayable even if the listing is later
--      paused, unpublished, or sold.
--      Adapted from: supabase/migrations/20260922095853_san1286_atomic_viewing.sql
--
--   C. Recreates only the broker branch of the `showings` SELECT/UPDATE policies so broker
--      authorization is the canonical landlord_id chain alone. The legacy
--      `a.host_id = auth.uid()` branch is removed; it authorized a broker from a column that
--      is not part of the ownership model and currently carries no production data.
--      Adapted from: supabase/migrations/20260617022503_ptr_rentals_broker_rls.sql
--
-- Renter, assigned-agent, partner, and admin visibility are untouched, including the
-- `leads` policies (no regression test demonstrates a defect there).
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · Durable owner invariant
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.apartments
  DROP CONSTRAINT IF EXISTS apartments_owner_required_when_published;

ALTER TABLE public.apartments
  ADD CONSTRAINT apartments_owner_required_when_published
  CHECK (
    NOT (
      status = 'active'
      AND moderation_status = 'approved'
      AND listing_workflow_status = 'published'
    )
    OR landlord_id IS NOT NULL
  ) NOT VALID;

COMMENT ON CONSTRAINT apartments_owner_required_when_published ON public.apartments IS
  'SAN-1349: production-requestable supply (active + approved + published) must have a canonical landlord_id. Installed NOT VALID so historical rows can be remediated, then validated by 20260927200926_san1349_validate_owner_boundary.sql.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · New-request eligibility requires a real owner + approved + published
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.p1_schedule_tour_atomic(
  p_listing_id text,
  p_user_id uuid,
  p_idempotency_key text,
  p_source text,
  p_email text,
  p_name text,
  p_phone text,
  p_trip_id uuid,
  p_scheduled_at timestamptz,
  p_lead_metadata jsonb,
  p_showing_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
      AND (a.available_from IS NULL OR a.available_from <= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
      AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date);
  ELSE
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.slug = v_listing_id
      AND a.status = 'active'
      AND a.moderation_status = 'approved'
      AND a.listing_workflow_status = 'published'
      AND a.landlord_id IS NOT NULL
      AND (a.available_from IS NULL OR a.available_from <= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
      AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date);
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
$$;

REVOKE ALL ON FUNCTION public.p1_schedule_tour_atomic(
  text, uuid, text, text, text, text, text, uuid, timestamptz, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.p1_schedule_tour_atomic(
  text, uuid, text, text, text, text, text, uuid, timestamptz, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.p1_schedule_tour_atomic(
  text, uuid, text, text, text, text, text, uuid, timestamptz, jsonb, jsonb
) IS
  'SAN-1286 + SAN-1349: service-role-only SECURITY DEFINER atomic rental viewing request. One call resolves a requestable listing (active AND moderation-approved AND published AND canonically owned, inside its availability window), enforces auth/guest idempotency, and commits one lead + showing pair in one transaction. A committed request always replays ahead of new-request eligibility.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · Broker authorization is the canonical landlord_id chain alone
--
-- Only the broker branch changes. The renter / assigned-agent branch and the admin
-- branch below are copied forward verbatim from
-- 20260617022503_ptr_rentals_broker_rls.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS showings_select_visible ON public.showings;
CREATE POLICY showings_select_visible
  ON public.showings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = showings.lead_id
        AND (
          l.user_id = (SELECT auth.uid())
          OR l.assigned_agent_id = (SELECT auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.apartments a
      WHERE a.id = showings.apartment_id
        AND a.landlord_id IN (SELECT public.acting_landlord_ids())
    )
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS showings_update_visible ON public.showings;
CREATE POLICY showings_update_visible
  ON public.showings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = showings.lead_id
        AND (
          l.user_id = (SELECT auth.uid())
          OR l.assigned_agent_id = (SELECT auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.apartments a
      WHERE a.id = showings.apartment_id
        AND a.landlord_id IN (SELECT public.acting_landlord_ids())
    )
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = showings.lead_id
        AND (
          l.user_id = (SELECT auth.uid())
          OR l.assigned_agent_id = (SELECT auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.apartments a
      WHERE a.id = showings.apartment_id
        AND a.landlord_id IN (SELECT public.acting_landlord_ids())
    )
    OR (SELECT public.is_admin())
  );
