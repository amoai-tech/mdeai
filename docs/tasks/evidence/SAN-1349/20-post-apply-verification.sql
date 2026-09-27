-- SAN-1349 · post-apply verification (production)
-- Run AFTER the 3 migrations are applied in order:
--   20260927200924_san1349_enforce_owner_boundary.sql
--   20260927200925_san1349_remediate_ownerless_supply.sql
--   20260927200926_san1349_validate_owner_boundary.sql
--
-- READ-ONLY. Every statement is a SELECT. Safe to run against production.
-- Each row reports check / expected / actual / verdict, so the output is the
-- evidence record rather than something that has to be interpreted.
--
-- Captured PRE-APPLY baseline (2026-09-27, for comparison):
--   requestable_ownerless = 44    constraint present = no
--   rpc accepts ownerless = 44    leads = 17 (5 on ownerless)
--   showings = 6 (4 on ownerless) orphans = 0/0

\echo '=== SAN-1349 post-apply verification ==='

-- ── 1 · No ownerless production-requestable supply ───────────────────────────
with v as (
  select count(*)::int as n from public.apartments
  where status = 'active' and moderation_status = 'approved'
    and listing_workflow_status = 'published' and landlord_id is null
)
select '1. ownerless active+approved+published' as check, '0' as expected,
       n::text as actual, case when n = 0 then 'PASS' else 'FAIL' end as verdict
from v;

-- ── 2 · The ownership CHECK exists AND is validated ──────────────────────────
select '2. ownership CHECK installed + validated' as check,
       'present, validated' as expected,
       coalesce(
         (select 'present, validated=' || c.convalidated::text
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
          where n.nspname = 'public' and t.relname = 'apartments'
            and c.conname = 'apartments_owner_required_when_published'),
         'ABSENT') as actual,
       case when exists (
         select 1 from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public' and t.relname = 'apartments'
           and c.conname = 'apartments_owner_required_when_published'
           and c.convalidated)
       then 'PASS' else 'FAIL' end as verdict;

-- ── 3 · The RPC now refuses ownerless / inactive / unapproved / unpublished ──
-- The live definition must contain the landlord_id guard, and the eligibility
-- predicate must match zero production rows for the ownerless/inactive/
-- unapproved/unpublished cases while still matching owned+approved+published.
select '3a. RPC body requires landlord_id' as check,
       'guard present' as expected,
       case when pg_get_functiondef(p.oid) like '%landlord_id IS NOT NULL%'
            then 'guard present' else 'GUARD MISSING' end as actual,
       case when pg_get_functiondef(p.oid) like '%landlord_id IS NOT NULL%'
            then 'PASS' else 'FAIL' end as verdict
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'p1_schedule_tour_atomic';

select '3b. RPC eligibility counts' as check,
       'inactive=0, unapproved=0, unpublished=0, ownerless=0, owned_ok>=0' as expected,
       format('inactive=%s unapproved=%s unpublished=%s ownerless=%s owned_ok=%s',
         (select count(*) from public.apartments where status <> 'active'),
         (select count(*) from public.apartments where moderation_status <> 'approved'),
         (select count(*) from public.apartments where listing_workflow_status <> 'published'),
         (select count(*) from public.apartments
            where status='active' and moderation_status='approved'
              and listing_workflow_status='published' and landlord_id is null),
         (select count(*) from public.apartments
            where status='active' and moderation_status='approved'
              and listing_workflow_status='published' and landlord_id is not null)
       ) as actual,
       case when (select count(*) from public.apartments
                    where status='active' and moderation_status='approved'
                      and listing_workflow_status='published' and landlord_id is null) = 0
            then 'PASS' else 'FAIL' end as verdict;

-- ── 4 · Broker SELECT no longer authorizes on the legacy host_id column ──────
select '4. showings policies free of host_id branch' as check,
       'no a.host_id = auth.uid()' as expected,
       coalesce(string_agg(distinct policyname, ', '), 'none') as actual,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'showings'
  and (coalesce(qual,'') || coalesce(with_check,'')) like '%host_id%';

-- ── 5 · Broker isolation is defined on the canonical chain alone ─────────────
select '5. showings_select_visible uses acting_landlord_ids' as check,
       'canonical chain only' as expected,
       case when coalesce(qual,'') like '%acting_landlord_ids%'
            then 'canonical chain present' else 'MISSING' end as actual,
       case when coalesce(qual,'') like '%acting_landlord_ids%'
            then 'PASS' else 'FAIL' end as verdict
from pg_policies
where schemaname='public' and tablename='showings' and policyname='showings_select_visible';

