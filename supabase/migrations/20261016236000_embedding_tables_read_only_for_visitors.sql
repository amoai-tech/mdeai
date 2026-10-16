-- =============================================================================
-- Migration: 20261016236000_embedding_tables_read_only_for_visitors.sql
-- Task:      SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep
--            Semantic Search Current
-- Related:   SAN-1305 · Make Rental, Event, and Restaurant Search Work After a
--            Fresh Database Rebuild (also lists minimal grants for search tables)
-- =============================================================================
-- Problem. The three search-fingerprint tables are readable by visitors on
-- purpose (search runs as the caller). But Supabase's default privileges also
-- gave `anon` and `authenticated` INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
-- and TRIGGER on them. Row security blocks row-level INSERT/UPDATE/DELETE
-- (the write policies are service_role only), but TRUNCATE, REFERENCES and
-- TRIGGER are not governed by row security. SQL grants and RLS policies are
-- separate layers, so the extra grants should not exist.
--
-- Fix. Visitors keep SELECT and nothing else. service_role is untouched: the
-- embedding worker (PR #341) writes as service_role through its RPCs.
--
-- Forward-only and idempotent: REVOKE of a privilege that is not held is a
-- no-op, and GRANT SELECT is re-stated so a read can never be lost by this
-- migration.
-- =============================================================================

revoke insert, update, delete, truncate, references, trigger
  on table public.listing_embeddings, public.event_embeddings, public.restaurant_embeddings
  from public, anon, authenticated;

grant select
  on table public.listing_embeddings, public.event_embeddings, public.restaurant_embeddings
  to anon, authenticated;
