# Generated-Types Drift Evidence — 2026-09-17

**Owner task:** Task 48.2H.1 · MDE-SB-001 · **Target:** `src/lib/supabase/database.types.ts` (282,963 bytes)
**Method:** read-only structural comparison. Live `.` from Supabase MCP SQL; committed types parsed with a depth-aware reader of the `public.Tables` / `public.Views` / `public.Functions` blocks.
**Constraint:** `supabase gen types typescript --linked` requires a linked project (unavailable), and `--local` requires the local stack. This is therefore a **structural proxy**, not the authoritative regeneration — see §4 for the exact gate command.

---

## 1. Tables — drift is exactly the 8 `fashionos_*` tables

| Side | Count |
|---|---|
| Live `public` base tables | **132** |
| Committed types `public.Tables` | **124** |
| Difference | **8** |

**In live, missing from types (8):** `fashionos_activity_log`, `fashionos_companies`, `fashionos_lead_events`, `fashionos_leads`, `fashionos_outreach_drafts`, `fashionos_people`, `fashionos_sources`, `fashionos_workflow_runs`

**In types, not live:** *(none)*

→ The committed types are a strict **subset**: they are simply 8 tables behind, and every one of those 8 is a foreign FashionOS table that **SB-002 deletes**. Removing them brings live to 124 tables = the committed types.

**Consequence: SB-002 fixes this drift as a side effect.** No types regeneration is strictly required for the table surface once SB-002 lands. Record it in SB-002's evidence.

**Views:** live 4, types 4 ✅ in sync.

---

## 2. Functions — the apparent 332-vs-1000 gap is an artefact, not drift

| Side | Count |
|---|---|
| Live `public` functions (all) | **1,000** |
| — extension-owned (`pg_trgm` 31, `postgis` 744, `vector` 118) | **893** |
| — app-owned | **107** |
| Committed types `public.Functions` | **332** |

Comparing the 107 app-owned live functions against the committed types after removing extension-owned names leaves **37 differences — and all 37 return `trigger`**:

```
total_missing_from_types   = 37
returns_trigger            = 37
non_trigger_fns            = null   ← zero non-trigger functions
```

The 37 are `set_updated_at`, `update_updated_at`, `update_updated_at_column`, `touch_updated_at`, `touch_embedding_updated_at`, `trigger_set_timestamps`, `compute_lead_score`, `enqueue_embedding_job`, `fn_apply_approval_decision`, `fn_audit_agent_approval`, `fn_audit_agent_run`, `fn_audit_outbox`, `fn_outbox_set_updated_at`, `fn_outbox_suppression_check`, `guard_booking_partner_decision`, `handle_new_user`, `trigger_ai_embed`, `update_conversation_on_message`, `events_sync_legacy_is_active`, `update_collection_count`, `update_conversation_stats`, `generate_confirmation_code`, `auto_create_landlord_inbox_from_message`, `bookings_validate_event_resource`, `broadcast_*` ×7, `realtime_broadcast_*` ×4.

**The type generator legitimately excludes `RETURNS trigger` functions** — they cannot be PostgREST RPCs. So the app-owned **RPC surface is in sync**; the apparent shortfall is expected behaviour, not staleness. The remaining 332-vs-107 gap is extension-owned SQL functions that the generator emits but that are not app-owned.

---

## 3. Conclusion

| Surface | Drift |
|---|---|
| `public` tables | **8 tables** — all `fashionos_*`, all deleted by SB-002 |
| `public` views | none ✅ |
| app-owned RPC functions | none ✅ |
| trigger functions absent from types | **expected** — 37, all `RETURNS trigger` |

**`database.types.ts` is in effective sync** apart from the FashionOS cluster. Nothing in the epic blocks on types drift.

---

## 4. ⚠️ Trap for SB-010 Gate 1 — do not build a counting gate

A naive "types match" gate that compares function counts, or that diffs the generated output against a stale committed file, will **fail permanently and falsely** because:

1. **37 `RETURNS trigger` functions** exist in `public` and are excluded by the generator by design.
2. **893 extension-owned functions** (`postgis`, `vector`, `pg_trgm` — all installed in `public`) are generator-dependent: their count changes with extension version. Note the 2026-07-22 upstream deprecation of extension version pinning, ignored from 2026-08-05.
3. `spatial_ref_sys` and the extension objects inflate every count.

**Required gate behaviour (SB-010):** regenerate into a temp file and compare **the generated file**, never counts of catalog objects:

```bash
supabase gen types typescript --local > /tmp/schema.gen.ts
git diff --ignore-space-at-eol --exit-code --quiet /tmp/schema.gen.ts src/lib/supabase/database.types.ts \
  || { echo "generated types drift"; exit 1; }
```

If a legitimate regeneration produces a large one-time diff because the committed file predates an extension install, land that regenerated file as a **single deliberate commit** so the gate has a true baseline — do not weaken the gate to accommodate it.

**Baseline note:** the committed file already contains PostGIS SQL functions and no `fashionos_*` tables, so it was generated after PostGIS was installed in `public` and before the FashionOS migration (`20260628050558`). That is consistent with §1 and §2.

---

## 5. Registry caveat (also relevant to the gate)

`config.toml` sets `[db.seed] enabled = true` with `sql_paths = ["./seed.sql"]`, but **`supabase/seed.sql` does not exist**. A fresh `supabase db reset` in CI may therefore fail or warn on a missing seed file. Either add the seed file or set `enabled = false` in the same PR that introduces the replay gate (SB-010 Gate 1).