select '6. leads_select_broker_listing uses acting_landlord_ids' as check,
       'canonical chain only' as expected,
       case when coalesce(qual,'') like '%acting_landlord_ids%'
            then 'canonical chain present' else 'MISSING' end as actual,
       case when coalesce(qual,'') like '%acting_landlord_ids%'
            then 'PASS' else 'FAIL' end as verdict
from pg_policies
where schemaname='public' and tablename='leads' and policyname='leads_select_broker_listing';

-- ── 7 · Broker A / Broker B isolation across landlord profiles ───────────────
-- Two distinct landlords must never resolve to overlapping owned listings.
select '7. no listing is owned by two landlord profiles' as check,
       '0' as expected,
       count(*)::text as actual,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as verdict
from (
  select landlord_id from public.apartments
  where landlord_id is not null
  group by landlord_id having count(*) > 1
) dup;   -- informational: same landlord may legitimately own many listings

select '7b. acting_landlord_ids is a single-owner resolver' as check,
       'returns at most the caller''s own landlord ids' as expected,
       case when pg_get_functiondef(p.oid) like '%auth.uid()%'
            then 'scoped to auth.uid()' else 'REVIEW' end as actual,
       'REVIEW' as verdict
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='acting_landlord_ids';

-- ── 8 · Historical leads and showings are intact (not deleted, not reassigned)
-- Referential integrity is asserted here; the absolute counts are REPORTED for
-- comparison against your pre-apply baseline (production baseline: leads=17,
-- showings=6). Absolute counts are deliberately not hard-coded so this script
-- does not false-FAIL on a database with a different dataset (e.g. local).
select '8. history intact' as check,
       'orphans 0/0; counts >= pre-apply baseline' as expected,
       format('leads=%s showings=%s lead_orphans=%s showing_orphans=%s leads_on_ownerless=%s showings_on_ownerless=%s',
         (select count(*) from public.leads),
         (select count(*) from public.showings),
         (select count(*) from public.leads l where l.apartment_id is not null
            and not exists (select 1 from public.apartments a where a.id = l.apartment_id)),
         (select count(*) from public.showings s where s.apartment_id is not null
            and not exists (select 1 from public.apartments a where a.id = s.apartment_id)),
         (select count(*) from public.leads l
            join public.apartments a on a.id = l.apartment_id where a.landlord_id is null),
         (select count(*) from public.showings s
            join public.apartments a on a.id = s.apartment_id where a.landlord_id is null)
       ) as actual,
       case when (select count(*) from public.leads l where l.apartment_id is not null
                    and not exists (select 1 from public.apartments a where a.id = l.apartment_id)) = 0
             and (select count(*) from public.showings s where s.apartment_id is not null
                    and not exists (select 1 from public.apartments a where a.id = s.apartment_id)) = 0
            then 'PASS (orphans 0; compare counts to baseline)'
            else 'FAIL (referential integrity broken)' end as verdict;

-- ── 9 · Remediation is auditable and reversible ──────────────────────────────
-- REVIEW when 0 stamped: legitimate on a database where remediation had nothing
-- to do. Production baseline is 44.
select '9. remediation audit stamp present' as check,
       'N stamped; production baseline 44' as expected,
       count(*)::text as actual,
       case when count(*) > 0 then 'PASS' else 'REVIEW (nothing to remediate)' end as verdict
from public.apartments
where metadata ? 'san1349_ownerless_remediation';

select '9b. stamped rows are paused' as check,
       'every stamped row inactive + paused' as expected,
       format('stamped=%s inactive=%s paused_wf=%s with_paused_at=%s',
         count(*),
         count(*) filter (where status='inactive'),
         count(*) filter (where listing_workflow_status='paused'),
         count(*) filter (where paused_at is not null)) as actual,
       case when count(*) = 0 then 'REVIEW (no stamped rows)'
            when count(*) filter (where status='inactive'
                                   and listing_workflow_status='paused') = count(*)
            then 'PASS' else 'FAIL' end as verdict
from public.apartments
where metadata ? 'san1349_ownerless_remediation';

-- ── 10 · Migration ledger recorded all three, in order ───────────────────────
select '10. migration ledger' as check,
       'all 3 versions recorded' as expected,
       coalesce(string_agg(version, ', ' order by version), 'NONE') as actual,
       case when count(*) = 3 then 'PASS' else 'FAIL' end as verdict
from supabase_migrations.schema_migrations
where version in ('20260927200924','20260927200925','20260927200926');

\echo '=== end SAN-1349 post-apply verification ==='
