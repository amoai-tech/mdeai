-- SAN-1698 · MASTRA-UPG-002 — Mastra 1.84 / PG 1.37 workflow journal.
-- Derived from @mastra/pg@1.37.0 WorkflowsPG.getExportDDL('public')
-- and @mastra/core@1.84.0 WORKFLOW_RUN_JOURNAL_TABLE_CONFIGS.
--
-- This is additive. Existing v1 snapshots and all other Mastra tables remain intact.
-- MDE uses PostgresStore(disableInit: true): the runtime cannot create these tables.
-- The 1.84 adapter's getWorkflowRunById/listWorkflowRuns reads both v1 and v2,
-- and the v2 branch references these tables even when only v1 runs exist.
--
-- Vendor table structure, including timezone-aware mirror columns:
create table if not exists public."mastra_workflow_runs" (
  "workflow_name" text not null,
  "run_id" text not null,
  "resourceId" text,
  "threadId" text,
  "status" text not null,
  "header" jsonb not null,
  "lastSeq" integer not null,
  "startStateSeq" integer not null,
  "stateShared" boolean not null,
  "stateSeq" integer not null,
  "statePatchCount" integer not null,
  "statePatchBytes" integer not null,
  "stateBytes" integer,
  "runToken" text not null,
  "createdAt" timestamp not null,
  "updatedAt" timestamp not null,
  "createdAtZ" timestamptz default now(),
  "updatedAtZ" timestamptz default now(),
  constraint mastra_workflow_runs_pkey primary key ("workflow_name", "run_id")
);

create table if not exists public."mastra_workflow_run_entries" (
  "workflow_name" text not null,
  "run_id" text not null,
  "seq" integer not null,
  "kind" text not null,
  "step_id" text,
  "payload" jsonb,
  constraint mastra_workflow_run_entries_pkey
    primary key ("workflow_name", "run_id", "seq")
);

-- Preserve vendor query performance (these are the five journal indexes
-- emitted by WorkflowsPG.getExportDDL on the exact target package).
create index if not exists mastra_workflow_runs_name_createdat_idx
  on public."mastra_workflow_runs" ("workflow_name", "createdAt" desc);
create index if not exists mastra_workflow_runs_name_status_createdat_idx
  on public."mastra_workflow_runs" ("workflow_name", "status", "createdAt" desc);
create index if not exists mastra_workflow_runs_threadid_idx
  on public."mastra_workflow_runs" ("threadId");
create index if not exists mastra_workflow_run_entries_step_idx
  on public."mastra_workflow_run_entries" ("workflow_name", "run_id", "kind", "step_id", "seq");
create index if not exists mastra_workflow_run_entries_state_base_idx
  on public."mastra_workflow_run_entries"
  ((payload ->> 'workflowName'), (payload ->> 'runId'))
  where kind = 'state-base';

comment on table public."mastra_workflow_runs" is
  'Mastra v2 workflow run headers — @mastra/pg 1.37; server-owned.';
comment on table public."mastra_workflow_run_entries" is
  'Mastra v2 workflow run journal entries — @mastra/pg 1.37; server-owned.';

-- Apply MDE's existing service_role_manage policy to only these two tables.
-- Conditional grants make this migration replayable on plain PostgreSQL CI,
-- which has no Supabase anon/authenticated/service_role roles.
do $$
declare
  t text;
  has_service_role boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_authenticated boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach t in array array['mastra_workflow_runs', 'mastra_workflow_run_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public', t);

    if has_service_role then
      -- Supabase can supply service_role default ALL grants. Keep only the four
      -- runtime permissions this journal requires (never TRUNCATE).
      execute format('revoke all on public.%I from service_role', t);
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
      execute format('drop policy if exists service_role_manage on public.%I', t);
      execute format(
        'create policy service_role_manage on public.%I for all to service_role using (true) with check (true)',
        t
      );
    end if;
    if has_anon then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if has_authenticated then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;
