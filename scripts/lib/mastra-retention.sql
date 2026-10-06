-- Mastra retention + anonymous-thread regression guard (vendor-owned tables).
--
-- WHY THIS IS NOT supabase/migrations/**: the public.mastra_* tables are created by
-- npm run mastra:init (PostgresStore.init()), not by migrations. A fresh
-- supabase db reset has no such tables, so a migration that referenced them could
-- not replay. This file is applied by scripts/init-mastra-schema.mjs and by
-- scripts/cleanup-mastra.mjs.
--
-- SAFE WHEN THE SCHEMA IS ABSENT: every table reference is guarded by
-- to_regclass(...). No cron is scheduled here; scheduling is an explicit,
-- post-cleanup CLI step.
--
-- THREE SEPARATE CONCERNS
--   1. RECURRING: expire mastra_ai_spans older than N days (enabled separately).
--   2. ONE-TIME: delete the legacy shared-anonymous threads + their messages.
--      NEVER scheduled; run once, after a reviewed dry run.
--   3. REGRESSION: reject a NEW anonymous thread at write time and expose an
--      assertion that fails when one exists. New anonymous data is evidence of an
--      auth/storage regression and must be investigated, never silently deleted.

-- (1) Recurring trace retention ---------------------------------------------
create or replace function public.mastra_cleanup_spans(
  p_retention_days integer default 30,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $spans$
declare
  v_cutoff timestamp;
  v_deleted integer := 0;
begin
  v_cutoff := (now() at time zone 'UTC')
    - make_interval(days => greatest(coalesce(p_retention_days, 30), 1));
  if to_regclass('public.mastra_ai_spans') is not null then
    if p_dry_run then
      select count(*) into v_deleted
        from public.mastra_ai_spans
       where "createdAt" < v_cutoff;
    else
      delete from public.mastra_ai_spans where "createdAt" < v_cutoff;
      get diagnostics v_deleted = row_count;
    end if;
  end if;
  return jsonb_build_object(
    'dryRun', p_dry_run,
    'retentionDays', greatest(coalesce(p_retention_days, 30), 1),
    'deletedSpans', v_deleted
  );
end;
$spans$;

-- (2) One-time legacy anonymous sweep. NOT scheduled. -----------------------
-- FAILS CLOSED: if any anonymous-owned dependent record exists that this sweep
-- does not remove (observational memory, background tasks, workflow snapshots,
-- scorers), execute refuses before deleting anything, and dry run reports blocked.
create or replace function public.mastra_cleanup_anonymous_threads(
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $anon$
declare
  v_thread_ids jsonb := '[]'::jsonb;
  v_threads integer := 0;
  v_messages integer := 0;
  v_dependents jsonb := '{}'::jsonb;
  v_dep_total integer := 0;
begin
  if to_regclass('public.mastra_threads') is null then
    return jsonb_build_object(
      'dryRun', p_dry_run, 'blocked', false, 'deletedThreads', 0, 'deletedMessages', 0,
      'threadIds', '[]'::jsonb, 'unexpectedDependents', '{}'::jsonb
    );
  end if;

  -- Dependents this sweep does NOT remove. Counted BEFORE any delete, so a partial
  -- cleanup is impossible: either everything expected is removed, or nothing is.
  if to_regclass('public.mastra_observational_memory') is not null then
    v_dependents := v_dependents || jsonb_build_object('observationalMemory',
      (select count(*)::int from public.mastra_observational_memory o join public.mastra_threads t on t.id = o."threadId" where t."resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_background_tasks') is not null then
    v_dependents := v_dependents || jsonb_build_object('backgroundTasks',
      (select count(*)::int from public.mastra_background_tasks b join public.mastra_threads t on t.id = b.thread_id where t."resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_workflow_snapshot') is not null then
    v_dependents := v_dependents || jsonb_build_object('workflowSnapshots',
      (select count(*)::int from public.mastra_workflow_snapshot where "resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_scorers') is not null then
    v_dependents := v_dependents || jsonb_build_object('scorers',
      (select count(*)::int from public.mastra_scorers where "resourceId" = 'anonymous'));
  end if;
  select coalesce(sum(value::int), 0) into v_dep_total from jsonb_each_text(v_dependents);

  select coalesce(jsonb_agg(id order by id), '[]'::jsonb), count(*)::int
    into v_thread_ids, v_threads
    from public.mastra_threads
   where "resourceId" = 'anonymous';

  if v_dep_total > 0 then
    if p_dry_run then
      return jsonb_build_object(
        'dryRun', true, 'blocked', true, 'threads', v_threads, 'threadIds', v_thread_ids,
        'unexpectedDependents', v_dependents, 'deletedThreads', 0, 'deletedMessages', 0
      );
    end if;
    raise exception 'anonymous threads have % unexpected dependent record(s); refusing to delete anything: %',
      v_dep_total, v_dependents::text
      using errcode = 'P0001',
            hint = 'Investigate the dependent rows first. No threads or messages were deleted.';
  end if;

  if to_regclass('public.mastra_messages') is not null then
    if p_dry_run then
      select count(*) into v_messages
        from public.mastra_messages m
        join public.mastra_threads t on t.id = m.thread_id
       where t."resourceId" = 'anonymous';
    else
      delete from public.mastra_messages m
       using public.mastra_threads t
       where m.thread_id = t.id
         and t."resourceId" = 'anonymous';
      get diagnostics v_messages = row_count;
    end if;
  end if;

  if not p_dry_run then
    delete from public.mastra_threads where "resourceId" = 'anonymous';
    get diagnostics v_threads = row_count;
  end if;

  return jsonb_build_object(
    'dryRun', p_dry_run, 'blocked', false,
    'deletedThreads', v_threads, 'deletedMessages', v_messages,
    'threadIds', v_thread_ids, 'unexpectedDependents', v_dependents
  );
end;
$anon$;

-- (3) Impact report for the one-time review (read-only). --------------------
create or replace function public.mastra_anonymous_references()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $refs$
declare
  v jsonb;
begin
  if to_regclass('public.mastra_threads') is null then
    return jsonb_build_object('present', false);
  end if;
  v := jsonb_build_object(
    'present', true,
    'threads', (select count(*)::int from public.mastra_threads where "resourceId" = 'anonymous'),
    'threadIds', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.mastra_threads where "resourceId" = 'anonymous')
  );
  if to_regclass('public.mastra_messages') is not null then
    v := v || jsonb_build_object('messages',
      (select count(*)::int from public.mastra_messages m join public.mastra_threads t on t.id = m.thread_id where t."resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_observational_memory') is not null then
    v := v || jsonb_build_object('observationalMemory',
      (select count(*)::int from public.mastra_observational_memory o join public.mastra_threads t on t.id = o."threadId" where t."resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_background_tasks') is not null then
    v := v || jsonb_build_object('backgroundTasks',
      (select count(*)::int from public.mastra_background_tasks b join public.mastra_threads t on t.id = b.thread_id where t."resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_workflow_snapshot') is not null then
    v := v || jsonb_build_object('workflowSnapshots',
      (select count(*)::int from public.mastra_workflow_snapshot where "resourceId" = 'anonymous'));
  end if;
  if to_regclass('public.mastra_scorers') is not null then
    v := v || jsonb_build_object('scorers',
      (select count(*)::int from public.mastra_scorers where "resourceId" = 'anonymous'));
  end if;
  v := v || jsonb_build_object(
    'unexpectedDependents',
    coalesce((v->>'observationalMemory')::int, 0)
    + coalesce((v->>'backgroundTasks')::int, 0)
    + coalesce((v->>'workflowSnapshots')::int, 0)
    + coalesce((v->>'scorers')::int, 0)
  );
  return v;
end;
$refs$;

-- (4) Regression guard: reject a NEW anonymous thread at write time. --------
create or replace function public.mastra_threads_reject_anonymous()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $guard$
begin
  if NEW."resourceId" = 'anonymous' then
    raise exception 'mastra_threads % may not use the shared anonymous resource', NEW.id
      using errcode = '42501',
            hint = 'A new anonymous thread is an auth/storage regression: investigate, do not auto-delete.';
  end if;
  return NEW;
end;
$guard$;

drop trigger if exists mastra_threads_reject_anonymous on public.mastra_threads;
create trigger mastra_threads_reject_anonymous
  before insert or update on public.mastra_threads
  for each row
  execute function public.mastra_threads_reject_anonymous();

-- (5) Assertions / counts (read-only). --------------------------------------
create or replace function public.mastra_anonymous_thread_count()
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $count$
  select case
    when to_regclass('public.mastra_threads') is null then 0
    else (select count(*)::int from public.mastra_threads where "resourceId" = 'anonymous')
  end;
$count$;

create or replace function public.mastra_orphan_message_count()
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $orphan$
  select case
    when to_regclass('public.mastra_messages') is null then 0
    else (
      select count(*)::int
        from public.mastra_messages m
        left join public.mastra_threads t on t.id = m.thread_id
       where to_regclass('public.mastra_threads') is not null and t.id is null
    )
  end;
$orphan$;

create or replace function public.mastra_assert_no_anonymous_threads()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $assert$
declare
  v_count integer;
begin
  v_count := public.mastra_anonymous_thread_count();
  if v_count > 0 then
    raise exception 'mastra anonymous-thread regression: % thread(s) with resourceId=anonymous', v_count
      using errcode = 'P0001',
            hint = 'Investigate the auth/storage path and preserve the rows as evidence; do not auto-delete.';
  end if;
  return 0;
end;
$assert$;

-- Least privilege: owner + service_role only, on every new function. --------
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.mastra_cleanup_spans(integer, boolean)',
    'public.mastra_cleanup_anonymous_threads(boolean)',
    'public.mastra_anonymous_references()',
    'public.mastra_anonymous_thread_count()',
    'public.mastra_orphan_message_count()',
    'public.mastra_assert_no_anonymous_threads()',
    'public.mastra_threads_reject_anonymous()'
  ]::text[]
  loop
    execute 'revoke all on function ' || f || ' from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'revoke all on function ' || f || ' from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'revoke all on function ' || f || ' from authenticated';
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant execute on function ' || f || ' to service_role';
    end if;
  end loop;
end;
$grants$;
