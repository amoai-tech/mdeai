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
-- 2. Revoke the unnecessary end-user write privileges on apartments from `anon`.
--    Supabase's default grant left anon with INSERT/UPDATE/DELETE/TRUNCATE/
--    REFERENCES/TRIGGER. RLS already denied every write (no anon write policy),
--    so this is defense-in-depth: an anonymous client can only SELECT, subject
--    to RLS. `authenticated` keeps its write grants; `service_role` is unchanged.
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

revoke insert, update, delete, truncate, references, trigger
  on public.apartments
  from anon;
