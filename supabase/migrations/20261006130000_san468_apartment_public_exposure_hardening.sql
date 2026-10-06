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
-- 2. Table grants: retain anon INSERT/UPDATE/DELETE so the existing SAN-1054
--    lifecycle probe keeps its contract (anon UPDATE/DELETE affect zero rows via
--    RLS; anon INSERT is rejected 42501). REVOKE TRUNCATE, REFERENCES and TRIGGER,
--    which PostgreSQL does NOT enforce through row-level security — leaving them
--    would let an anonymous client truncate the table or attach triggers.
--    (Precedent: 20260929174626_san1206_broker_viewing_actions.sql.)
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

-- Not covered by RLS; an RLS-only defense would leave these live.
revoke truncate, references, trigger
  on table public.apartments
  from anon;
