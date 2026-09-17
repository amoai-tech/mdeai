# Baseline Replay Audit — 2026-09-17

**Owner task:** Task 48.2H.1 · MDE-SB-001 · **Mandate:** the user's Step 6 — *"If `MIGRATIONS_FAILED` … exists, make repairing that baseline part of Task 48.2H.1 before relying on preview branches."*

## Verdict

| | Before | After |
|---|---|---|
| `supabase db reset` from zero | ❌ **FAILED at migration 84 of 109** (`SQLSTATE 42883`) | ✅ **109/109, 0 errors** |
| Root cause | Two revoke migrations referencing objects with no `CREATE` in Git | **Fixed** by guarding them (§5) |
| Remaining | — | ⚠️ a fresh replay still yields an **incomplete** schema: **92 tables vs production's 132** (§6) |

**This was the root cause of the preview-branch `MIGRATIONS_FAILED` state**, and it hard-blocked Gate 1 of SB-010.

**The blocker was exactly one migration pair** — not a systemic replay failure. That is good news: the other 107 migrations, **including the 8 renamed and 2 recovered in this task, replay cleanly from zero.**

---

## 1. Method

Throwaway workdirs (`/tmp/sb-verify*`), repo untouched, ports shifted into the 544xx/545xx/546xx ranges so the host's other local Supabase stack on 54322 was never disturbed, `project_id` overridden, empty `seed.sql` added to satisfy `[db.seed]`:

```bash
cp -r supabase /tmp/sb-verify3/supabase   # + project_id / port overrides
supabase db start && supabase db reset
```

The container started cleanly every time. The failures were in the migrations, not the environment.

## 2. Original failure

```
Applying migration 20260606114106_revoke_anon_security_definer_rpcs.sql...
Stopping containers...
ERROR: function public.outbox_enqueue(text, text, text, jsonb, uuid) does not exist (SQLSTATE 42883)
At statement: 0
```

83 migrations applied; the 84th failed. `20260606114224` (the next one) references the same objects.

## 3. Why it happened

`outbox_enqueue` **is never created by any migration in the repository.** Its only two appearances are the two REVOKE statements. Both revoke migrations target functions that exist in production but have no `CREATE` in Git.

Proven by isolating the pair: with **only** those two migrations neutralised, the replay completed **109/109** — so nothing else in the migration set depends on the missing objects, and no other ordering defect exists.

## 4. Live-only objects (separate, non-blocking provenance gap)

Systematic scan, quote-tolerant (the initial dump uses `"public"."name"`):

| Object class | Live | No `CREATE` in repo | Assessment |
|---|---|---|---|
| App-owned functions | 107 | **41** | ❌ genuine gap |
| `public` tables | 132 | 41 | split ↓ |
| — `mastra_*` tables | 32 | 32 | ✅ **by design** — `@mastra/pg` via `getMastraStorage()` auto-provisions its own store |
| — `spatial_ref_sys` | 1 | 1 | ✅ **by design** — created by PostGIS |
| — **real MDE tables** | **8** | **8** | ❌ genuine gap |

**8 real MDE tables with no `CREATE` in Git** — each verified live with RLS enabled, policies and FKs:

| Table | RLS | Policies | FKs |
|---|---|---|---|
| `outbox` | ✅ | 2 | 7 |
| `event_stakeholders` | ✅ | 4 | 3 |
| `event_vendors` | ✅ | 4 | 1 |
| `event_promo_codes` | ✅ | 2 | 3 |
| `event_order_refunds` | ✅ | 2 | 2 |
| `suppression_list` | ✅ | 3 | 0 |
| `event_attendee_profiles` | ✅ | 1 | 1 |
| `delivery_receipts` | ✅ | 1 | 0 |

**Function-gap note (corrected after PR review).** The first-pass name scan reported 41 functions with no `CREATE` in Git, but that classifier produced false positives and must not be used as the canonical SB-002 count. In particular:

