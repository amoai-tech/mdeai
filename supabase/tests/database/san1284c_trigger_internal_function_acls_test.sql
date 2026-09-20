-- SAN-1284 · Batch 0C regression suite — trigger/internal functions are not end-user callable
--
-- WHAT THIS LOCKS IN
-- Every app-owned function in `public` that returns the `trigger` pseudo-type must have no
-- end-user EXECUTE, and the triggers that depend on those functions must still fire.
--
-- The whole batch is safe for exactly four measured reasons (see the migration header):
--   1. PostgREST cannot expose a `trigger`-returning function (289 RPC paths exposed, 0 overlap)
--   2. PostgreSQL checks trigger-function EXECUTE at CREATE TRIGGER, not at fire time
--   3. no internal (non-trigger) caller and no `src/**` / `supabase/functions/**` reference
--   4. no RLS policy references any of them
--
-- Reason 2 is the one that would silently break production if it were false, so it is asserted
-- behaviourally below rather than argued.
--
-- Run with: supabase test db
begin;

select plan(18);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CATCH-ALL: no trigger-returning public function is executable by an end-user role.
-- Asserted per role, because `GRANT ... TO authenticated` does not remove PUBLIC access.
-- This is a set-based assertion on purpose: it also fails if a FUTURE migration introduces a
-- new exposed trigger function, which a hand-written per-function list would miss.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  0, 'C: no trigger-returning function executable via PUBLIC');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'C: no trigger-returning function executable by anon');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'C: no trigger-returning function executable by authenticated');

-- service_role is tested separately: this batch narrows end-user access only and must preserve
-- trusted server execution for every app-owned trigger function present in the environment.
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0, 'C: every app-owned trigger function keeps service_role EXECUTE');

-- ═══════════════════════════════════════════════════════════════════════════════
-- BINDINGS INTACT — the revocation must not have detached any trigger
-- ═══════════════════════════════════════════════════════════════════════════════

select cmp_ok(
  (select count(*)::int from pg_trigger tg
     join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype),
  '>=', 60, 'B: trigger bindings to these functions still exist (was 66)');

select cmp_ok(
  (select count(*)::int from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal and p.proname = 'update_updated_at'),
  '>=', 1, 'B: update_updated_at still bound to its triggers');

select cmp_ok(
  (select count(*)::int from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal and p.proname = 'set_updated_at'),
  '>=', 1, 'B: set_updated_at still bound to its triggers');

-- ═══════════════════════════════════════════════════════════════════════════════
-- BEHAVIOURAL — a trigger still fires after end-user EXECUTE is revoked.
-- This is the assertion that would catch PostgreSQL ever changing to a fire-time check.
-- Runs as the real `authenticated` role against a scratch table, all rolled back.
-- ═══════════════════════════════════════════════════════════════════════════════

create table public.__acl_probe (id int primary key, v int, updated_at timestamptz);
create trigger __acl_probe_trg before update on public.__acl_probe
  for each row execute function public.update_updated_at();
insert into public.__acl_probe(id, v) values (1, 1);
grant update on public.__acl_probe to authenticated;

set local role authenticated;
update public.__acl_probe set v = 2 where id = 1;
reset role;

select is((select v from public.__acl_probe where id = 1), 2,
          'X: authenticated UPDATE succeeded while the trigger function had no EXECUTE');
select isnt((select updated_at from public.__acl_probe where id = 1), null,
            'X: the BEFORE UPDATE trigger still fired (revocation does not stop triggers)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- DIRECT INVOCATION DENIED — real role, real call, expected SQLSTATE 42501.
-- If EXECUTE were still granted the call would instead raise 0A000
-- ("trigger functions can only be called as triggers"), so 42501 is a precise signal.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select throws_ok($$select public.set_updated_at()$$, '42501', null,
                 'X: anon DENIED set_updated_at');
select throws_ok($$select public.compute_lead_score()$$, '42501', null,
                 'X: anon DENIED compute_lead_score');
reset role;

set local role authenticated;
select throws_ok($$select public.update_updated_at()$$, '42501', null,
                 'X: authenticated DENIED update_updated_at');
select throws_ok($$select public.handle_new_user()$$, '42501', null,
                 'X: authenticated DENIED handle_new_user');
select throws_ok($$select public.enqueue_embedding_job()$$, '42501', null,
                 'X: authenticated DENIED enqueue_embedding_job');
select throws_ok($$select public.fn_apply_approval_decision()$$, '42501', null,
                 'X: authenticated DENIED fn_apply_approval_decision');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCOPE GUARD — this batch must not have narrowed anything it did not target.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(has_function_privilege('authenticated', to_regprocedure('public.acting_landlord_ids()'), 'EXECUTE'),
          true, 'S: acting_landlord_ids keeps authenticated (RLS depends on it)');
select is(has_function_privilege('authenticated', to_regprocedure('public.bump_staff_link_version(uuid)'), 'EXECUTE'),
          true, 'S: bump_staff_link_version keeps authenticated');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_refund_v2(uuid,integer,text,text,uuid,text,uuid[])'), 'EXECUTE'),
          true, 'S: ticket_payment_refund_v2 keeps authenticated (SB-002 contract)');

select * from finish();
rollback;
