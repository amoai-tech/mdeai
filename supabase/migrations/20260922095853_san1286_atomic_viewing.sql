-- SAN-1286 · one atomic rental viewing mutation
--
-- Replaces the Edge function's split lead/showing writes with one privileged
-- database function. The function is service-role only; browser roles must use
-- the server/Edge boundary.

-- Fail loudly rather than silently creating a uniqueness constraint over
-- conflicting historical data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.leads
    WHERE user_id IS NULL
      AND idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SAN-1286 preflight: duplicate guest lead idempotency scopes exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.showings
    GROUP BY lead_id, apartment_id, (scheduled_at AT TIME ZONE 'America/Bogota')::date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SAN-1286 preflight: duplicate same-day showings exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_guest_idempotency_unique
  ON public.leads (idempotency_key)
  WHERE user_id IS NULL
    AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_showings_lead_apt_day
  ON public.showings (
    lead_id,
    apartment_id,
    ((scheduled_at AT TIME ZONE 'America/Bogota')::date)
  );

-- Viewing idempotency depends on the originally submitted listing identifier.
-- Preserve that key inside lead metadata and prevent later lead edits from changing it.
CREATE OR REPLACE FUNCTION public.san1286_preserve_viewing_listing_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.idempotency_key IS NOT NULL
    AND OLD.intent = 'rental'
    AND OLD.metadata ? 'listing_id'
    AND (
      NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.intent IS DISTINCT FROM OLD.intent
      OR (NEW.metadata ->> 'listing_id') IS DISTINCT FROM (OLD.metadata ->> 'listing_id')
    )
  THEN
    RAISE EXCEPTION 'SAN-1286 viewing request identity is immutable'
      USING ERRCODE = 'P1286';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS san1286_preserve_viewing_listing_identity ON public.leads;
CREATE TRIGGER san1286_preserve_viewing_listing_identity
BEFORE UPDATE OF metadata, intent, idempotency_key ON public.leads
FOR EACH ROW
WHEN (OLD.idempotency_key IS NOT NULL AND OLD.intent = 'rental')
EXECUTE FUNCTION public.san1286_preserve_viewing_listing_identity();

REVOKE ALL ON FUNCTION public.san1286_preserve_viewing_listing_identity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.san1286_preserve_viewing_listing_identity()
  TO service_role;

-- PostgREST does not support overloaded RPCs reliably. Retire the historical
-- signature before installing the single current contract.
DROP FUNCTION IF EXISTS public.p1_schedule_tour_atomic(
  uuid, text, uuid, text, text, text, text, jsonb, uuid, timestamptz, text, jsonb
);

CREATE FUNCTION public.p1_schedule_tour_atomic(
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
    -- Replay identity is the normalized identifier captured at commit time, not
    -- the apartment's current slug. The trigger above makes this metadata key
    -- immutable for idempotent rental-viewing leads.
    IF (v_lead.metadata ->> 'listing_id') IS DISTINCT FROM v_listing_id
      OR v_lead.preferred_showing_at IS DISTINCT FROM p_scheduled_at
      OR v_lead.trip_id IS DISTINCT FROM p_trip_id
      OR v_lead.intent IS DISTINCT FROM 'rental'
      OR v_lead.email IS DISTINCT FROM v_email
      OR lower(v_lead.name) IS DISTINCT FROM lower(v_name)
      OR v_lead.phone IS DISTINCT FROM v_phone
    THEN
      RAISE EXCEPTION 'p1_schedule_tour_atomic: idempotency key reused for different viewing request'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT s.* INTO v_showing
    FROM public.showings AS s
    WHERE s.lead_id = v_lead.id
      AND s.apartment_id = v_lead.apartment_id
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

  -- Resolve UUID or slug inside the same database transaction that performs
  -- the write. A listing is requestable only while active and not already
  -- past its declared availability end date.
  IF v_listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.id = v_listing_id::uuid
      AND a.status = 'active'
      AND (a.available_from IS NULL OR a.available_from <= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date)
      AND (a.available_to IS NULL OR a.available_to >= (p_scheduled_at AT TIME ZONE 'America/Bogota')::date);
  ELSE
    SELECT a.* INTO v_apartment
    FROM public.apartments AS a
    WHERE a.slug = v_listing_id
      AND a.status = 'active'
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
          'preferred_at', p_scheduled_at
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
          'preferred_at', p_scheduled_at
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

  -- Reusing an idempotency key for a different logical viewing is an error,
  -- never an instruction to mutate the original request. Name casing is not
  -- request identity because the API canonicalizes it before hashing.
  IF v_lead.apartment_id IS DISTINCT FROM v_apartment.id
    OR v_lead.preferred_showing_at IS DISTINCT FROM p_scheduled_at
    OR v_lead.trip_id IS DISTINCT FROM p_trip_id
    OR v_lead.intent IS DISTINCT FROM 'rental'
    OR v_lead.email IS DISTINCT FROM v_email
    OR lower(v_lead.name) IS DISTINCT FROM lower(v_name)
    OR v_lead.phone IS DISTINCT FROM v_phone
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
  'SAN-1286: service-role-only SECURITY DEFINER atomic rental viewing request. One call resolves an active listing, enforces auth/guest idempotency, and commits one lead + showing pair in one transaction.';
