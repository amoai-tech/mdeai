-- =============================================================================
-- Migration: 20261018092945_revoke_visitor_privileges_on_embedding_jobs_and_cache.sql
-- Task:      SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep
--            Semantic Search Current
-- Follows:   20261016235500_embedding_tables_read_only_for_visitors.sql, which did
--            the same for the three search-fingerprint tables.
-- =============================================================================
-- Problem. public.embedding_jobs (the worker's queue) and public.query_embedding_cache
-- (a server-side cache) are internal. Their only row-security policy is
-- service_role, so visitors can neither read nor change rows through the API. But
-- Supabase's default privileges also gave `anon` and `authenticated` every table
-- privilege on both, including TRUNCATE, REFERENCES and TRIGGER, which row
-- security does not govern. SQL grants and RLS policies are separate layers, so
-- the grants should not exist.
--
-- Fix. Visitors keep nothing on either table.
--
-- What keeps working (nothing visitor-facing reads or writes these tables):
--   * the embedding worker runs as service_role and keeps SELECT/INSERT/UPDATE/DELETE
--     (restated below so this migration can never remove it);
--   * enqueue_embedding_job() is SECURITY DEFINER, so the enqueue triggers still fire
--     when a signed-in user edits an apartment, event or restaurant;
--   * claim/complete/fail_embedding_job() are called by service_role only.
--
-- Forward-only and idempotent: REVOKE of a privilege that is not held is a no-op, and
-- GRANT of one already held changes nothing.
-- =============================================================================

revoke all
  on table public.embedding_jobs, public.query_embedding_cache
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.embedding_jobs, public.query_embedding_cache
  to service_role;
