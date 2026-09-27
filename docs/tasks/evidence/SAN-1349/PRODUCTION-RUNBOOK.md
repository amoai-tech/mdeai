# SAN-1349 · Production runbook (not yet executed)

**Status: production was deliberately NOT touched in this session.** The user chose
"prepare migrations and prove them locally; do not touch production", and separately chose the
evidence-based remediation "unpublish/deactivate the 44 ownerless listings". This document is
the operator handoff for the production half of SAN-1349.

---

## 1 · Verified production truth (read-only, Supabase MCP, 2026-09-27)

| Check | Value |
|---|---:|
| `apartments` total | 49 |
| active + approved + published | 44 |
| …of those, `landlord_id IS NULL` | **44 / 44** |
| …of those, `host_id IS NOT NULL` | 0 |
| Any `apartments.landlord_id` | 5 (all E2E/draft rows, none requestable) |
| `landlord_profiles` | 5 — **all QA/E2E fixtures** (`qa.broker.*@mdeai.co`, `verification_status = 'pending'`) |
| Requestable under the pre-SAN-1349 RPC rule | 39 |
| Requestable **and** ownerless | **39 / 39** |
| Leads on ownerless apartments | 5 (guest, 2026-05/06, `750e8400-…` seed rows) |
| Showings on ownerless apartments | 4 (same rows) |
| Deployed `p1_schedule_tour_atomic` checks ownership / moderation / workflow | **no / no / no** |

Composition of the 44: 43 rows have `source = 'seed'` with stub `source_url` values
(`…/stub-0000015`), 1 has `source = 'manual'`. There is **no verifiable owner evidence anywhere
in the database**, and SAN-1349 forbids inferring one from `host_name`, email, neighborhood,
title, `source_url`, or row order.

**Conclusion:** the approved resolution is the documented fallback — remove ownerless listings
from production-requestable supply. That is what migration
`20260927200925_san1349_remediate_ownerless_supply.sql` does.

## 2 · What applying the chain will change in production

Applying all three migrations will:

1. install `apartments_owner_required_when_published` (CHECK, `NOT VALID`) — blocks **new**
   violating writes immediately;
2. **pause 44 listings** — `listing_workflow_status: published → paused`,
   `status: active → inactive`, `paused_at` stamped, and a `metadata.san1349_ownerless_remediation`
   audit object written with the previous values;
3. validate the constraint against all remaining rows.

**Product-visible consequence:** production ends with **0 requestable rental listings**. That is
the deliberate, chosen outcome — the alternative was fabricating ownership, which this task
forbids. Recovery is non-destructive: the rows are paused, not deleted, and the existing FSM
transition `paused → published` restores any listing once a real broker owns it.

Historical data that is **not** modified: the 5 leads and 4 showings stay exactly where they are.
Because their apartments have no `landlord_id`, no broker can reach them through
`showings_select_visible` / `leads_select_broker_listing`; the renter/assigned-agent/admin
branches are unchanged.

## 3 · Pre-flight (run before applying, expect the stated numbers)

```sql
-- expect 44
select count(*) from public.apartments
 where status='active' and moderation_status='approved'
   and listing_workflow_status='published' and landlord_id is null;

-- expect 5
select count(*) from public.leads l join public.apartments a on a.id=l.apartment_id
 where a.landlord_id is null;

-- expect 4
select count(*) from public.showings s join public.apartments a on a.id=s.apartment_id
 where a.landlord_id is null;

-- expect 0 (no unowned published row may already have an owner)
select count(*) from public.apartments
 where status='active' and moderation_status='approved'
   and listing_workflow_status='published' and landlord_id is not null;
```

## 4 · Apply

```bash
# from the repository root, on the exact merged SHA
supabase link --project-ref zkwcbyxiwklihegjhuql
supabase db push --include-all --dry-run   # confirm exactly the three SAN-1349 migrations
supabase db push --include-all
```

The three migrations are ordered and must be applied in order:

```text
20260927200924_san1349_enforce_owner_boundary.sql     # NOT VALID CHECK + RPC + showings policies
20260927200925_san1349_remediate_ownerless_supply.sql # pauses the 44; raises if any survive
20260927200926_san1349_validate_owner_boundary.sql    # VALIDATE CONSTRAINT
```

Migration 2 raises `SAN-1349 remediation incomplete` and migration 3 raises
`SAN-1349: refusing to validate …` rather than let an unproven invariant through.

## 5 · Post-flight (all must hold)

