-- =============================================================================
-- Migration: 20261014180500_san1432_private_verification_acl_fix.sql
-- Task:      SAN-1432 — Protect private rental evidence from public access
-- =============================================================================
-- Follow-up to 20261009090200_san1432_private_evidence_rls.sql.
--
-- That migration removed the permissive SELECT policies on rental_freshness_log,
-- rental_listing_images and rental_grounding, but property_verifications kept
-- property_verifications_select_public (TO public, predicate is
-- rental_listing_is_public) plus an over-broad "GRANT ALL ... TO anon".
--
-- A verification row carries private notes and metadata. A listing becoming
-- publicly eligible must not expose its raw verification evidence. The public
-- "verified" badge is served from apartments.verified; authorized internal
-- callers read this table through the owner/admin policy or the service role.
--
-- This migration:
--   1. drops the broad public SELECT policy;
--   2. revokes the anon table grant (no anon path reads or writes this table);
--   3. removes TRUNCATE/REFERENCES/TRIGGER from authenticated — TRUNCATE is not
--      governed by RLS and no client path needs it;
--   4. leaves the owner/admin SELECT policy, the admin write policies and
--      service_role access intact.
-- =============================================================================

-- 1 · Drop the broad public verification-read policy.
drop policy if exists property_verifications_select_public
  on public.property_verifications;

-- 2 · Remove the over-broad anon grant. No anon read or write path exists, and
--     RLS remains enabled for every other role.
revoke all on table public.property_verifications from anon;

-- 3 · TRUNCATE is not subject to RLS; no client path needs it.
revoke truncate, references, trigger
  on table public.property_verifications from authenticated;

-- 4 · Record the intended access model on the table itself.
comment on table public.property_verifications is
  'P1: one row per apartment; admin-managed private verification evidence. The public verified badge is served from apartments.verified; raw notes/metadata are readable only by the owning broker/admin (authenticated) and service_role.';
