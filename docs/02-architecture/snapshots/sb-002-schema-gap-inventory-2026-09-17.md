# SB-002 · Production → Migration Gap Inventory

**Date:** 2026-09-17 · **Project:** `zkwcbyxiwklihegjhuql` (medellin) · **Main at analysis:** `a9a9eb93`
**Method:** read-only. Production inspected via Supabase MCP; fresh replay inspected via a disposable local stack (`sb001-replay`, dedicated ports). No production mutation.
**Status:** 🔴 **inventory complete; the catch-up migration was NOT authored — see §7.**

---

## 1. Headline correction

The task brief described the gap as *"at least these 8 tables"* plus *"approximately 41 functions"*. The inventory shows the gap is **materially different and larger**, and that a naive catch-up migration **cannot be applied and must not be authored as scoped**:

| Finding | Consequence |
|---|---|
| **5 objects are missing from BOTH production and a fresh replay** | Their dependent functions are **already broken in production**. Recreating them would invent schema. |
| The **entire `marketing` schema (12 tables) is live-only** | 4 OpenClaw functions depend on it. Never created in Git. |
| The **`fts_content` columns + GIN indexes** are live-only | `hybrid_search_*` are `LANGUAGE sql` → **validated at CREATE time** → the migration would fail without them. |
| Live **plpgsql** functions reference those dropped objects | They can be created but are **dead code** — see §6. |

---

## 2. Classification (A–E)

| Class | Meaning | Count |
|---|---|---|
| **A** | Migration-owned and missing from replay | **8 tables**, **41 functions** (of which 4 functions are dead — §6) |
| **B** | Mastra runtime-auto-provisioned (`@mastra/pg` via `getMastraStorage()`) | **32 tables** — not a gap |
| **C** | Extension-owned | `spatial_ref_sys` + PostGIS/vector/pg_trgm objects — not a gap |
| **D** | Supabase platform/system-owned | `auth`, `storage`, `realtime`, `net`, `cron`, `vault` — not a gap |
| **E** | **Unknown / newly discovered — preserve & investigate** | `marketing` schema + 12 tables; `fts_content` columns + GIN indexes on 3 tables; the 5 dropped-everywhere objects |

Object names were **not** used to infer category. Two examples of why: a loose grep falsely matched `email_outbox`/`wa_outbox` for `outbox`; and `agent_audit_log` reads as an MDE table but is absent from production.

---

## 3. Class A — the 8 genuinely live-only MDE tables (audited individually)

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

**Origin evidence:** none is created by any migration. Other migrations treat `outbox` as *optional* — e.g. `20260503130000_out_of_band_orphan_tables.sql` guards with `to_regclass('public.outbox') IS NOT NULL` and only then adds the FK. That is why the 109/109 replay succeeds without them.

**Verdict: all 8 are `REQUIRED_MIGRATION`** — with two caveats:
* `delivery_receipts.outbox_table` CHECK references `posts_outbox`, which **does not exist** in either environment.
* `outbox`'s triggers are broken (§6).

---

## 4. Class A — the 41 functions (all confirmed absent; zero false positives)

Re-verified individually against every migration with a quote-tolerant `CREATE FUNCTION` match: **41/41 have no CREATE**, and 0 were false positives.

**Group 1 — outbox / approval pipeline (10):** `outbox_enqueue`, `outbox_claim`, `outbox_mark_failed`, `outbox_mark_sent`, `request_approval`, `decide_approval`, `fn_outbox_set_updated_at`, `fn_outbox_suppression_check`, `fn_audit_outbox`, `fn_record_conversion`

**Group 2 — partner / RLS helpers (3):** `partner_ids_for_user`, `partner_is_active`, `partner_organization_ids_for_user`
> Referenced by policy expressions: **`partner_ids_for_user` 22 policies**, `partner_is_active` 3, `partner_organization_ids_for_user` 2 (27 total). This is why SB-003/SB-006 are blocked on SB-002.

**Group 3 — search / vector (6):** `hybrid_search_events`, `hybrid_search_listings`, `hybrid_search_restaurants`, `semantic_search_events`, `semantic_search_listings`, `semantic_search_restaurants` — all `LANGUAGE sql`, `search_path=''`, `SECURITY INVOKER`

**Group 4 — agent telemetry / OpenClaw (7):** `fn_record_tool_call_start`, `fn_record_tool_call_end`, `fn_audit_agent_approval`, `fn_audit_agent_run`, `fn_insert_conversation`, `fn_upsert_delivery_log`, `fn_update_conversation_intent`

**Group 5 — events / ticketing (7):** `event_attendees_paginated`, `event_dashboard_summary`, `fn_join_wait_list`, `fn_notify_next_in_line`, `redeem_promo_code`, `ticket_payment_refund_v2`, `bookings_validate_event_resource`

**Group 6 — misc (8):** `approve_sponsor_application`, `auto_create_landlord_inbox_from_message`, `get_landlord_public_profile`, `guard_booking_partner_decision`, `is_suppressed`, `touch_updated_at`, `touch_embedding_updated_at`, `trigger_ai_embed`

**Captured properties** (selected): 30 are `SECURITY DEFINER`; 11 are `SECURITY INVOKER` (`hybrid_search_*`, `semantic_search_*`, `touch_updated_at`, `touch_embedding_updated_at`). All definer functions already pin `search_path`. Full definitions were captured object-by-object for migration authoring.

---

## 5. Class E — newly discovered, NOT in the reviewed scope

### 5.1 The entire `marketing` schema is live-only

