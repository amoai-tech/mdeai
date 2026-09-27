-- SAN-1349 · Validate the permanent ownership invariant
--
-- Runs only after 20260927200925_san1349_remediate_ownerless_supply.sql has removed ownerless
-- rows from production-requestable supply. VALIDATE CONSTRAINT is the second half of the
-- staged pattern begun in 20260927200924_san1349_enforce_owner_boundary.sql: it proves the
-- predicate against every historical row, so a NOT VALID constraint can never be mistaken for
-- an enforced one.
-- Reference: https://www.postgresql.org/docs/17/sql-altertable.html
--
-- Both guards below fail the deployment rather than let an unproven invariant through:
--   * the constraint must exist (a rename or a dropped migration is a hard error, not a no-op)
--   * no violating row may remain (VALIDATE would fail anyway, but the explicit count names the
--     problem instead of reporting a bare check_violation)
--
-- Re-running is safe: VALIDATE CONSTRAINT on an already-validated constraint is a no-op.

DO $$
DECLARE
  v_remaining integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.apartments'::regclass
      AND conname = 'apartments_owner_required_when_published'
  ) THEN
    RAISE EXCEPTION
      'SAN-1349: apartments_owner_required_when_published is missing; cannot validate'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::int INTO v_remaining
  FROM public.apartments
  WHERE status = 'active'
    AND moderation_status = 'approved'
    AND listing_workflow_status = 'published'
    AND landlord_id IS NULL;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'SAN-1349: refusing to validate the ownership constraint with % ownerless active+approved+published listing(s) remaining',
      v_remaining
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER TABLE public.apartments
  VALIDATE CONSTRAINT apartments_owner_required_when_published;

COMMENT ON CONSTRAINT apartments_owner_required_when_published ON public.apartments IS
  'SAN-1349: production-requestable supply (active + approved + published) must have a canonical landlord_id. Validated against all historical rows; new violating INSERT/UPDATE is rejected with 23514.';
