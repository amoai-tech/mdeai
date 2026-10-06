-- =============================================================================
-- Migration: 20261007090000_new_projects_enums.sql
-- Task:      SAN-1385 · Build the Safe Data Foundation for New Condo Projects,
--            Leads, and Commissions (decision D4)
-- =============================================================================
-- Adds the two enum values New Projects depends on. This is a deliberately
-- separate migration: per PostgreSQL 17, a value added to an enum inside a
-- transaction block cannot be USED until that transaction commits, so the core
-- and conversion migrations must run after this file commits.
-- Reference: https://www.postgresql.org/docs/17/sql-altertype.html
--   "If ALTER TYPE ... ADD VALUE is executed inside a transaction block, the
--    new value cannot be used until after the transaction has been committed."
-- Replay-safe: ADD VALUE IF NOT EXISTS is a no-op when the value already exists.
-- =============================================================================

begin;

-- D1: developers are a first-class partner type; never overload vendor/agency.
alter type public.partner_type add value if not exists 'developer';

-- Canonical New Projects sales-consultation booking type.
alter type public.booking_type add value if not exists 'new_project_consultation';

commit;
