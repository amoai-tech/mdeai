# Supabase — mdeai (`zkwcbyxiwklihegjhuql`)

Canonical SQL migrations and Edge Functions for the app. Legacy `/home/sk/mde/supabase/` is frozen for new work (P0 security fixes only).

> **Plan tier: Supabase Free until production.** Preview branching, PITR, downloadable backups and leaked-password protection are **not available on Free**. The local Supabase stack + CI is the rehearsal and verification environment. Re-evaluate at the production upgrade.
> See [`../docs/02-architecture/schema-ownership.md`](../docs/02-architecture/schema-ownership.md) for the full plan-tier and inventory record.

## Migrations

**109 files** in `migrations/`. Live ledger: **109 rows — fully MATCHED** (0 local-only, 0 remote-only). Divergence history and the exact reconciliation are recorded in [`../docs/02-architecture/migration-drift.md`](../docs/02-architecture/migration-drift.md).

```bash
cd /home/sk/mdeai
supabase migration list   # expect 109/109 Local | Remote
```

**Current state (2026-09-17):** reconciliation **complete**. `supabase migration list` reports **109/109 MATCHED**.

The last step was recording `20260611160000_veb_mvp_004_bookings_idempotency`, whose database effect was already live (verified: `bookings.idempotency_key` exists and `idx_bookings_idempotency_user` exists with an identical definition) but which had no ledger row:

```bash
supabase migration repair --status applied 20260611160000   # done 2026-09-17
```

**The hard gate is satisfied** — later epic tasks may now push migrations.

⚠️ **Replay is green but the fresh schema is incomplete.** `supabase db reset` from zero now succeeds 109/109, but a rebuilt database is missing **8 application tables** (`outbox`, `event_stakeholders`, `event_vendors`, `event_promo_codes`, `event_order_refunds`, `suppression_list`, `event_attendee_profiles`, `delivery_receipts`) and **41 functions** that exist only in production — the same "live-only" gap as the 35 live-only Edge Functions. Three of those functions are RLS helpers, so this blocks SB-003 and SB-006. See [`../docs/02-architecture/snapshots/baseline-replay-audit-2026-09-17.md`](../docs/02-architecture/snapshots/baseline-replay-audit-2026-09-17.md).

Also note `[db.seed] enabled = true` points at `./seed.sql`, which does not exist — a fresh `db reset` needs that file created or the flag turned off.

**Not on remote (archived):** `migrations/_archive-not-on-remote/` — 2 legacy-only SQL files; do not push. Correctly ignored by `scripts/check-migration-timestamps.mjs`.

**New DDL:** add `migrations/<timestamp>_<name>.sql` here only. Never edit or delete an applied migration — including `20260628050558_fashionos_lead_finder_mvp_namespaced`, which is retained as the provenance record for SB-002's compensating drop migration.

## Seeds

**Source JSON/CSV:** `seeds/venues/` — curated packs for DATA-003/005/035/006.

**Applied seed SQL:** only in `migrations/` (e.g. `20260530003708_data005_*`).

Regenerate via `scripts/seed-*-anchors.mjs` → write directly to a new migration file. See [`seeds/README.md`](seeds/README.md).

## Edge Functions

**39 ACTIVE deployments vs 4 directories in this repo** → 4 `MATCHED`, **35 `UNKNOWN-PRESERVE`**.

⚠️ **The 35 unmatched functions are load-bearing.** `pg_cron` job 2 calls `/functions/v1/lead-reminder-tick` every 5 minutes using a `vault` secret, and that function has no source here. **Do not delete a live function because it looks unmatched.**

Recover source with `supabase functions download <slug>` **before** any rewrite or retirement. Full reconciliation matrix: [`../docs/02-architecture/edge-functions.md`](../docs/02-architecture/edge-functions.md).

Shared helpers live in `functions/_shared/`. `_shared/http.ts` currently accepts any `https://*.vercel.app` origin and gates production on an `ENVIRONMENT` variable that appears nowhere else in the repo — treat the CORS gate as fail-open until SB-008 fixes it.