```sql
-- 1. zero violations
select count(*) from public.apartments
 where status='active' and moderation_status='approved'
   and listing_workflow_status='published' and landlord_id is null;      -- expect 0

-- 2. constraint validated
select convalidated from pg_constraint
 where conrelid='public.apartments'::regclass
   and conname='apartments_owner_required_when_published';               -- expect true

-- 3. exactly 44 rows carry the remediation audit stamp
select count(*) from public.apartments
 where metadata ? 'san1349_ownerless_remediation';                       -- expect 44

-- 4. new violating write is refused
insert into public.apartments
  (title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
values ('probe','san1349-probe','Laureles','active','approved','published',null);
-- expect: ERROR 23514 ... apartments_owner_required_when_published

-- 5. deployed RPC carries the ownership predicate
select position('landlord_id' in pg_get_functiondef(p.oid)) > 0,
       position('moderation_status' in pg_get_functiondef(p.oid)) > 0,
       position('listing_workflow_status' in pg_get_functiondef(p.oid)) > 0
  from pg_proc p where p.oid = to_regprocedure(
    'public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)');
-- expect: true, true, true

-- 6. legacy host_id no longer authorizes a broker on showings
select policyname, position('host_id' in qual) > 0 as has_host_id
  from pg_policies
 where schemaname='public' and tablename='showings'
   and policyname in ('showings_select_visible','showings_update_visible');
-- expect: false, false

-- 7. historical orphans preserved (not reassigned)
select count(*) from public.leads l join public.apartments a on a.id=l.apartment_id
 where a.landlord_id is null;                                            -- expect 5
select count(*) from public.showings s join public.apartments a on a.id=s.apartment_id
 where a.landlord_id is null;                                            -- expect 4
```

Then re-run the Supabase Security Advisor and confirm **no new** SAN-1349-related regression
(`acting_landlord_ids()` is pre-existing debt, tracked separately, per the issue's P2 row).

## 6 · Rollback

A full revert is a **task-level** operation, not a routine one. Order matters: the restored rows
are ownerless **and** published, so `apartments_owner_required_when_published` would reject the
`UPDATE` with `23514` if it were still in place. Drop the constraint first.

```sql
-- 1. Drop the invariant FIRST. Restoring the rows below necessarily recreates ownerless
--    active + approved + published listings, which the validated CHECK forbids by design.
alter table public.apartments drop constraint apartments_owner_required_when_published;

-- 2. Restore every column the remediation changed, from the stamp it wrote.
--    `from_paused_at` may be JSON null, which casts back to SQL NULL — the pre-remediation value.
update public.apartments
   set status                  = metadata->'san1349_ownerless_remediation'->>'from_status',
       moderation_status       = metadata->'san1349_ownerless_remediation'->>'from_moderation_status',
       listing_workflow_status = metadata->'san1349_ownerless_remediation'->>'from_listing_workflow_status',
       paused_at               = (metadata->'san1349_ownerless_remediation'->>'from_paused_at')::timestamptz,
       metadata                = metadata - 'san1349_ownerless_remediation'
 where metadata ? 'san1349_ownerless_remediation';

-- 3. Confirm the revert is complete.
select count(*) from public.apartments
 where metadata ? 'san1349_ownerless_remediation';                        -- expect 0
select count(*) from public.apartments
 where status = 'active' and moderation_status = 'approved'
   and listing_workflow_status = 'published' and landlord_id is null;     -- expect 44 restored
```

Leads, showings and `apartments.landlord_id` are never modified by the remediation, so nothing
else needs restoring. Rows the migration did not touch are unaffected by all three statements.

The migration chain cannot be re-applied after the constraint drop without also re-running the
remediation, so treat this as a task-level revert, not a per-incident rollback. If only the pause
needs undoing for one listing, use the existing FSM (`paused → published`) after giving it a real
`landlord_id` — that is the supported path and it keeps the invariant intact.

## 7 · Local proof already captured (applies to the exact same SQL)

| Evidence | File |
|---|---|
| RED before the migration — 11/32 SAN-1349 assertions fail on the three defects | `01-red-pgtap-before-migration.txt` |
| Replay proof: 44 violations inserted, chain applied in order, 0 remain, constraint validated, new violation refused, 5 leads + 4 showings preserved, 10 non-violating demo rows untouched | `02-replay-01-dirty-state.txt`, `02-replay-02-migrations.txt`, `02-replay-03-post-state.txt` |
| Reproducible replay script | `replay-san1349-chain.sh` |
| GREEN full pgTAP suite (`san1349` ok, `san1054` ok, `san1286` ok) | `03-green-pgtap-full-suite.txt`, `11-green-pgtap-final.txt` |
| Residual pgTAP failures proven pre-existing on a pre-migration baseline DB | `04-baseline-vs-post-migration.txt` |
| `supabase db lint` — exit 0, no findings on the changed RPC | `05-db-lint.txt` |
| `npm test` — 272 files / 1645 tests green | `06-vitest.txt` |
| Floor gates (see notes for the two environmental gates) | `07-floor.txt`, `08-floor-remaining-gates.txt` |
| Playwright outcomes + proof the failure is a pre-existing 401 | `09-playwright-rental.txt`, `10-playwright-baseline-probe.txt` |
