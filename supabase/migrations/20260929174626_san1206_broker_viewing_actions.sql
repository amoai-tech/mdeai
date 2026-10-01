-- SAN-1206 · Broker viewing actions: confirm, decline/cancel, reschedule
--
-- WHAT WAS WRONG
--
-- public.showings was writable by callers who must never authorise a booking, and the only
-- path to change one was that over-broad table grant:
--
--   1. `GRANT ALL ON TABLE public.showings TO anon, authenticated` (20260404120002_p1_showings.sql)
--      handed the Data API TRUNCATE, DELETE and UPDATE on every column. TRUNCATE is not
--      covered by RLS at all.
--   2. `showings_update_visible` admitted the RENTER branch via `l.user_id = (select auth.uid())`.
--      RLS is row-level, never column-level, so a lead owner could rewrite the authoritative
--      `status` and `scheduled_at` of a viewing the broker owns.
--   3. There was no broker transition RPC, so (2) was the only available path.
--
-- Measured RED against the pre-migration schema by san1206_broker_viewing_actions_test.sql:
-- the renter's direct UPDATE raised no exception and the persisted row became
-- status='no_show', scheduled_at='2099-11-21 21:00:00+00' — i.e. the renter silently
-- overwrote the broker's own decision and moved the appointment.
--
-- WHAT THIS MIGRATION DOES
--
--   A. Removes every table privilege anon/authenticated did not need, keeping exactly the
--      SELECT the broker dashboard reads through.
--   B. Replaces the UPDATE policy with a broker-or-admin policy. The DROP is load-bearing:
--      permissive policies OR together, so creating the narrow policy without dropping the
--      old one would leave the renter branch fully intact.
--   C. Adds ONE transition RPC, public.p1_broker_update_showing(...), that locks the row,
--      authorises the caller, and applies confirm / cancel / reschedule to the SAME row.
--
-- WHY THE RPC IS SECURITY DEFINER, NOT SECURITY INVOKER
--
-- The task preferred INVOKER and this migration does not switch silently. INVOKER cannot
-- satisfy the contract once (A) lands, and the reason is mechanical:
--
--   * `auth.uid()` is read from a request GUC, so it is identical whether the body runs as
--     the caller or as the definer. Identity is therefore not what forces DEFINER.
--   * Authority is. Once `UPDATE` is revoked from `authenticated` — which is exactly what
--     blocks the renter and the direct Data API path — a SECURITY INVOKER body executes as
--     the caller and hits the same `42501 permission denied for table showings`. The vetted
--     transition would be refused alongside the illegitimate ones.
--   * The two requirements are a contradiction under INVOKER: "the caller must not be able
--     to write these columns" and "the caller must be able to trigger a write of these
--     columns". Separating them requires the body to run with privileges the caller does not
--     hold.
--
-- The alternative considered and rejected was keeping the table grant and validating
-- transitions in a BEFORE UPDATE trigger. It was rejected because the trigger would still
-- admit any caller the RLS policy allows — a broker could then PATCH `status` straight to
-- `completed` through PostgREST and bypass the expected-state guard entirely — and because
-- gating the trigger on a session flag is spoofable in a way a definer ACL is not.
--
-- The DEFINER function is deliberately narrow, per the Supabase function-security guidance
-- and the existing `transition_listing_workflow` precedent: fixed input vocabulary, no
-- dynamic SQL, `search_path` pinned, every object schema-qualified, EXECUTE revoked from
-- PUBLIC and anon and granted only to authenticated, and an explicit ownership check on the
-- locked row. RLS on the table is NOT the authority inside this body — the definer owns
-- `showings`, so RLS is bypassed — which is precisely why the ownership check is explicit
-- and why the test asserts the denials against the persisted row.
--
-- ERROR CONTRACT
--
--   42501 authentication/authorization refused      -> route 403
--   PT404 showing not found                       -> route 404
--   22023 malformed or non-future reschedule input  -> route 400
--   PT409 stale expected state, or a transition the current state does not permit
--         (including a reschedule onto a day the same renter already occupies)
--                                                    -> route 409, refresh and retry
--
-- WHY PT409 AND NOT A P<task-id> CODE
--
-- PostgREST translates PostgreSQL error codes into HTTP statuses, and class P0 (PL/pgSQL error)
-- is not a conflict: measured against this stack, a P1206 raised here came back from
-- /rest/v1/rpc/... as HTTP 400. That made the same refusal a 409 through the application route
-- and a 400 to any direct RPC caller, and a routine "this request changed" logged as a client
-- error rather than a conflict. PostgREST's documented PTxyz form maps straight through:
-- PT409 -> 409 and PT404 -> 404, so the RPC and the route now agree.
--
-- This is deliberately not the P<task-id> convention SAN-1286 used for its own code. That code
-- is raised on a replay path where the HTTP status is never the contract; here it is.
--
-- Refs:
--   https://docs.postgrest.org/en/v11/references/errors.html#http-status-codes
--   https://docs.postgrest.org/en/v11/references/errors.html#raise-errors-with-http-status-codes
--
-- ponytail: this RPC changes the row and tells nobody. Notifying the renter (email/push) is
-- deliberately out of scope because there is no identity-bound renter acceptance surface yet;
-- upgrade path is a notification edge function enqueued from the route layer, not from here.

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · Least-privilege table grants
--
-- Nothing in src/ or supabase/functions/ writes showings as a signed-in user: the only
-- writer is p1_schedule_tour_atomic, which is SECURITY DEFINER and therefore unaffected.
-- authenticated keeps SELECT because the broker dashboard reads through it.
--
-- `GRANT ALL` also conferred REFERENCES, TRIGGER and TRUNCATE. TRUNCATE in particular is not
-- subject to RLS, so it is revoked here rather than left to the policies.
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.showings FROM anon;
REVOKE ALL ON TABLE public.showings FROM authenticated;
GRANT SELECT ON TABLE public.showings TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · Authoritative mutation is broker/admin only
--
-- The renter and assigned-agent branch is removed from UPDATE. It still passes SELECT, so a
-- renter keeps seeing their own viewing.
--
-- DELETE is worth stating precisely, because the policy and the grant now disagree on purpose:
-- `showings_delete_admin_or_parties` is left in place as defence in depth, but section A revoked
-- DELETE from `authenticated`, so no signed-in role can reach it and renter-side deletion is not
-- currently possible. Only `authenticated` SELECT survives on this table. If deleting a booking
-- from the renter's side is wanted, it needs its own decision and its own grant — not a
-- side effect of narrowing UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS showings_update_visible ON public.showings;
DROP POLICY IF EXISTS showings_update_broker_or_admin ON public.showings;

