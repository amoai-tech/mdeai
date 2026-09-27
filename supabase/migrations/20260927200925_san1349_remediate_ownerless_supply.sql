-- SAN-1349 · Remediate ownerless production supply (approved product decision)
--
-- WHY THIS IS A MIGRATION
-- 20260927200924_san1349_enforce_owner_boundary.sql installs the ownership CHECK as
-- NOT VALID. That blocks new violations immediately but leaves the historical rows in place
-- so the data decision can be made on evidence rather than forced by a failed deployment.
-- The evidence, gathered read-only from production on 2026-09-27, is:
--
--   * 44 apartments are active + approved + published.
--   * 0 of the 44 have a landlord_id, and 0 have a legacy host_id either.
--   * 43 of the 44 are synthetic seed rows (source = 'seed') whose source_url values are
--     stubs such as https://www.fazwaz.com.co/en/property/stub-0000015.
--   * The only 5 rows in landlord_profiles are QA/E2E fixtures
--     (display_name 'QA Broker <epoch>', email qa.broker.*@mdeai.co, verification_status
--     'pending'), and their 5 owned apartments are E2E/draft rows — not supply.
--
-- There is therefore NO verifiable owner evidence anywhere in the database, and SAN-1349
-- forbids inferring one from host_name, email similarity, neighborhood, title, source_url,
-- or row order. The approved resolution is the documented fallback: remove unowned listings
-- from production-requestable supply. This mirrors what the listing FSM itself does on pause
-- (20260617022518_ptr_rentals_publish_fsm.sql: listing_workflow_status 'paused' + status
-- 'inactive'), so these rows remain fully recoverable: a future real owner publishes them
-- through the existing paused → published transition.
--
-- WHAT THIS DOES NOT TOUCH
--   * It never writes landlord_id. There is no backfill and no guessed ownership.
--   * It never touches an apartment that has a canonical owner.
--   * It never deletes a row, and never touches leads, showings, payments, or embeddings.
--     The historical ownerless leads/showings stay exactly where they are; because their
--     apartments have no landlord_id, no broker can reach them through
--     showings_select_visible / leads_select_broker_listing. They are audited below and
--     reported, not reassigned.
--
-- SCOPE OF THE WRITE: the exact violation predicate
--   status = 'active' AND moderation_status = 'approved'
--   AND listing_workflow_status = 'published' AND landlord_id IS NULL
--
-- IDEMPOTENT: re-running matches zero rows. The migration fails loudly if any violating row
-- survives, so 20260927200926_san1349_validate_owner_boundary.sql can never validate a
-- database that still holds ownerless production supply.

DO $$
DECLARE
  v_remediated integer := 0;
  v_remaining integer := 0;
  v_orphan_leads integer := 0;
  v_orphan_showings integer := 0;
BEGIN
  -- Historical orphans are reported before the supply change so the operator log records the
  -- exact pre-existing scope. They are deliberately NOT modified here.
  SELECT count(*)::int INTO v_orphan_leads
  FROM public.leads l
  JOIN public.apartments a ON a.id = l.apartment_id
  WHERE a.landlord_id IS NULL;

  SELECT count(*)::int INTO v_orphan_showings
  FROM public.showings s
  JOIN public.apartments a ON a.id = s.apartment_id
  WHERE a.landlord_id IS NULL;

  RAISE NOTICE 'SAN-1349 pre-remediation audit: % lead(s) and % showing(s) reference an ownerless apartment (left untouched; no broker can read them through the canonical policies)',
    v_orphan_leads, v_orphan_showings;

  WITH remediated AS (
    UPDATE public.apartments AS a
    SET
      listing_workflow_status = 'paused',
      status = 'inactive',
      paused_at = coalesce(a.paused_at, now()),
      metadata = coalesce(a.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'san1349_ownerless_remediation',
          jsonb_build_object(
            'at', now(),
            'reason', 'active + approved + published without a canonical landlord_id',
            'from_status', a.status,
            'from_moderation_status', a.moderation_status,
            'from_listing_workflow_status', a.listing_workflow_status
          )
        )
    WHERE a.status = 'active'
      AND a.moderation_status = 'approved'
      AND a.listing_workflow_status = 'published'
      AND a.landlord_id IS NULL
    RETURNING 1
  )
  SELECT count(*)::int INTO v_remediated FROM remediated;

  SELECT count(*)::int INTO v_remaining
  FROM public.apartments
  WHERE status = 'active'
    AND moderation_status = 'approved'
    AND listing_workflow_status = 'published'
    AND landlord_id IS NULL;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'SAN-1349 remediation incomplete: % ownerless active+approved+published listing(s) remain',
      v_remaining
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'SAN-1349 remediation: % ownerless production listing(s) unpublished; 0 violations remain',
    v_remediated;
END;
$$;
