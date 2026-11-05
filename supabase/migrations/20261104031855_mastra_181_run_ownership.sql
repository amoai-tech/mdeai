-- SAN-1626 — Mastra 1.81 run-ownership tables required by the upgraded runtime.
--
-- Why this migration exists
-- -------------------------
-- `@mastra/core@1.81.0` claims ownership of a run on EVERY `Run._start`
-- (`claimWorkflowRunOwnership` → `WorkflowsPG.claimRunOwnership`), which writes
-- `public.mastra_workflow_run_owners`. `@mastra/pg@1.34.0` also provisions
-- `public.mastra_memory_run_fences` for memory writes made inside a durable run.
--
-- `src/mastra/lib/storage.ts` runs `PostgresStore` with `disableInit: true`, so the
-- runtime never creates its own tables. Production was initialized once and has the
-- older 32-table footprint. Without these two tables every MDE workflow fails at start:
--
--   error: relation "public.mastra_workflow_run_owners" does not exist (SQLSTATE 42P01)
--
-- Reproduced against a disposable PostgreSQL 17 provisioned with the previous adapter,
-- and with a minimal Mastra 1.81 workflow, before this migration was written.
--
-- Both tables carry a PRIMARY KEY on "runId". This is not cosmetic: `claimRunOwnership`
-- upserts with `ON CONFLICT ("runId")`, so a table without that unique constraint fails
-- with SQLSTATE 42P10 ("there is no unique or exclusion constraint matching the ON
-- CONFLICT specification"). Verified the hard way on disposable PostgreSQL 17 — the
-- constraint block below also repairs a table that already exists without its key.
--
-- What this deliberately does NOT do
-- ----------------------------------
-- * It does not create the other vendor tables. `scripts/init-mastra-schema.mjs`
--   (`npm run mastra:init`) owns the full schema; this migration only adds the two
--   objects the upgrade newly requires.
-- * It does not touch rows, columns or indexes on existing `mastra_*` tables.
--   `@mastra/pg@1.34.0` adds nullable columns to `mastra_ai_spans`,
--   `mastra_background_tasks` and `mastra_observational_memory`; MDE uses none of
--   those domains (no `@mastra/observability`, no observational memory, no background
--   tasks), so they are not required here and are recorded in SAN-1626 instead.
--
-- Ordering
-- --------
-- Safe in both directions. On a fresh environment this migration can run before
-- `mastra:init`; the vendor initializer uses `CREATE TABLE IF NOT EXISTS`, so it adopts
-- these tables (verified on disposable PostgreSQL 17: init after this DDL exits 0 and
-- still provisions 39 tables). On production the tables are simply added.
--
-- Lockdown
-- --------
-- `public.mastra_*` tables are server-only. Supabase may grant new tables in
-- `public` to `anon` / `authenticated` by default, so the migration must secure
-- both new tables before any API access. Mirror the canonical lockdown in
-- `scripts/lib/mastra-storage-lockdown.mjs`, but target ONLY these two tables:
-- reapplying DROP POLICY / CREATE POLICY to the 32 existing tables would take
-- unnecessary locks and could overwrite independently maintained policies.
-- The full initializer still locks down the entire prefix in fresh environments.
-- Role checks keep this migration usable on plain PostgreSQL without Supabase roles.

create table if not exists public."mastra_workflow_run_owners" (
    "runId" text not null,
    generation bigint not null,
    "ownerId" text not null,
    "leaseExpiresAt" bigint,
    "updatedAt" bigint not null,
    constraint mastra_workflow_run_owners_pkey primary key ("runId")
);

create table if not exists public."mastra_memory_run_fences" (
    "runId" text not null,
    generation bigint not null,
    "ownerId" text not null,
    "retiredAt" bigint,
    constraint mastra_memory_run_fences_pkey primary key ("runId")
);

-- `create table if not exists` skips the whole statement when the table is already
-- present, so a table created by an earlier half-applied run would keep no primary key
-- and every workflow start would fail 42P10. Make the key explicit and self-healing.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mastra_workflow_run_owners'
      and c.contype = 'p'
  ) then
    alter table public."mastra_workflow_run_owners"
      add constraint mastra_workflow_run_owners_pkey primary key ("runId");
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mastra_memory_run_fences'
      and c.contype = 'p'
  ) then
    alter table public."mastra_memory_run_fences"
      add constraint mastra_memory_run_fences_pkey primary key ("runId");
  end if;
end $$;

comment on table public."mastra_workflow_run_owners" is
  'Mastra durable-run ownership claims. Written on every workflow run start by @mastra/core@1.81.';
comment on table public."mastra_memory_run_fences" is
  'Mastra run-fence generations for memory writes made inside a durable run (@mastra/pg 1.34).';

do $$
declare
  t text;
  has_service_role boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_authenticated boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  -- Additive upgrade: do not rewrite policies on existing Mastra storage tables.
  for t in
    select unnest(array['mastra_workflow_run_owners', 'mastra_memory_run_fences']::text[])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    if has_service_role then
      execute format('drop policy if exists service_role_manage on public.%I', t);
      execute format(
        'create policy service_role_manage on public.%I for all to service_role using (true) with check (true)',
        t
      );
    end if;

    if has_anon then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if has_authenticated then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;
