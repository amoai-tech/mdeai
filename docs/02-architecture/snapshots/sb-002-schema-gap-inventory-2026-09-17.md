# SB-002 · Production → Migration Gap Inventory

**Date:** 2026-09-17 · **Project:** `zkwcbyxiwklihegjhuql` (medellin) · **Main at analysis:** `a9a9eb93`
**Method:** read-only. Production via Supabase MCP; fresh replay via a disposable local stack (dedicated ports). No production mutation.
**Status:** ✅ corrected after external review · 🔴 **catch-up migration NOT authored — see §7.**

---

## 0. Correction register (v3 — supersedes v1 and v2)

**v2 correction — the `partner_*` classification.** An external review (Codacy on PR #53) challenged it. On re-verification **the review was right and v1 of this document was wrong.**

**Root cause of the error:** the comparison grep was case-sensitive — `grep -rlE "CREATE( OR REPLACE)? FUNCTION …"`. Migrations that write lowercase `create or replace function` were therefore invisible to the scan.

**Impact: 9 false positives. The true missing-function count is 32, not 41.**

**v3 correction — the reason the `hybrid_search_*` functions block the migration.** A second review round challenged the claim that `LANGUAGE sql` bodies are validated at `CREATE` time. That claim is **wrong as stated** — it depends on the body *form* and on `check_function_bodies`, not on the language. Verified against the live catalog and a controlled probe; the deferral still stands, for a different and now-documented reason. See §5.2.

**v3 correction — the fourth `marketing` dependency** was reported as a count without naming it. It is `fn_update_conversation_intent`. The count "4" was right; the enumeration was incomplete. See §5.1.

| Falsely reported missing | Actually created by |
|---|---|
| `partner_ids_for_user` | `20260606130400_ptr005_partner_rls_helpers_and_member_policies.sql` |
| `partner_organization_ids_for_user` | `20260606130400_ptr005_partner_rls_helpers_and_member_policies.sql` |
| `partner_is_active` | `20260610021146_san492_event_venue_offerings.sql` |
| `bookings_validate_event_resource` | `20260610021146_san492_event_venue_offerings.sql` |
| `guard_booking_partner_decision` | `20260611073237_san502_guard_booking_partner_decision.sql` |
| `semantic_search_events` | `20260509205216_pgvector_semantic_search.sql` |
| `semantic_search_listings` | `20260509205216_pgvector_semantic_search.sql` |
| `semantic_search_restaurants` | `20260509205216_pgvector_semantic_search.sql` |
| `touch_embedding_updated_at` | `20260509205216_pgvector_semantic_search.sql` |

**Retracted claims:**
1. ❌ *"Three of the missing functions are RLS helpers … so this gap blocks SB-003's helper relocation and SB-006's `partner_*` RLS work."* — **RETRACTED.** All three helpers are migration-owned and present in a fresh replay. **SB-003 and SB-006 are NOT blocked on recovering them.**
2. ❌ *"`hybrid_search_*`/`semantic_search_*` … the migration would fail to apply."* — narrowed: only the **3 `hybrid_search_*`** reference `fts_content`. `semantic_search_*` use embeddings and are already in the repo.
3. ❌ *"4 dead functions"* — corrected to **7** (§6).
4. ❌ *"`LANGUAGE sql` bodies are validated at `CREATE` time."* — **wrong as a general rule.** `hybrid_search_*` use the string-constant body form (`prosqlbody IS NULL`, no `BEGIN ATOMIC`), which PostgreSQL parses at *execution* time. The migration nevertheless fails at apply because **`check_function_bodies` is `on`** (its default, and this project's setting). With that GUC `off`, creation succeeds and the failure moves to first invocation. Conclusion unchanged; reasoning corrected in §5.2.
5. ❌ *"4 OpenClaw functions depend on `marketing`"* stated as a bare count — the fourth is `fn_update_conversation_intent`, now named in §1 and §5.1.

The 8-table finding is **unaffected** — it was verified with `grep -qi` (case-insensitive) and cross-checked against live/replay catalogues.

---

## 1. Headline

The gap is **not** "8 tables + 41 functions". Three findings change what a catch-up migration can safely contain:

| Finding | Consequence |
|---|---|
| **5 objects are missing from BOTH production and a fresh replay** | Their dependent functions are **already broken in production**. Recreating the tables would invent schema that was deliberately dropped. |
| The **entire `marketing` schema (12 tables) is live-only** | 4 OpenClaw functions depend on it — `fn_insert_conversation`, `fn_upsert_delivery_log`, `fn_update_conversation_intent`, `fn_record_conversion`. Never created in Git. |
| The **`fts_content` columns + GIN indexes are live-only** | The 3 `hybrid_search_*` reference them. `check_function_bodies = on` on this project, so the body is validated at `CREATE` and they cannot be created until the columns exist — see §5.2. |

---

## 2. Classification (A–E)

| Class | Meaning | Count |
|---|---|---|
| **A** | Migration-owned and missing from replay | **8 tables**, **32 functions** (7 of which are dead — §6) |
| **B** | Mastra runtime-auto-provisioned (`@mastra/pg` via `getMastraStorage()`) | **32 tables** — not a gap |
| **C** | Extension-owned | `spatial_ref_sys` + PostGIS/vector/pg_trgm objects — not a gap |
| **D** | Supabase platform/system-owned | `auth`, `storage`, `realtime`, `net`, `cron`, `vault` — not a gap |
| **E** | **Unknown / newly discovered — preserve & investigate** | `marketing` schema + 12 tables; `fts_content` columns + GIN indexes on 3 tables; the 5 dropped-everywhere objects |

Category was **not** inferred from object name. This audit itself proved why: `email_outbox`/`wa_outbox` falsely match `outbox`; `agent_audit_log` reads as an MDE table but is absent from production; and the case-sensitivity error above came from a name-based text scan.

---

## 3. Class A — the 8 genuinely live-only MDE tables

Every one is a real application table: RLS enabled (not forced), PK, ACL granted to `anon`/`authenticated`/`service_role` (platform default pattern), and **not** in any realtime publication.

| Table | Cols | PK | FKs | Unique | Check | Indexes | Policies | Triggers |
|---|---|---|---|---|---|---|---|---|
| `outbox` | 15 | `id` | `approval_id → approval_requests` | `(channel, idempotency_key)` | channel, status | 5 | 2 | **3** |
| `event_stakeholders` | 15 | `id` | `event_id → events`, `user_id`/`invited_by → auth.users` | `(event_id,email,role)` | role | 5 | 4 | 1 |
| `event_vendors` | 18 | `id` | `event_id → events` | — | service_type, payment_status, amounts | 4 | 4 | 1 |
| `event_promo_codes` | 14 | `id` | `event_id → events`, `created_by → auth.users` | `(event_id, code)` | discount_type, value, max_usages, window | 4 | 2 | 1 |
| `event_order_refunds` | 13 | `id` | `order_id → event_orders`, `initiated_by → auth.users` | `stripe_refund_id` | amount, status, reason, initiated_via | 5 | 2 | 0 |
| `suppression_list` | 8 | `id` | — | `(channel, identifier)` | channel, reason | 3 | 3 | 0 |
| `event_attendee_profiles` | 13 | `attendee_id` | `attendee_id → event_attendees` | — | dietary_preference, shirt_size | 3 | 1 | 1 |
| `delivery_receipts` | 8 | `id` | — | — | outbox_table ∈ {posts_outbox, wa_outbox, email_outbox} | 3 | 1 | 0 |

**Origin evidence:** none is created by any migration. Other migrations treat `outbox` as *optional* — `20260503130000_out_of_band_orphan_tables.sql` guards with `to_regclass('public.outbox') IS NOT NULL` before adding the FK. That is why the 109/109 replay succeeds without them.

**Verdict: all 8 are `REQUIRED_MIGRATION`**, with two caveats:
* `delivery_receipts.outbox_table` CHECK references `posts_outbox`, absent from both environments.
* `outbox`'s triggers are broken (§6).

---

## 4. Class A — the 32 truly missing functions

Verified with **case-insensitive** matching against every migration, then each hit manually reviewed.

**Group 1 — outbox / approval pipeline (10):** `outbox_enqueue`, `outbox_claim`, `outbox_mark_failed`, `outbox_mark_sent`, `request_approval`, `decide_approval`, `fn_outbox_set_updated_at`, `fn_outbox_suppression_check`, `fn_audit_outbox`, `fn_record_conversion`

**Group 2 — search / vector (3):** `hybrid_search_events`, `hybrid_search_listings`, `hybrid_search_restaurants` — `LANGUAGE sql`, `SECURITY INVOKER`, need `fts_content`

**Group 3 — agent telemetry / OpenClaw (7):** `fn_record_tool_call_start`, `fn_record_tool_call_end`, `fn_audit_agent_approval`, `fn_audit_agent_run`, `fn_insert_conversation`, `fn_upsert_delivery_log`, `fn_update_conversation_intent`

**Group 4 — events / ticketing (6):** `event_attendees_paginated`, `event_dashboard_summary`, `fn_join_wait_list`, `fn_notify_next_in_line`, `redeem_promo_code`, `ticket_payment_refund_v2`

**Group 5 — misc (6):** `approve_sponsor_application`, `auto_create_landlord_inbox_from_message`, `get_landlord_public_profile`, `is_suppressed`, `touch_updated_at`, `trigger_ai_embed`

**Captured properties:** ~23 are `SECURITY DEFINER`; 9 are `SECURITY INVOKER`. All definer functions already pin `search_path`. Full definitions captured object-by-object for authoring.

**Note on the partner helpers (not a gap):** `partner_ids_for_user`, `partner_is_active` and `partner_organization_ids_for_user` are **migration-owned and present in replay**. They back **27 policy references** (`partner_ids_for_user` alone 22). SB-003 may relocate them to a non-exposed schema — that is a *hardening* decision, and it requires re-pointing those 27 policies in the same migration. **It is not a recovery blocker.**

---

## 5. Class E — newly discovered, NOT in the reviewed scope

### 5.1 The entire `marketing` schema is live-only
* Production: `marketing` present, **12 tables**. Fresh replay: absent, 0 tables. Repo: **no `CREATE SCHEMA marketing`** anywhere.
* Depended on by 4 functions: `fn_insert_conversation` → `marketing.openclaw_conversations`; `fn_upsert_delivery_log` → `marketing.delivery_logs`; `fn_update_conversation_intent` → `marketing.openclaw_conversations`; `fn_record_conversion` → `marketing.campaign_conversions`. (Verified live with `prosrc ~ '\mmarketing\.'` across `public`/`sponsor`/`vote` — those 4 and no others.)
* Also in production: `marketing.campaign_approvals` (an unindexed-FK advisor finding) and the duplicate index `openclaw_conversations_contact_phone_created_at_idx`.

### 5.2 `fts_content` columns and GIN indexes are live-only
* Production: `events.fts_content` exists (and apartments/restaurants).
* Repo: only a **comment** — `20260510000000_vdb01_hybrid_fts_search.sql` attributes the columns to a migration named `20260510_vdb01_fts_columns_and_indexes` that **does not exist**.
* **Blocks 3 functions only:** `hybrid_search_events`, `hybrid_search_listings`, `hybrid_search_restaurants` reference `e.fts_content` / `a.fts_content` / `r.fts_content`. `semantic_search_*` are unaffected — they use embeddings and are already migrated.
* **Why the failure lands at `CREATE` (verified, not assumed).** An earlier draft of this document justified the deferral by saying "PostgreSQL validates `LANGUAGE sql` bodies at CREATE time". That is **not** correct as a general rule, and an external review was right to challenge it. These three use the **string-constant** body form, not the SQL-standard form: all three have `prosqlbody IS NULL` and none contains `BEGIN ATOMIC`. Per [`CREATE FUNCTION`](https://www.postgresql.org/docs/current/sql-createfunction.html), the SQL-standard form "is parsed at function definition time, the string constant form is parsed at execution time" — so the body form alone would **not** make the migration fail.

  What actually makes it fail is the **`check_function_bodies`** setting, which defaults to `on` and **is `on` on this project** (`pg_settings`: `setting = on`, `source = default`). Under it PostgreSQL validates the body during `CREATE FUNCTION`.

  Probe, PostgreSQL 17, four cases, default `check_function_bodies = on` except the last:

  | Body form | `check_function_bodies` | `CREATE` | First invocation |
  |---|---|---|---|
  | `AS $$ … $$` | `on` | **fails** | — |
  | `BEGIN ATOMIC … END` | `on` | **fails** | — |
  | `AS $$ … $$` + `RETURNS TABLE` | `on` | **fails** | — |
  | `AS $$ … $$` | `off` | succeeds | **fails** |

  So on any default-configured Postgres the catch-up migration fails at apply. Both environments this matters for were checked directly rather than assumed: **production** reports `check_function_bodies = on` (`source = default`), and the **local stack's own image**, `public.ecr.aws/supabase/postgres:17.6.1.165`, also reports `on (source=default)` and rejects the string-body form at `CREATE`. Were the GUC turned `off`, creation would succeed and the breakage would move to first invocation: same blast radius, later and quieter. Either way the functions cannot work until `fts_content` exists, so the deferral stands — but for the right reason.

---

## 6. The live-defect cluster (7 functions — must not be silently reproduced)

`20260524022749_mdeapp_canonical_schema_cleanup.sql` dropped ~60 objects; several were **never restored in either environment**:

| Missing object | Production | Fresh replay | Consequence |
|---|---|---|---|
| `public.agent_audit_log` | **absent** | absent | `fn_audit_outbox`, `fn_audit_agent_approval`, `fn_audit_agent_run` insert into it. It is the **AFTER INSERT trigger on `outbox`** → **every INSERT into `outbox` raises an error.** Explains `outbox` = **0 rows**. |
| `public.agent_tool_calls` | **absent** | absent | `fn_record_tool_call_start`/`_end` broken. **`pg_cron` job 10 (`DELETE FROM public.agent_tool_calls`, `0 4 * * *`) fails daily.** |
| `public.messages`, `public.conversations` | **absent** | absent | `auto_create_landlord_inbox_from_message` broken. |
| `public.outbound_clicks` | **absent** | absent | `fn_record_conversion` broken. |

**7 dead functions:** `fn_audit_outbox`, `fn_audit_agent_approval`, `fn_audit_agent_run`, `fn_record_tool_call_start`, `fn_record_tool_call_end`, `auto_create_landlord_inbox_from_message`, `fn_record_conversion`.

These are **production defects, not migration gaps.** Reproducing them as-is preserves the defects in every new environment; recreating the dropped tables would invent schema that was deliberately removed.

**This set is not the same as the `marketing` dependents in §5.1, and the two must not be added together.** The **7 dead** functions fail because their target objects were dropped from *both* environments — the objects are gone everywhere. The **4 `marketing`** dependents fail because a schema that exists in production was never created in Git — the objects are gone only from a rebuilt environment. The sets overlap in exactly **one** function, `fn_record_conversion`, which is both (it writes `marketing.campaign_conversions` *and* reads `public.outbound_clicks`). So the union is **10 distinct functions**, not 11. Together with the 3 `hybrid_search_*` (blocked by `fts_content`, §5.2), that accounts for 13 of the 32 missing functions.

---

## 7. Why the catch-up migration was not authored

1. **Authoring as scoped would fail at apply** — the 3 `hybrid_search_*` reference absent `fts_content`, and `check_function_bodies = on` validates the body during `CREATE FUNCTION` (§5.2).
2. **It would require inventing schema** — 7 functions depend on objects dropped in *both* environments.
3. **It would silently broaden scope** — `marketing` (12 tables) and the FTS columns are large, unreviewed, and absent from the brief.
4. **The 8 tables cannot be made safe in isolation** — `outbox`'s trigger fails on every insert.

---

## 8. Recommended path (needs a decision)

**Option 1 — recover Class A only, defects quarantined (smallest safe step).**
The 8 tables (columns, PK/FK/unique/check, indexes, RLS, policies, grants) **without** `outbox`'s broken `fn_audit_outbox` trigger; plus the **25 non-dead functions**; the 7 dead functions omitted or shipped with an explicit comment + follow-up bug; the 3 `hybrid_search_*` deferred until the FTS columns are recovered.

**Option 2 — recover Class A + Class E dependencies.** Also bring `marketing` (12 tables) and the `fts_content` columns + GIN indexes into Git. Roughly doubles the artifact; needs its own review.

**Option 3 — reconcile the divergence at source.** Decide per object whether production intent is "should exist" or "should have been dropped", then restore from Git or drop in production. The only option that ends the drift rather than duplicating it.

**Independent of the option — file these production defects now:**
* `pg_cron` job 10 fails daily (`agent_tool_calls` missing).
* Every `outbox` INSERT fails (`agent_audit_log` missing) — the outbox/approval pipeline appears never to have worked.
* `delivery_receipts` CHECK references non-existent `posts_outbox`.

---

## 9. Evidence provenance

* Production: Supabase MCP read-only — `pg_class`, `pg_namespace`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_trigger`, `pg_proc`, `aclexplode`, `information_schema.columns`.
* Fresh replay: disposable local stack (`supabase db start` + `db reset`, dedicated ports) inspected via `docker exec psql`. 109/109 migrations, 0 errors.
* Repo: `git grep` over `supabase/migrations/**` with **case-insensitive** quote-tolerant patterns, each hit manually reviewed.
* No production write for this inventory. No credential from the legacy `/home/sk/mde` tree was used.
