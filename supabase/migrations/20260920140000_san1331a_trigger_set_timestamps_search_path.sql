-- =============================================================================
-- Migration: 20260920140000_san1331a_trigger_set_timestamps_search_path.sql
-- Task:      SAN-1331 · Task 138 · MDE-SEC-004 — residual Supabase security cleanup
-- Purpose:   Clear Security Advisor lint 0011 (function_search_path_mutable) for
--            every app-owned function in `public`, in BOTH drift directions
--            between production (`zkwcbyxiwklihegjhuql`) and a fresh local replay.
--
-- WHY A NEW MIGRATION INSTEAD OF AN EDIT
-- -----------------------------------------------------------------------------
-- Migration history is immutable. Two earlier migrations already pin the trigger
-- path and are recorded as applied in production:
--   * 20260530012233_data010_search_path_hardening.sql — defines the function with
--     `SET search_path = ''` and pins ten other public functions
--   * 20260531215952_data049_advisor_remediation.sql   — repeats the ALTER
-- Both are applied in production (supabase_migrations.schema_migrations), yet the
-- production catalogue still reports `proconfig = NULL` for the trigger: the
-- definition was superseded out-of-band. Forward-only re-assert is the only safe
-- convergence path.
--
-- MEASURED DRIFT (production vs fresh `supabase db reset`)
-- -----------------------------------------------------------------------------
--   object                                  production        local replay
--   public.trigger_set_timestamps()         NULL              search_path=""
--   public.bump_staff_link_version(uuid)    public, pg_temp   NULL
--   public.ticket_checkout_cancel(uuid)     public, pg_temp   NULL
--   public.ticket_checkout_create_pending() public, pg_temp   NULL
--   public.ticket_payment_finalize()        public, pg_temp   NULL
--   public.ticket_validate_consume(text)    public, pg_temp   NULL
--
-- The five RPCs are the opposite direction: a later `CREATE OR REPLACE FUNCTION`
-- in the SAN-1284a / SAN-1284b batches recreated them without their SET clause,
-- which drops the pin in replay while production still carries the previously
-- applied value.
--
-- SAFETY
-- -----------------------------------------------------------------------------
-- * `trigger_set_timestamps` is a BEFORE ROW trigger whose body only touches the
--   NEW/OLD records and now(). `now()` resolves from pg_catalog, which is always
--   searched implicitly, so an empty search_path cannot change behaviour.
-- * The five RPCs are pinned to the value already running in production, copied
--   verbatim from the live catalogue. That makes replay converge to production
--   instead of changing production behaviour. Restoring data010's `''` here would
--   be a behaviour change on the ticket checkout / payment path, which is out of
--   scope for this cleanup.
-- * The only unqualified call in those bodies is `gen_random_uuid()`, which
--   PostgreSQL 13+ provides in pg_catalog, so it resolves under any search_path.
-- * Every object here is app-owned; no extension-owned object is touched.
-- =============================================================================

-- 1. Production drifted to NULL — re-assert the value a fresh replay already has.
alter function public.trigger_set_timestamps() set search_path = '';

-- 2. Replay drifted to NULL — re-assert the values production already has.
alter function public.bump_staff_link_version(uuid)
  set search_path to public, pg_temp;

alter function public.ticket_checkout_cancel(uuid)
  set search_path to public, pg_temp;

alter function public.ticket_checkout_create_pending(uuid, uuid, integer, text, text, text, jsonb)
  set search_path to public, pg_temp;

alter function public.ticket_payment_finalize(uuid, text)
  set search_path to public, pg_temp;

alter function public.ticket_validate_consume(text)
  set search_path to public, pg_temp;
