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
--   active+approved+published            = 44   constraint present = no
--     ...of which ownerless              = 44
--   RPC-acceptable (state + availability
--     window, as of 2026-09-27 Bogota)   = 39   (5 have an expired available_to)
--   leads = 17 (5 on ownerless)   showings = 6 (4 on ownerless)   orphans 0/0
--
-- NOTE the 44 vs 39 distinction, which this script now measures explicitly:
-- the CHECK constraint and the remediation predicate are STATE-ONLY, so they
-- cover all 44 rows. The RPC additionally requires the requested date to fall
-- inside available_from/available_to, so only 39 were actually requestable.
-- Reporting "RPC accepts 44" would overstate the live exposure.

SELECT '=== SAN-1349 post-apply verification ===' AS notice;

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
-- The live definition must carry the landlord_id guard, and the eligibility
-- counts below are measured against the RPC's FULL predicate: state AND
-- ownership AND the availability window. Matching is case-insensitive and
-- whitespace-normalised so a cosmetic reformat of the function body cannot
-- silently turn this check into a false PASS (Codacy review on #134).
--
-- Every check below is wrapped in an aggregate subquery so it ALWAYS returns
-- exactly one row. Selecting straight from pg_proc/pg_policies with a name
-- filter returns ZERO rows when the object is missing — which prints no verdict
-- at all and reads like "no problems found". That is the same false-PASS class
-- the ILIKE change removed, and it applies to 3a, 5, 6 and 7b (CodeRabbit
-- review on #134). Checks 1, 4, 9, 9b and 10 already used a bare aggregate.

SELECT '3a. RPC body requires landlord_id' AS check,
       'function present and guard present' AS expected,
       CASE WHEN t.n > 0
            THEN 'function present, guard present'
            ELSE 'FUNCTION ABSENT OR GUARD MISSING' END AS actual,
       CASE WHEN t.n > 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT count(*)::int AS n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'p1_schedule_tour_atomic'
    AND regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')
        ILIKE '%landlord_id is not null%'
) t;

-- 3b measures what the RPC would actually ACCEPT (state + ownership +
-- availability), not just the state columns. The two are not the same number:
-- at baseline 44 rows met the state predicate and only 39 were RPC-acceptable.
SELECT '3b. RPC-acceptable listings (state + owner + availability)' AS check,
       '0 (ownerless), and 0 unowned_requestable' AS expected,
       format('state_only=%s ownerless=%s rpc_acceptable=%s accepted_ownerless=%s',
         (SELECT count(*) FROM public.apartments
            WHERE status='active' AND moderation_status='approved'
              AND listing_workflow_status='published'),
         (SELECT count(*) FROM public.apartments
            WHERE status='active' AND moderation_status='approved'
              AND listing_workflow_status='published' AND landlord_id IS NULL),
         (SELECT count(*) FROM public.apartments a,
               (SELECT (now() AT TIME ZONE 'America/Bogota')::date AS d) t
            WHERE a.status='active' AND a.moderation_status='approved'
              AND a.listing_workflow_status='published'
              AND a.landlord_id IS NOT NULL
              AND (a.available_from IS NULL OR a.available_from <= t.d)
              AND (a.available_to   IS NULL OR a.available_to   >= t.d)),
         (SELECT count(*) FROM public.apartments a,
               (SELECT (now() AT TIME ZONE 'America/Bogota')::date AS d) t
            WHERE a.status='active' AND a.moderation_status='approved'
              AND a.listing_workflow_status='published'
              AND a.landlord_id IS NULL
              AND (a.available_from IS NULL OR a.available_from <= t.d)
              AND (a.available_to   IS NULL OR a.available_to   >= t.d))
       ) AS actual,
       CASE WHEN (SELECT count(*) FROM public.apartments
                    WHERE status='active' AND moderation_status='approved'
                      AND listing_workflow_status='published'
                      AND landlord_id IS NULL) = 0
            THEN 'PASS' ELSE 'FAIL' END AS verdict;

-- ── 4 · Broker SELECT no longer authorizes on the legacy host_id column ──────
-- ILIKE + whitespace normalisation: pg_get_expr output is not guaranteed to
-- preserve the original casing or spacing (Codacy review on #134).
select '4. showings policies free of host_id branch' as check,
       'no a.host_id = auth.uid()' as expected,
       coalesce(string_agg(distinct policyname, ', '), 'none') as actual,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'showings'
  and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''), '\s+', ' ', 'g')
      ILIKE '%host_id%';

