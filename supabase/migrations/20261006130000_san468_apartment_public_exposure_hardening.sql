-- =============================================================================
-- Migration: 20261006130000_san468_apartment_public_exposure_hardening.sql
-- Task:      SAN-468 · REAL-002 — Make Production Rental Inventory Launch-Ready
-- =============================================================================
-- Step 4.1 — review apartments grants and RLS policies together.
--
-- 1. Remove the stale `status = 'featured'` disjunct from the public SELECT
--    policy. The apartments status CHECK only allows
--    ('active','inactive','booked','pending'), so 'featured' can never match and
--    the disjunct is dead. Dropping it is behaviour-neutral.
--
-- 2. Table grants were reviewed and deliberately NOT changed. With no anon write
--    policy, RLS semantics are: UPDATE and DELETE affect zero rows silently, while
--    INSERT is rejected with 42501 (new row violates row-level security policy).
--    Revoking the table-level grant would replace that with a hard "permission
--    denied" for every write and break the SAN-1054 lifecycle probe, so it
--    belongs to a separate reviewed security change, not this inventory task.
--
-- Deliberately NOT changed here:
--   * the public predicate stays `status = 'active'`. Tightening it to
--     approved + published is the canonical search-eligibility question owned by
--     SAN-386 (SAN-468 §4.2), not a competing implementation.
--   * no other table, role, policy, or function is touched.
--
-- Replay-safe: DROP POLICY IF EXISTS / CREATE POLICY / REVOKE are idempotent.
-- =============================================================================

drop policy if exists anyone_can_view_active_apartments on public.apartments;

create policy anyone_can_view_active_apartments
  on public.apartments
  for select
  to public
  using (status = 'active');
