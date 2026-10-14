-- =============================================================================
-- Migration: 20261014034413_san486_availability_range_checks.sql
-- Task:      SAN-486 — Only Show Rentals Available for the Renter's Entire Stay
-- =============================================================================
-- Search, the launch gate and the viewing RPC all reason about an apartment's availability
-- window and its minimum/maximum stay. Until now nothing stopped a row from holding an
-- impossible value (a window that ends before it starts, a stay of zero or negative nights, a
-- minimum longer than the maximum), so every reader had to defend against it separately. These
-- CHECK constraints make the impossible states unrepresentable at the source.
--
-- NULL still means "unknown / open-ended" and is allowed, exactly as before: the launch gate
-- (not these constraints) decides whether a listing may be published without a move-in date.
-- The readers' own fail-closed checks stay as defence in depth.
--
-- Safety: the live table was audited before this migration — zero reversed windows, zero
-- non-positive limits, zero minimum > maximum — and the constraints are validated as they are
-- added, so a violating row would make this migration fail loudly instead of leaving an
-- unvalidated constraint behind. Each ADD is guarded so a replay is a no-op. No grants, RLS
-- policies or functions change.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.apartments'::regclass AND conname = 'apartments_availability_window_check'
  ) THEN
    ALTER TABLE public.apartments
      ADD CONSTRAINT apartments_availability_window_check
      CHECK (available_from IS NULL OR available_to IS NULL OR available_from <= available_to);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.apartments'::regclass AND conname = 'apartments_minimum_stay_positive_check'
  ) THEN
    ALTER TABLE public.apartments
      ADD CONSTRAINT apartments_minimum_stay_positive_check
      CHECK (minimum_stay_days IS NULL OR minimum_stay_days > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.apartments'::regclass AND conname = 'apartments_maximum_stay_positive_check'
  ) THEN
    ALTER TABLE public.apartments
      ADD CONSTRAINT apartments_maximum_stay_positive_check
      CHECK (maximum_stay_days IS NULL OR maximum_stay_days > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.apartments'::regclass AND conname = 'apartments_stay_limits_ordered_check'
  ) THEN
    ALTER TABLE public.apartments
      ADD CONSTRAINT apartments_stay_limits_ordered_check
      CHECK (minimum_stay_days IS NULL OR maximum_stay_days IS NULL OR minimum_stay_days <= maximum_stay_days);
  END IF;
END
$$;

COMMENT ON CONSTRAINT apartments_availability_window_check ON public.apartments IS
  'SAN-486: a listing window may not end before it starts. NULL = unknown / open-ended.';
COMMENT ON CONSTRAINT apartments_minimum_stay_positive_check ON public.apartments IS
  'SAN-486: a minimum stay is at least one night when set.';
COMMENT ON CONSTRAINT apartments_maximum_stay_positive_check ON public.apartments IS
  'SAN-486: a maximum stay is at least one night when set.';
COMMENT ON CONSTRAINT apartments_stay_limits_ordered_check ON public.apartments IS
  'SAN-486: a minimum stay may not exceed the maximum stay.';