-- ── 5 · Broker isolation is defined on the canonical chain alone ─────────────
select '5. showings_select_visible uses acting_landlord_ids' as check,
       'policy present on the canonical chain' as expected,
       case when t.n > 0 then 'canonical chain present'
            else 'POLICY ABSENT OR NOT ON CANONICAL CHAIN' end as actual,
       case when t.n > 0 then 'PASS' else 'FAIL' end as verdict
from (
  select count(*)::int as n
  from pg_policies
  where schemaname='public' and tablename='showings'
    and policyname='showings_select_visible'
    and coalesce(qual,'') ilike '%acting_landlord_ids%'
) t;

select '6. leads_select_broker_listing uses acting_landlord_ids' as check,
       'policy present on the canonical chain' as expected,
       case when t.n > 0 then 'canonical chain present'
            else 'POLICY ABSENT OR NOT ON CANONICAL CHAIN' end as actual,
       case when t.n > 0 then 'PASS' else 'FAIL' end as verdict
from (
  select count(*)::int as n
  from pg_policies
  where schemaname='public' and tablename='leads'
    and policyname='leads_select_broker_listing'
    and coalesce(qual,'') ilike '%acting_landlord_ids%'
) t;

-- ── 7 · The canonical ownership chain resolves for every owned listing ───────
-- REPLACED. The previous version grouped apartments by landlord_id HAVING
-- count(*) > 1 and FAILed on the result — which flagged a broker who simply
-- owns two or more listings. That is legitimate and expected, so the check
-- would have produced false FAILs in production as soon as a real broker
-- onboarded more than one unit (Codacy review on #134).
--
-- A listing cannot have two owners: landlord_id is a single-valued FK. What can
-- actually break is the CHAIN — apartments.landlord_id -> landlord_profiles.id
-- -> landlord_profiles.user_id -> auth.users.id. That is what is asserted here.
select '7. canonical owner chain resolves for every owned listing' as check,
       '0 broken' as expected,
       format('owned=%s missing_profile=%s missing_auth_user=%s',
         (select count(*) from public.apartments where landlord_id is not null),
         (select count(*) from public.apartments a
            where a.landlord_id is not null
              and not exists (select 1 from public.landlord_profiles lp
                                where lp.id = a.landlord_id)),
         (select count(*) from public.apartments a
            join public.landlord_profiles lp on lp.id = a.landlord_id
            where not exists (select 1 from auth.users u where u.id = lp.user_id))
       ) as actual,
       case when (select count(*) from public.apartments a
                    where a.landlord_id is not null
                      and not exists (select 1 from public.landlord_profiles lp
                                        where lp.id = a.landlord_id)) = 0
             and (select count(*) from public.apartments a
                    join public.landlord_profiles lp on lp.id = a.landlord_id
                    where not exists (select 1 from auth.users u where u.id = lp.user_id)) = 0
            then 'PASS' else 'FAIL' end as verdict;

-- 7a is informational: how many listings each landlord profile owns. A landlord
-- owning many listings is CORRECT, so this never fails. It exists to make the
-- isolation review concrete — two profiles must not share a landlord_id, which
-- is guaranteed by the FK and asserted by check 7.
select '7a. listings per landlord profile (informational)' as check,
       'any distribution; no shared landlord_id' as expected,
       coalesce(string_agg(format('%s=%s', display_name, n), ', ' order by display_name), 'none') as actual,
       'INFO' as verdict
from (
  select lp.display_name, count(a.id) as n
  from public.landlord_profiles lp
  left join public.apartments a on a.landlord_id = lp.id
  group by lp.display_name
) per_landlord;

select '7b. acting_landlord_ids is a single-owner resolver' as check,
       'function present and scoped to auth.uid()' as expected,
       case when t.n > 0 then 'function present, scoped to auth.uid()'
            else 'FUNCTION ABSENT OR NOT SCOPED' end as actual,
       'REVIEW' as verdict
from (
  select count(*)::int as n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname='public' and p.proname='acting_landlord_ids'
    and regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')
        ilike '%auth.uid()%'
) t;

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

SELECT '=== end SAN-1349 post-apply verification ===' AS notice;
