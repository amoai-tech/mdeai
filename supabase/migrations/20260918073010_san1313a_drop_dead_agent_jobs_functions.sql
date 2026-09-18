-- SAN-1313 · Migration A — drop the 8 dead agent_jobs functions
--
-- WHY THESE ARE DEAD
-- The legacy agent queue was retired deliberately, and the cleanup migration says so:
--
--   20260524022749_mdeapp_canonical_schema_cleanup.sql
--     line 12:  DROP TRIGGER IF EXISTS trigger_agent_jobs_broadcast ON public.agent_jobs;
--     line 19:  -- ── Agent stack (replaced by mastra_* + ai_runs) ──
--     line 24:  DROP TABLE IF EXISTS public.agent_jobs CASCADE;
--
-- It dropped the tables and the broadcast trigger, but LEFT THE FUNCTIONS BEHIND.
-- `public.agent_jobs` is absent in production AND in a fresh replay, so none of these
-- 8 can ever succeed. Same disease as the SAN-1306 outbox cluster: removal that stopped
-- half-way and left a broken surface in place.
--
-- ZERO-CALLER PROOF — every callable surface searched, 2026-09-18 (SAN-1313 Phase 1):
--   * application source src/**          0 callers
--                                        (6 type declarations in database.types.ts,
--                                         which declare a shape, never call it)
--   * repository Edge Function source    0 references
--   * deployed Edge bundles (39/39)      0 occurrences, 0 .rpc() call sites
--   * database triggers using them       0
--   * pg_depend dependents               0
--   * cron job commands                  0
--
-- DROP, DO NOT RECREATE. All 8 are SECURITY DEFINER and target a table that exists in
-- no environment. Recovering the table would resurrect a design the repo explicitly
-- replaced with mastra_* + ai_runs.
--
-- SCOPE — exactly these 8 functions. Deliberately NOT included:
--   * type public.conversation_status — it is STILL REFERENCED by live cron job 16
--     (`chat-archive-abandoned`), whose command casts to it. That job is separately
--     pending a retire-or-migrate decision, so the type must outlive this migration.
--   * any cron schedule work — that is SAN-1313 B2, and it is dependency-gated.
--
-- NO `CASCADE`, ON PURPOSE. If anything unexpectedly depends on one of these functions,
-- this migration must FAIL LOUDLY rather than silently drop the dependent object too.
-- The zero-caller proof asserts nothing depends on them; omitting CASCADE is how that
-- claim gets enforced at apply time instead of merely believed.

drop function if exists public.claim_agent_job(text, text[]);
drop function if exists public.complete_agent_job(uuid, jsonb);
drop function if exists public.fail_agent_job(uuid, text);
drop function if exists public.cleanup_expired_agent_jobs();
drop function if exists public.release_stale_agent_job_locks(interval);
drop function if exists public.update_agent_job_progress(uuid, integer, text);
drop function if exists public.broadcast_agent_jobs_changes();
drop function if exists public.realtime_broadcast_agent_jobs();