* Production: `marketing` schema present, **12 tables**.
* Fresh replay: `marketing` schema absent, **0 tables**.
* Repo: **no `CREATE SCHEMA marketing`** anywhere, and no table creation for it.
* Depended on by `fn_insert_conversation` → `marketing.openclaw_conversations`; `fn_upsert_delivery_log` → `marketing.delivery_logs`; `fn_record_conversion` → `marketing.campaign_conversions`.
* Also present in production: `marketing.campaign_approvals` (an unindexed-FK advisor finding) and the duplicate index `openclaw_conversations_contact_phone_created_at_idx`.

### 5.2 `fts_content` columns and GIN indexes are live-only

* Production: `events.fts_content` **exists** (and apartments/restaurants per the search functions).
* Repo: only a **comment** references it — `20260510000000_vdb01_hybrid_fts_search.sql` attributes the columns to a migration named `20260510_vdb01_fts_columns_and_indexes` that **does not exist** in the repository.
* **This blocks the migration**: `hybrid_search_*` and `semantic_search_*` are `LANGUAGE sql`, which PostgreSQL **validates at CREATE time**. On a fresh replay they cannot be created until the columns exist.

---

## 6. The live-defect cluster (must not be silently reproduced)

`20260524022749_mdeapp_canonical_schema_cleanup.sql` dropped ~60 objects, and several were **never restored in either environment**:

| Object | Production | Fresh replay | Consequence |
|---|---|---|---|
| `public.agent_audit_log` | **absent** | absent | `fn_audit_outbox`, `fn_audit_agent_approval`, `fn_audit_agent_run` insert into it. It is the **AFTER INSERT trigger on `outbox`** → **every INSERT into `outbox` raises an error.** Explains `outbox` = **0 rows**. |
| `public.agent_tool_calls` | **absent** | absent | `fn_record_tool_call_start`/`_end` are broken. **`pg_cron` job 10 (`DELETE FROM public.agent_tool_calls`, `0 4 * * *`) fails daily.** |
| `public.messages`, `public.conversations` | **absent** | absent | `auto_create_landlord_inbox_from_message` is broken. |
| `public.outbound_clicks` | **absent** | absent | `fn_record_conversion` is broken. |

**These are production defects, not migration gaps.** They exist because the functions survive while their targets were dropped. Reproducing the functions as-is preserves the defects in every new environment; recreating the dropped tables would invent schema that was deliberately removed.

---

## 7. Why the catch-up migration was not authored

Task 10 said: *"The migration should contain only objects proven to be migration-owned and missing from replay"* and *"Production → existing equivalent objects remain safe; migration converges without destructive replacement."*

That condition is **not met** for the full gap:

1. **Authoring as scoped would fail.** `hybrid_search_*`/`semantic_search_*` are `LANGUAGE sql` and reference `fts_content`, which does not exist in a fresh replay. The migration would fail to apply.
2. **It would require inventing schema.** The 4 functions in §6 depend on objects dropped in *both* environments. Including them means either creating tables nobody intended to exist, or shipping functions that error on first use.
3. **It would silently broaden scope.** The `marketing` schema (12 tables) and the FTS columns/indexes are large, previously unreviewed, and not mentioned in the brief or in SB-001.
4. **The 8 tables cannot be made safe in isolation.** `outbox` carries a trigger that fails on every insert (§6), and `delivery_receipts` checks against a non-existent `posts_outbox`.

Per the operating rules — *"if evidence contradicts this prompt, stop and report the contradiction instead of forcing the expected result"* and *"never silently broaden scope"* — this is a **stop-and-decide** point, not a build point.

---

## 8. Recommended path (needs a decision)

**Option 1 — recover Class A only, with defects quarantined (smallest safe step).**
* Migration A: the **8 tables** (columns, PK/FK/unique/check, indexes, RLS enable, policies, grants) — but **without** `outbox`'s broken `fn_audit_outbox` trigger, and with the `delivery_receipts` CHECK corrected or annotated.
* Migration B: the **37 non-dead functions**, and for the 4 dead ones either omit them or ship them with an explicit comment + a follow-up bug.
* Requires first recovering the `fts_content` columns for the 6 search functions, or deferring those 6.

**Option 2 — recover Class A + the Class E dependencies (fuller, larger).**
Also bring `marketing` (12 tables) and the FTS columns + GIN indexes into Git. This makes the replay genuinely equivalent but roughly doubles the artifact and needs its own review.

**Option 3 — reconcile the divergence at the source.** Decide per object whether production intent is "these should exist" or "these should have been dropped", then either restore from Git or drop in production. This is the only option that ends the drift rather than duplicating it.

**Independent of the option chosen — open production defects to file now:**
* `pg_cron` job 10 fails daily (`agent_tool_calls` missing).
* Every `outbox` INSERT fails (`agent_audit_log` missing) — the outbox/approval pipeline appears never to have worked.
* `delivery_receipts` CHECK references non-existent `posts_outbox`.

---

## 9. Evidence provenance

* Production: Supabase MCP read-only queries — `pg_class`, `pg_namespace`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_trigger`, `pg_proc`, `aclexplode`, `information_schema.columns`.
* Fresh replay: disposable local stack (`supabase db start` + `db reset`, dedicated ports), inspected via `docker exec psql`. 109/109 migrations, 0 errors.
* Repo: `git grep` over `supabase/migrations/**` with quote-tolerant patterns, each hit manually reviewed.
* No production write was performed for this inventory. No credential from the legacy `/home/sk/mde` tree was used.
