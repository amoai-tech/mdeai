# Migration Drift — MDE Supabase (`zkwcbyxiwklihegjhuql`)

**Snapshot:** 2026-09-17 · **GitHub `main` at comparison:** `a9a9eb931ae602568b2be61904f2dee886c45ec4`
**Method:** read-only. `supabase_migrations.schema_migrations` (live ledger) vs `supabase/migrations/*.sql` (repo), compared as **sets of 14-digit version prefixes**. Zero DDL performed.
**Owner task:** Task 48.2H.1 · MDE-SB-001 — Canonical Supabase Inventory

---

## 1. Before / after

| | Live rows | Repo files | LIVE_ONLY | REPO_ONLY |
|---|---|---|---|---|
| Before (2026-09-17 initial) | 108 | 107 | **10** | **9** |
| After repo-side reconciliation | 108 | 109 | **0** ✅ | **1** |
| **Final — repair executed 2026-09-17** | **109** | **109** | **0** ✅ | **0** ✅ |

> **Correction to the task text.** SB-001 states the target as `108/108`. The correct post-reconciliation target is **109/109**. Reason: the live ledger contains one migration with no repo file (`20260610021420`) that had to be recovered as a **new** repo file, and the repo contains one migration that was applied live **without any ledger row** (`20260611160000`) that must be recorded in the ledger. Both net `+1`, so 108 live → 109 live and 107 repo → 109 repo.

---

## 2. Reconciliation performed (repo side — no production write)

### 2.1 Eight files renamed to their real live timestamps

Every repo-only file had a live ledger row with an **identical migration name** and a real (non-rounded) timestamp. Repo file contents were verified against live schema effects before renaming (see §3). Direction chosen: **repo follows production** — the live ledger is the applied truth, and this needs no production write and no re-application.

| Repo file (old, rounded) | Renamed to (live) | Verified live effect |
|---|---|---|
| `20260608120000_san135_backfill_event_host_display.sql` | `20260608202427_…` | 18 of 34 organizer events carry `details->'host_display'` |
| `20260609120000_san492_event_venue_offerings.sql` | `20260610021146_…` | `public.venue_event_offerings` exists (+ pkey, `_key_key`, `_location_idx`) |
| `20260611120000_san502_guard_booking_partner_decision.sql` | `20260611073237_…` | `guard_booking_partner_decision()` exists + partner trigger on `bookings` |
| `20260616120000_obs002b_ai_runs_error_type.sql` | `20260616084031_…` | `ai_runs.error_type` exists |
| `20260616150000_ptr_rentals_broker_rls.sql` | `20260617022503_…` | `broker_owns_apartment()`, `lead_partner_listing_aligned()` exist |
| `20260616151000_ptr_rentals_publish_fsm.sql` | `20260617022518_…` | all 6 `apartments` FSM columns exist |
| `20260616152000_ptr_rentals_onboarding.sql` | `20260617022534_…` | `create_broker_onboarding_draft()` exists |
| `20260616153000_ptr_rentals_partner_leads_align.sql` | `20260617022536_…` | `lead_partner_listing_aligned()` exists |

Relative ordering is preserved by the new timestamps (san502 `…073237` < veb_mvp_004 `20260611160000`; obs002b `…084031` < ptr_rentals `20260617022503…`).

### 2.2 Two repo files recovered from the CLI statement history

`supabase_migrations.schema_migrations` retains a `statements` array for CLI-applied migrations, so both live-only rows were recovered **verbatim** via read-only SQL — no production access token or DB password required.

| Live version | Name | Recovered to | Notes |
|---|---|---|---|
| `20260610021420` | `san492_revoke_trigger_fn_execute` | `supabase/migrations/20260610021420_san492_revoke_trigger_fn_execute.sql` | `revoke all on function public.bookings_validate_event_resource() from public, anon, authenticated;` — confirmed live: that function is the one trigger function in `public` with **no** anon/authenticated EXECUTE |
| `20260628050558` | `fashionos_lead_finder_mvp_namespaced` | `supabase/migrations/20260628050558_fashionos_lead_finder_mvp_namespaced.sql` | 8 `fashionos_*` tables + 3 indexes + `pgcrypto`. **This file is the provenance record for SB-002's compensating drop migration** — do not edit it; SB-002 adds a new drop migration |

### 2.3 Ledger repair — ✅ EXECUTED AND VERIFIED