CREATE POLICY showings_update_broker_or_admin
  ON public.showings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
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
      FROM public.apartments a
      WHERE a.id = showings.apartment_id
        AND a.landlord_id IN (SELECT public.acting_landlord_ids())
    )
    OR (SELECT public.is_admin())
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · The single atomic broker transition
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.p1_broker_update_showing(
  p_showing_id uuid,
  p_action text,
  p_expected_status text,
  p_expected_scheduled_at timestamptz,
  p_new_scheduled_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.showings%ROWTYPE;
  -- True when the outcome the caller asked for already holds. A genuine network retry
  -- re-sends the ORIGINAL expected values, so replay must be decided by the OUTCOME, never
  -- by whether the expected state still matches — otherwise the second identical request
  -- would be rejected as stale and a retry could never be safe.
  v_replay boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('confirm', 'cancel', 'reschedule') THEN
    RAISE EXCEPTION 'invalid viewing action: %', coalesce(p_action, 'null')
      USING ERRCODE = '22023';
  END IF;

  -- Lock before reading the state we are about to validate. Without this, two concurrent
  -- actions could both read `scheduled`, both pass the expected-state check, and both write.
  SELECT * INTO v_row
  FROM public.showings
  WHERE id = p_showing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'showing not found' USING ERRCODE = 'PT404';
  END IF;

  -- Explicit and unavoidable: the definer owns showings, so RLS does not apply inside this
  -- body. This check is the authorization boundary, not a redundant echo of the policy above.
  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.apartments a
      WHERE a.id = v_row.apartment_id
        AND a.landlord_id IN (SELECT public.acting_landlord_ids())
    )
  ) THEN
    RAISE EXCEPTION 'broker does not own this showing' USING ERRCODE = '42501';
  END IF;

  IF (p_action = 'confirm' AND v_row.status = 'confirmed')
     OR (p_action = 'cancel' AND v_row.status = 'cancelled')
     OR (p_action = 'reschedule'
         AND v_row.status = 'scheduled'
         AND v_row.scheduled_at IS NOT DISTINCT FROM p_new_scheduled_at) THEN
    v_replay := true;
  END IF;

  IF NOT v_replay THEN
    IF v_row.status IS DISTINCT FROM p_expected_status
       OR v_row.scheduled_at IS DISTINCT FROM p_expected_scheduled_at THEN
      RAISE EXCEPTION 'showing changed since it was loaded (status %, scheduled_at %)',
        v_row.status, v_row.scheduled_at
        USING ERRCODE = 'PT409', HINT = 'Refresh and try again.';
    END IF;

    -- confirm and reschedule are only meaningful for a request the renter has not had
    -- answered yet. A confirmed appointment is never moved to a new time here: there is no
    -- renter communication/acceptance contract for that yet.
    IF p_action IN ('confirm', 'reschedule') AND v_row.status <> 'scheduled' THEN
      RAISE EXCEPTION 'a % viewing cannot be %', v_row.status, p_action
        USING ERRCODE = 'PT409', HINT = 'Refresh and try again.';
    END IF;

    -- cancel is the one outcome reachable from both open states, and it is itself terminal:
    -- a row already cancelled is handled as replay above and never reaches this block.
    -- Once the visit is completed or no_show the broker decision is historical, so a
    -- late cancel must not rewrite it -- the database enforces this, not the UI.
    IF p_action = 'cancel' AND v_row.status NOT IN ('scheduled', 'confirmed') THEN
      RAISE EXCEPTION 'a % viewing cannot be cancelled', v_row.status
        USING ERRCODE = 'PT409', HINT = 'Refresh and try again.';
    END IF;

    IF p_action = 'reschedule' THEN
      IF p_new_scheduled_at IS NULL THEN
        RAISE EXCEPTION 'reschedule requires a new viewing time' USING ERRCODE = '22023';
      END IF;
      IF p_new_scheduled_at <= now() THEN
        RAISE EXCEPTION 'reschedule time must be in the future' USING ERRCODE = '22023';
      END IF;
    END IF;

    BEGIN
      UPDATE public.showings
         SET status = CASE p_action
                        WHEN 'confirm' THEN 'confirmed'
                        WHEN 'cancel'  THEN 'cancelled'
                        ELSE v_row.status
                      END,
             -- Reschedule moves the time and keeps the status, so the broker UI keeps
             -- rendering it as the still-unanswered Requested.
             scheduled_at = CASE p_action
                              WHEN 'reschedule' THEN p_new_scheduled_at
                              ELSE v_row.scheduled_at
                            END
       WHERE id = v_row.id
       RETURNING * INTO v_row;
    EXCEPTION
      WHEN unique_violation THEN
        -- idx_showings_lead_apt_day is unique per (lead, apartment, America/Bogota day). A
        -- lead may legitimately hold showings on two different days, so moving one onto the
        -- other's day is reachable and must read as a conflict, not an opaque 23505.
        RAISE EXCEPTION 'another viewing already occupies that day for this renter and listing'
          USING ERRCODE = 'PT409', HINT = 'Choose a different day.';
    END;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'scheduled_at', v_row.scheduled_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

-- Default privilege on functions is EXECUTE to PUBLIC, so the REVOKE from PUBLIC is what
-- keeps this off the anonymous RPC surface. anon is revoked separately for clarity.
REVOKE ALL ON FUNCTION public.p1_broker_update_showing(
  uuid, text, text, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p1_broker_update_showing(
  uuid, text, text, timestamptz, timestamptz
) FROM anon;
GRANT EXECUTE ON FUNCTION public.p1_broker_update_showing(
  uuid, text, text, timestamptz, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.p1_broker_update_showing(
  uuid, text, text, timestamptz, timestamptz
) IS
  'SAN-1206 broker viewing transition: confirm/cancel/reschedule the same showing row under row lock, expected-state guard and broker-or-admin authorization. Exact replay is a no-op success; stale or illegal state raises PT409.';

COMMENT ON POLICY showings_update_broker_or_admin ON public.showings IS
  'SAN-1206: authoritative viewing mutation is the owning broker or an admin. The renter/assigned-agent branch was removed from UPDATE. Renter/assigned-agent access may remain represented by separate defensive policies, but authenticated DELETE privilege has been revoked, so signed-in callers cannot use those policies to delete showings.';