* `partner_ids_for_user()` and `partner_organization_ids_for_user()` are created in `20260606130400_ptr005_partner_scoping.sql`.
* `partner_is_active()` is created in the venue-offerings migration (renamed in this PR to `20260610021146_san492_event_venue_offerings.sql`).
* `bookings_validate_event_resource()` is also created in that venue-offerings migration before the recovered EXECUTE-revoke migration runs.

Therefore these functions are **not missing baselines** and do **not** block SB-003/SB-006 for that reason. SB-002 owns the exact production-vs-replay function inventory and must classify each remaining candidate by full signature, not loose name matching.

The broader finding still stands: production contains behavior not fully reproduced by a fresh replay, similar to the 35 live-only Edge Functions. The exact function count is intentionally deferred to the corrected SB-002 inventory.

## 5. Fix applied — guarded the two revoke migrations

Both migrations now revoke inside a `DO` block that checks `to_regprocedure(...) is not null` first, preserving every original signature and the `record_check_in → anon only` asymmetry.

* **Idempotent and replay-safe.**
* **A no-op on production**, where every object exists — behaviour is unchanged.
* Original security rationale comments kept verbatim; the fix and its evidence are cited inline.
* **No already-applied migration was deleted or reordered** — the failure was *inside* those two files, so the guard had to live there.

### Verification (fresh workdir, real repo content)

```
start=0
reset=0
Applying migration ... (109)
ERROR lines: 0
Finished supabase db reset on branch main.
```

Plus a functional check that the guard did not over-revoke:

```
anon can exec is_admin: t        # RLS helper correctly retains EXECUTE
```

## 6. Remaining gap — a fresh replay is still incomplete

| | Production | Fresh replay | Delta |
|---|---|---|---|
| `public` tables | 132 | **92** | 40 = 32 `mastra_*` (by design) + **8 genuine** |
| `public` functions | 1,000 | 850 | delta includes extension-version differences plus application function gaps; exact app-owned gap requires SB-002 signature-based classification |
| Migration ledger | 108 | 109 | see [`migration-drift.md`](./migration-drift.md) |

A local environment built from Git today is **missing 8 application tables plus a still-to-be-corrected set of application functions**. The earlier 41-function name-based count included false positives, so SB-002 must reclassify by exact function signature and dependency before authoring any catch-up migration. This gap is **not** what was blocking replay.

## 7. Recommended follow-up (not yet done — needs approval)

1. **SB-002: classify the 8 missing tables and exact application-function gap by full signature/dependency, then recover only objects proven migration-owned and intentionally present in production.** Do not treat the earlier 41-function name scan as authoritative.
2. **Recover the 35 live-only Edge Functions** (`supabase functions download`) in the same wave — SB-008.
3. **Fix `[db.seed]`**: `enabled = true` points at `./seed.sql`, which does not exist. Add the file or set `enabled = false` in the Gate-1 PR.
4. **Wire the replay gate** in SB-010 Gate 1 now that replay is green.

## 8. Reproduce

```bash
rm -rf /tmp/sb-verify && mkdir -p /tmp/sb-verify && cp -r supabase /tmp/sb-verify/supabase
cd /tmp/sb-verify
sed -i 's/^project_id = "mdeapp"/project_id = "mdeapp-verify"/' supabase/config.toml
for n in 54320 54321 54322 54323 54324 54325 54326 54327 54328 54329; do sed -i "s/\b${n}\b/$((n+100))/g" supabase/config.toml; done
touch supabase/seed.sql
supabase db start && supabase db reset
```

**Environment notes**
* The CLI requires `~/.supabase/profile` (default content `supabase`). It was absent on this machine, making every `supabase db` command fail with `NotFound: FileSystem.readFile (/home/sk/.supabase/profile)`. Created it to run this audit.
* A local Supabase stack from another project holds port **54322**. Shift ports (as above) or `supabase stop` that project before running the repo's own stack.