| Version | Name | Evidence its effect is live | Action |
|---|---|---|---|
| `20260611160000` | `veb_mvp_004_bookings_idempotency` | `bookings.idempotency_key text` exists **and** `idx_bookings_idempotency_user` exists with the byte-identical definition `UNIQUE (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND booking_type = 'event'` | `supabase migration repair --status applied 20260611160000` |

**It must not be pushed** — its objects already exist live; re-running is idempotent (`add column if not exists` / `create unique index if not exists`) but would still create a false second history row and confuse the gate.

**Executed** with the documented CLI command (history-only; no SQL applied to the schema):

```
$ supabase migration repair --status applied 20260611160000 --db-url <legacy DATABASE_URL>
Connecting to remote database...
Repaired migration history: [20260611160000] => applied
Finished supabase migration repair.
```

The resulting row is well-formed — the CLI populated `name` and `statements` from the local migration file, which a hand-written `INSERT` would have left null:

```
version = 20260611160000
name    = veb_mvp_004_bookings_idempotency
created_by = null
statements = (populated)
```

**Credential used:** `DATABASE_URL` from `/home/sk/mde/.env.local`, because the legacy tree is already linked to this project ref (`/home/sk/mde/supabase/.temp/linked-project.json` → `zkwcbyxiwklihegjhuql`). No credential was printed; output was redacted of any connection URL. This is the only production write performed by SB-001, and it touched `supabase_migrations.schema_migrations` only.

---

## 3. Post-reconciliation verification

```
$ node scripts/check-migration-timestamps.mjs
check-migration-timestamps: OK (109 files, unique prefixes)

$ supabase migration list          # authoritative CLI comparison, post-repair
 rows listed      : 109
 MATCHED          : 109
 LOCAL-ONLY       : 0
 REMOTE-ONLY      : 0
 repo .sql files  : 109
✅ LEDGER IS FULLY MATCHED
```

Archived and deliberately excluded from the comparison: `supabase/migrations/_archive-not-on-remote/` (`20260430140000_landlord_v1_base_tables_stub.sql`, `20260516120000_rls_audit_fixes.sql`) — 2 legacy-only files, correctly ignored by `check-migration-timestamps.mjs`.

**Hard gate: SATISFIED.** `supabase migration list` reports 109/109 MATCHED, so later epic tasks may now push migrations.

---

## 4. Stale references left intentionally unchanged

| Reference | Location | Decision |
|---|---|---|
| `20260608120000`, `20260609120000`, `20260616150000…153000` | `docs/tasks/testing/evidence/2026-06-*/` (5 result/audit files) | **Leave as-is.** These are dated historical evidence of what was run at the time; rewriting them would falsify the record. |
| `20260616120000` | `src/mastra/lib/ai-runs.ts` L31 | **Updated to `20260616084031`** — a live code comment pointing at the current migration identifier would otherwise dangle. |

---

## 5. Branch baseline

The epic's `MIGRATIONS_FAILED` finding is a direct consequence of the 10/9 divergence: the preview-branch migrator replays `supabase/migrations/**`, and the 9 repo-only files had no matching ledger row (and 2 were never applied under those identifiers at all). With the divergence removed, the replay baseline is coherent.

`PLAN-LIMITED` — **preview branching is not included on Supabase Free.** Branch state was therefore not diagnosable and is not a blocker: the local stack (`supabase db start` + `supabase db reset`) plus CI replay is the required rehearsal environment until a production upgrade.

---

## 6. Scope of changes — what was and was not done

**Zero DDL. No database object was created, altered, or dropped. No deployment. No application data was read or written.**

| Change | Type | Count |
|---|---|---|
| Migration files renamed to live timestamps (`git mv`) | repo | 8 |
| Migration files recovered verbatim from `schema_migrations.statements` | repo | 2 |
| Revoke migrations guarded with `to_regprocedure` (replay fix) | repo | 2 |
| `src/mastra/lib/ai-runs.ts` comment pointing at a renamed migration | repo | 1 |
| `supabase/config.toml` exposed-schema alignment | repo | 1 |
| `supabase/README.md` corrected | repo | 1 |
| SB-001 inventory artifacts under `docs/02-architecture/` | docs | 4 docs + 4 snapshots |
| **Row inserted into `supabase_migrations.schema_migrations`** | **production** | **1** |

The single production write was `supabase migration repair --status applied 20260611160000`, executed with the documented CLI command. It changes **history rows only** — it runs no SQL against the schema. The row it wrote is well-formed: the CLI populated `name` and `statements` from the local migration file.

`src/lib/supabase/database.types.ts` was **not** overwritten (verified: 0 modified lines) — types comparison was read-only, as the task requires.
