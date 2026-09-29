-- SAN-1106 — publishing an owned listing is what makes it requestable.
--
-- Root cause this closes
-- ---------------------
-- Nothing in the product ever wrote `apartments.moderation_status = 'approved'`. Every occurrence
-- of that value in the repository was a read (a filter or a guard), a test fixture, or a migration
-- CHECK. The only rows that ever carried it were migration-seeded, and seeds had no owner; the only
-- rows with an owner came from owner onboarding (`src/lib/rentals/submit-broker-onboarding.ts`),
-- which leaves moderation at its `'pending'` default.
--
-- Measured in production on 2026-09-29:
--
--   owned + not approved = 1
--   approved + not owned = 3
--   owned + approved     = 0
--
-- `isRentalRequestable()` (`src/mastra/tools/search-rentals.ts`) requires
-- `landlord_id + status='active' + moderation_status='approved' + listing_workflow_status='published'`,
-- so the two conditions could never meet and no owner-created listing could ever become
-- requestable. The Schedule-viewing CTA was unreachable for real supply, which is why the
-- renter → broker journey had never been provable.
--
-- The fix (Option A)
-- ------------------
-- The single sanctioned publish transition also records moderation approval. `moderation_status`
-- remains the trusted visibility boundary, so the queries, constraints, discovery paths and tests
-- that already read it are deliberately untouched — including the deliberate check in
-- `search-rentals.ts`. This corrects the state machine rather than weakening its consumers.
--
-- Deliberate coupling worth stating: `apartments_owner_required_when_published`
-- (20260927200924_san1349_enforce_owner_boundary.sql) requires `landlord_id IS NOT NULL` whenever
-- a row is active + approved + published. Because this transition now sets all three together,
-- that CHECK stops being unreachable dead code and becomes the real gate: publishing an unowned
-- listing can no longer succeed. That is the intended consequence, not a side effect.
--
-- ponytail: ceiling — approval is derived from a successful owner publish, so there is no human or
-- verification review of listing content at this stage. The upgrade path is to add a real
-- moderation step (an `is_admin()`-gated `moderate_listing()` RPC, or a review surface) and have
-- this transition stop writing `approved`; no consumer of the boundary would need to change.
--
-- Scope: only `transition_listing_workflow` is redefined. `assert_listing_workflow_transition`,
-- the three public wrappers (`request_listing_publish`, `publish_listing`, `pause_listing`) and
-- every GRANT/REVOKE are left exactly as they were. `CREATE OR REPLACE` preserves the existing
-- ACLs; the REVOKE below is re-stated only so this migration is self-contained.

CREATE OR REPLACE FUNCTION public.transition_listing_workflow(
  p_apartment_id uuid,
  p_target_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS public.apartments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.apartments;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.apartments WHERE id = p_apartment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apartment not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.landlord_id IS NULL
     OR v_row.landlord_id NOT IN (SELECT public.acting_landlord_ids()) THEN
    RAISE EXCEPTION 'broker does not own this apartment' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_listing_workflow_transition(v_row.listing_workflow_status, p_target_status);

  IF p_target_status = 'rejected' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'rejection_reason required when rejecting a listing' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.apartments
  SET
    listing_workflow_status = p_target_status,
    ready_for_review_at = CASE WHEN p_target_status = 'ready_for_review' THEN now() ELSE ready_for_review_at END,
    published_at = CASE WHEN p_target_status = 'published' THEN now() ELSE published_at END,
    published_by = CASE WHEN p_target_status = 'published' THEN v_uid ELSE published_by END,
    paused_at = CASE WHEN p_target_status = 'paused' THEN now() ELSE paused_at END,
    rejection_reason = CASE
      WHEN p_target_status = 'rejected' THEN p_rejection_reason
      WHEN p_target_status = 'draft' THEN NULL
      ELSE rejection_reason
    END,
    status = CASE
      WHEN p_target_status = 'published' THEN 'active'
      WHEN p_target_status = 'paused' THEN 'inactive'
      ELSE status
    END,
    -- SAN-1106 — the only behavioural delta.
    --
    -- Publishing records approval: the caller has already been proven to own the listing, and the
    -- transition has already been proven legal.
    --
    -- A rejected listing returning to draft re-enters review, so approval is cleared. The condition
    -- is written against the *from* state as well as the target, not the target alone, so that the
    -- `draft → draft` no-op cannot silently revoke approval on a row that somehow holds both.
    --
    -- Pausing deliberately keeps approval: a paused listing has already been vetted, and requiring
    -- re-approval to un-pause would strand it behind a gate nothing can satisfy.
    moderation_status = CASE
      WHEN p_target_status = 'published' THEN 'approved'
      WHEN v_row.listing_workflow_status = 'rejected' AND p_target_status = 'draft' THEN 'pending'
      ELSE moderation_status
    END,
    updated_at = now()
  WHERE id = p_apartment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Re-stated so this file alone guarantees the privilege shape, even though CREATE OR REPLACE
-- preserves the ACLs set by 20260617022518_ptr_rentals_publish_fsm.sql.
REVOKE ALL ON FUNCTION public.transition_listing_workflow(uuid, text, text) FROM PUBLIC, authenticated, anon;
