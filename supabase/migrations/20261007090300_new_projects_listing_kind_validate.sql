-- =============================================================================
-- Migration: 20261007090300_new_projects_listing_kind_validate.sql
-- Task:      SAN-1385 · Build the Safe Data Foundation for New Condo Projects,
--            Leads, and Commissions
-- =============================================================================
-- Validates leads_listing_kind_check in its own transaction.
--
-- The constraint is added NOT VALID in 20261007090200_new_projects_conversion.sql,
-- which holds an ACCESS EXCLUSIVE lock until that migration commits. Validating in
-- the same transaction would scan public.leads while still holding that lock and
-- block reads, defeating the purpose of NOT VALID. Splitting the two lets the lock
-- from ADD CONSTRAINT commit before VALIDATE starts.
--
-- Reference: https://www.postgresql.org/docs/17/sql-altertable.html
--   ADD CONSTRAINT ... NOT VALID enforces new/updated rows immediately;
--   VALIDATE CONSTRAINT proves the constraint against existing rows.
--
-- Production carried only NULL listing_kind values (16/16 rows, verified
-- 2026-10-06), so this is a fast, non-blocking proof.
-- =============================================================================

begin;

alter table public.leads validate constraint leads_listing_kind_check;

commit;
