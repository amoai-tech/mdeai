# Live Database Inventory — MDE AI (medellin)

- **Project**: `zkwcbyxiwklihegjhuql` (name `medellin`, org `oziabrsrfsussadbbcep`) — the real MDE project.
- **Audit date**: 2026-10-21.
- **Method**: read-only SQL through the Supabase Management API (`/tmp/mde_sql.sh`, user `postgres`). SELECT-only; no DDL/DML was executed.
- **Repo side**: migration reconciliation uses the clean `origin/main` snapshot at `/tmp/mde-main` (git archive of `5d1d76dd`), **not** the dirty/reduced canary worktree at `/home/sk/mdeai`.
- **Access note**: the configured `mcp__supabase__*` tools point at `/nvdlhrodvevgwdsneplk` (FashionOS) and were **not** used.
- **Row-count method**: `count(*)` on the named domain tables (exact). `reltuples` estimates are only used where explicitly labelled `est`.
- **"Table exists" is not "feature works."** This document proves schema/security state only. It does not prove any user journey, checkout, or RPC succeeds end-to-end.

---

## 1. Table inventory by domain

**Totals**: 245 relations in non-system schemas; **194 app-owned tables** (`public` 136 + `vote` 11 + `sponsor` 10 + `marketing` 12 + `outreach` 6 + `openclaw` 4 + `postiz` 5 + `paperclip` 5 + `hermes` 5). The other 51 are Supabase-managed (`auth`, `storage`, `realtime`, `cron`, `net`, `vault`, `supabase_migrations`).

All 194 app-owned tables have **RLS enabled** except `public.spatial_ref_sys` (PostGIS extension table, intentionally not RLS-managed).

### 1.1 rentals — 30 tables
`apartments`, `leads`, `showings`, `bookings`, `rental_applications`, `rental_freshness_log`, `rental_grounding`, `rental_listing_images`, `rental_listing_sources`, `rental_runtime_settings`, `rental_search_sessions`, `rental_signals`, `rental_test_access`, `rental_test_events`, `landlord_profiles`, `landlord_inbox`, `landlord_inbox_events`, `property_verifications`, `verification_requests`, `neighborhoods`, `development_projects`, `development_project_sources`, `development_unit_types`, `developer_lead_registrations`, `developer_lead_registration_stage_events`, `collections`, `saved_places`, `trips`, `trip_items`, `user_preferences`

| Table | RLS | Policies | Rows (exact) |
|---|---|---|---|
| `apartments` | on | 8 | **44** |
| `leads` | on | 9 | **19** |
| `showings` | on | 4 | **8** |
| `bookings` | on | 8 | **7** |
| `rental_applications` | on | 5 | **0** |
| `saved_places` | on | 5 | **0** |
| `landlord_profiles` | on | 4 | **7** |
| `development_projects` | on | 9 | **16** |
| `development_unit_types` | on | 7 | est 41 |

### 1.2 events / ticketing — 19 tables
`events`, `event_tickets`, `event_orders`, `event_attendees`, `event_attendee_profiles`, `event_check_ins`, `event_wait_list`, `event_promo_codes`, `event_order_refunds`, `event_taxes_and_fees`, `event_ticket_taxes_and_fees`, `event_grounding`, `event_signals`, `event_media_assets`, `event_sponsors`, `event_sponsor_placements`, `event_stakeholders`, `event_vendors`, `event_venues`

| Table | RLS | Policies | Rows (exact) |
|---|---|---|---|
| `events` | on | 11 | **65** |
| `event_tickets` | on | 2 | **21** |
| `event_orders` | on | 2 | **202** |
| `event_attendees` | on | 1 | **41** |
| `event_check_ins` | on | 1 | **3** |

### 1.3 restaurants / votes — `public.restaurants` + `vote` schema (11 tables)
`public.restaurants` (RLS on, 6 policies, **44 rows**). `vote` schema: `contests`, `contest_audit`, `categories`, `entities`, `entity_tally`, `fraud_signals`, `judge_scores`, `judges`, `paid_vote_orders`, `scoring_criteria`, `votes` — RLS on for all 11, 30 policies total.

Exact counts: `vote.contests` **4**, `vote.entities` **15**, `vote.votes` **4**, `vote.entity_tally` **4**, `vote.judges` est 0, `public.vote_consumed_nonces` **99**.

### 1.4 partners — 11 tables
`partners`, `partner_organizations`, `partner_locations`, `partner_members`, `partner_services`, `partner_assets`, `partner_drafts`, `partner_commission_agreements`, `commission_claims`, `revenue_ledger`, `suppression_list` — RLS on for all.

Exact: `partners` **9**, `partner_organizations` **0**, `partner_locations` **6**, `partner_members` est 0.

### 1.5 admin / inventory / infra — 29 tables
`profiles`, `user_roles`, `app_runtime_config`, `approval_requests`, `approval_decisions`, `budget_tracking`, `conflict_resolutions`, `idempotency_keys`, `payments`, `outbox`, `wa_outbox`, `email_outbox`, `delivery_receipts`, `notifications`, `rate_limit_hits`, `analytics_events_daily`, `search_logs`, `signal_generation_logs`, `proactive_suggestions`, `venue_*` (6), `whatsapp_*` (4), `spatial_ref_sys`, `vote_consumed_nonces`.

Exact: `profiles` **1235**, `user_roles` **3**, `payment`→`payments` **3**, `idempotency_keys` **72**, `rate_limit_hits` **16**, `search_logs` **3298**, `vote_consumed_nonces` **99**, `whatsapp_messages` **0**.

### 1.6 AI / chat / search — 46 tables
Mastra: 33 `mastra_*` tables (agents, threads, messages, spans, datasets, scorers, skills, workspaces, MCP, schedules, prompt blocks). Plus `ai_runs`, `embedding_jobs`, `listing_embeddings`, `restaurant_embeddings`, `event_embeddings`, `query_embedding_cache`, `place_details_cache`, `places_search_cache`, `grounding_quota_log`, `search_grounding_quota_log`, `grounding_failures`, `tourist_destinations`, `neighborhood_profiles`.

Exact: `ai_runs` **2015**, `mastra_threads` est 156, `mastra_messages` est 274, `listing_embeddings` **44**, `restaurant_embeddings` **44**, `event_embeddings` **65**, `embedding_jobs` est 255, `search_logs` **3298**.

### 1.7 Other app schemas (not `public`)
`sponsor` 10 tables (21 policies), `marketing` 12 (30), `outreach` 6 (15), `openclaw` 4 (11), `postiz` 5 (14), `paperclip` 5 (15), `hermes` 5 (15). All RLS-enabled.

---

## 2. Functions / RPCs

**190 app-owned functions** in `public` (extension members excluded via `pg_depend deptype='e'`); the raw `public` count including PostGIS/vector/pg_trgm is far larger and not app-controlled.

### 2.1 Security-definer inventory
- **0** SECDEF functions lack a `search_path` setting — 100% pinned (`SET search_path` present on every app SECDEF function). This is the one security control that is consistently correct.
- **23 SECURITY DEFINER functions are executable by `anon`:**

| Function | anon | Internal guard | Assessment |
|---|---|---|---|
| `ticket_checkout_create_pending(...)` | yes | advisory lock + capacity guard by design | **Intended** (anonymous checkout) — but see 8.3 |
| `ticket_validate_consume(p_qr_token)` | yes | none | **FLAG — see 8.4** |
| `redeem_promo_code(event, code, ticket)` | yes | none | **FLAG — see 8.5** |
| `decide_approval(...)` | yes | `auth.uid()` + `is_admin()` | OK — internally authorized |
| `insert_trip_item_for_user(...)` | yes | `auth.uid()` | OK |
| `fn_record_conversion(...)` | yes | none | **FLAG** — anon can write conversion metrics |
| `fn_join_wait_list(...)` | yes | none | Review — anon can enqueue on a wait list |
| `get_anonymous_order(order, access_token)` | yes | token-scoped read | Intended |
| `apartment_save_counts`, `check_rate_limit`, `compute_ticket_total`, `log_outbound_click`, `get_landlord_public_profile`, `is_suppressed`, `partner_ids_for_user`, `partner_organization_ids_for_user`, `partner_is_active`, `rental_development_active`, `rental_enrichment_is_readable`, `get_my_role`, `is_admin`, `is_moderator`, `has_role` | yes | read-only helpers | Low risk |

### 2.2 Not publicly executable (service-role / worker only) — correct posture
`cast_restaurant_vote`, `vote_receipt`, `vote_consume_nonce`, `vote_tally`, `vote_contest_context`, `vote_restaurant_target`, `vote_restaurant_contest_options`, `vote_my_receipt`, `p1_schedule_tour_atomic`, `p1_start_rental_application_atomic`, `ticket_payment_finalize`, `ticket_payment_refund`, `ticket_payment_refund_v2` (authenticated only), `outbox_*`, `whatsapp_*`, `compute_lead_score`, `embedding_jobs` workers, `request_approval`, `property_verifications_review_guard`, `_san1502_activate_development_inventory`.

**Note**: the vote RPCs being service-role-only means voting is fronted by an Edge Function/route; the DB is not the trust boundary for voter identity. Correct for nonce/rate-limit design, but it means **all vote fraud protection lives outside the database**. Unverified from SQL alone.

### 2.3 Search RPCs
`semantic_search_{listings,restaurants,events}` and `hybrid_search_{listings,restaurants,events}` — 6 functions, all `SECURITY INVOKER`, `anon`+`authenticated` executable, all read the **base** embedding tables (not the HNSW index relations), `hybrid_*` use RRF with `fts_weight`/`semantic_weight`. `semantic_search_listings` has `search_path` unset but is INVOKER and reads fully-qualified names — acceptable.

---

## 3. RLS

| Metric | Value |
|---|---|
| App-owned tables | 194 |
| Tables with RLS **off** | **1** (`public.spatial_ref_sys`, extension-owned) |
| Total policies (app schemas) | **540** |
| Policies on `public` (136 tables) | **389** |
| Policies on other app schemas | 151 |
| Tables with RLS on and **zero policies** | **3** active + 1 extension |

**Zero-policy tables** (default-deny; service-role only):
| Table | Verdict |
|---|---|
| `public.app_runtime_config` | **Intentional** — runtime flags, service-role only |
| `public.rental_runtime_settings` | **Intentional** — same pattern |
| `public.vote_consumed_nonces` | **Intentional** — nonce ledger, written by SECDEF RPCs |
| `public.spatial_ref_sys` | Extension table, RLS off entirely |

**Permissive `USING (true)` policies**: 186 matched, but **168 are `TO service_role` and therefore correct** (service role bypasses RLS anyway; the policy is documentation). Genuinely public-readable rows are limited to catalog/AI data: `event_embeddings`, `restaurant_embeddings`, `listing_embeddings` (SELECT to `anon`+`authenticated`), `event_grounding`, `event_signals`, `neighborhoods`, `neighborhood_profiles`, `venue_signals`, `venue_source_evidence`, `rental_listing_sources` (authenticated). **No `USING (true)` policy grants `anon`/`authenticated` access to a money or PII table.** This is materially better than typical Supabase defaults.

**Key-table policy counts**: `apartments` 8, `leads` 9, `showings` 4, `bookings` 8, `events` 11, `event_orders` 2, `event_tickets` 2, `event_attendees` 1, `restaurants` 6, `partners` 7, `profiles` 3, `listing_embeddings` 6, `restaurant_embeddings` 6.

**Ownership predicates are present and role-based**, not column-trusted: `bookings` scopes on `user_id = auth.uid()`, `leads` on `user_id/assigned_agent_id`, `showings` via join to `leads`/`apartments`, `apartments` via `acting_landlord_ids()` and `is_admin()`. `leads_select_partner_member` additionally requires `lead_partner_listing_aligned(...)`. These are real authorization checks, not `true`.

---

## 4. Indexes

### 4.1 pgvector — 768-dim cosine for retrieval (HNSW), 1536-dim in `hermes`

| Table.column | Type | Dim | Index | Opclass |
|---|---|---|---|---|
| `public.listing_embeddings.embedding` | `vector` | **768** | `listing_embeddings_hnsw` USING hnsw | `vector_cosine_ops`, m=16, ef_construction=64 |
| `public.restaurant_embeddings.embedding` | `vector` | **768** | `restaurant_embeddings_hnsw` USING hnsw | `vector_cosine_ops`, m=16, ef_construction=64 |
| `public.event_embeddings.embedding` | `vector` | **768** | `event_embeddings_hnsw` USING hnsw | `vector_cosine_ops`, m=16, ef_construction=64 |
| `public.query_embedding_cache.embedding` | `vector` | 768 | none | — |
| `vote.entities.embedding` | `vector` | 768 | `vote_entities_embedding_idx` USING **ivfflat** | `vector_cosine_ops`, lists=100 |
| `hermes.embedding_cache.embedding` | `vector` | **1536** | none | — |
| `hermes.taste_profiles.vector` | `vector` | **1536** | none | — |

**Embedding index state: healthy.** All three retrieval tables that serve search have HNSW + cosine indexes and are populated (44 / 44 / 65 rows). The 1536-dim `hermes` tables are a **dimension mismatch** with the 768-dim `text-embedding-004` pipeline used elsewhere — if `hermes` is live, it cannot share an embedding provider with the 768-dim tables. Worth confirming `hermes` is dormant (0 rows in `hermes.embedding_cache` today).

`*_hnsw` names appearing in `pg_attribute` are the index relations, not tables (querying them returns `42809 cannot open relation`). Only the three base tables exist.

### 4.2 Full-text search
GIN tsvector indexes present on `apartments.fts_content`, `events.fts_content`, `restaurants.fts_content`. Supporting GIN on `events.tags`, `restaurants.cuisine_types`, `restaurants.tags`, `user_preferences.*`, `saved_places.tags`, `tourist_destinations.tags`, `event_attendee_profiles.accessibility_needs`. `pg_trgm` is installed, but **no GIN trgm index was found** on name/title columns — trigram fuzzy match would seq-scan.

### 4.3 Missing FK indexes
8 foreign-key columns have **no leading index** (single-column FKs):
`apartments.published_by`, `apartments.workflow_changed_by`, `bookings.approved_by`, `commission_claims.agreement_id`, `commission_claims.project_id`, `commission_claims.revenue_ledger_id`, `developer_lead_registrations.agreement_id`, `development_projects.primary_source_id`.

All are low-selectivity admin/audit columns on small tables (44 / 7 / 16 rows) — **not a launch blocker**, but `commission_claims` joins will degrade as rows grow. Filtered indexes exist where they matter: `event_orders_buyer_idx`, `event_orders_buyer_anon_idx`, `event_orders_payment_idx`, `event_orders_pi_idx`, `event_orders_status_idx`, `event_orders_ticket_idx`, `event_orders_event_idx`.

---

## 5. Extensions and pg_cron

**14 extensions installed**: `vector 0.8.0` (schema `public`), `postgis 3.3.7` (`public`), `pg_trgm 1.6` (`public`), `pg_cron 1.6.4` (`pg_catalog`), `pg_net 0.19.5`, `pgcrypto 1.3`, `pg_stat_statements 1.11`, `hypopg 1.4.1`, `index_advisor 0.2.0`, `citext 1.6`, `uuid-ossp 1.1`, `supabase_vault 0.3.1`, `plpgsql 1.0`.

**Note**: `vector`, `postgis`, and `pg_trgm` are installed in `public` rather than `extensions`. Not a bug, but it widens `public` surface and makes `search_path` hygiene harder.

**7 active cron jobs**:

| id | schedule | jobname | assessment |
|---|---|---|---|
| 3 | `10 3 * * *` | `mdeai_analytics_daily_snapshot` | ok |
| 8 | `*/5 * * * *` | `wait_list_expire_holds` | ok |
| 17 | `0 14 * * *` | `chat-lead-followup-check` | ok |
| 22 | `20 4 * * *` | `mastra_span_retention` | ok |
| 23 | `15 * * * *` | `mastra_anonymous_regression_check` | ok — fails loudly by design |
| 24 | `* * * * *` | `mdeai_embedding_jobs_tick` | ok — guards on claimable work, reads Vault secrets, raises `P1523` if missing |
| — | — | `san1313_retire_broken_lead_reminder_cron` | retired (migration applied) |

All cron bodies are qualified (`public.`/`pg_catalog.`) and job 24 refuses to guess a host when Vault secrets are absent. Good operational posture.

---

## 6. Migration reconciliation

**Result: ZERO drift.** Verified against the clean `origin/main` snapshot at `/tmp/mde-main` (a `git archive` of `origin/main` `5d1d76dd`), **not** the dirty shared worktree.

| Measurement | Value |
|---|---|
| Remote `supabase_migrations.schema_migrations` versions | **207** |
| `/tmp/mde-main/supabase/migrations` files (total) | **208** |
| — conforming `NNNN_name.sql` | **207** |
| — non-conforming | `_archive-not-on-remote/` (2 archived migrations, intentionally never applied) |
| Local-only (in main, not applied) | **0** |
| Remote-only (applied, no repo file) | **0** |
| **Drift total** | **0** |
| Highest applied version | `20261021070000` — `san1502_phase_a_pending_rental_search` |
| Highest local version | `20261021070000` — matches exactly |
| Latest applied **timestamp** | **Unverified / not stored** — remote table columns are `version, statements, name, created_by, idempotency_key, rollback`; **no `inserted_at`**. Querying it returns `42703 column "inserted_at" does not exist`. Version prefix is the only ordering evidence. |
| Local pgTAP test files on main | **75** (`supabase/tests`) |

### 6.1 Local-checkout vs main — record separately, do not confuse with drift

The shared working tree `/home/sk/mdeai` is the **reduced canary branch** `ai/san-1332-frozen-canary` at HEAD `82d5021e` (2026-09-29), which is **1061 commits behind `origin/main`** `5d1d76dd` (2026-10-20). It is a deliberately reduced branch, not a corrupted clone.

| Side | Migration files | Newest version |
|---|---|---|
| `/tmp/mde-main` (origin/main) | **207** conforming (+2 archived) | `20261021070000` |
| `/home/sk/mdeai` (canary worktree) | **127** conforming (+ same archive dir) | `20260929120000` |
| Remote applied | **207** | `20261021070000` |

So: **main ↔ remote drift = 0**; **canary worktree ↔ main = 80 migrations behind** (207 − 127). This is a *checkout* difference, **not database drift**. Any audit, plan, or code change that reads `/home/sk/mdeai/supabase/migrations` will be missing all of October's schema work and must use `/tmp/mde-main` or `git show origin/main:...` instead.

The 80 migrations present on main/remote but absent from the canary worktree cover almost all of October: `new_projects_*`, `san1431_*` publish/verification, `san1502_*` rental test-mode and development gates, `vote` schema recovery (`recover_vote_schema`, `secure_restaurant_vote_rpc`, `vote_my_receipt`), `embedding_worker_pipeline`, `san1524_*` contest reads, `san1281_applied_migration_versions`, `san1305_restore_fts_hybrid_search`, `san1556_destination_photos`.


---

## 7. Transactional / integrity RPCs

### 7.1 Viewing + lead creation — `p1_schedule_tour_atomic` (SECDEF, service-role only, 16 KB)
- **Idempotency**: 29 references; `p_idempotency_key` argument, `public.idempotency_keys` table with `PRIMARY KEY (key)` and 72 rows.
- **Concurrency**: 2 × `FOR UPDATE`, 2 locks — serializes on the lead/showing row.
- **Authorization**: `is_admin()` appears 3×; caller is service-role (Edge Function resolves the user), so the ownership check is outside the DB. Unverified without reading the Edge Function.
- **State guards**: 6 `status =` comparisons + 15 `RAISE EXCEPTION`. Exists and is real.

### 7.2 Broker viewing mutation — `p1_broker_update_showing` (SECDEF, `authenticated`)
- **Optimistic concurrency**: takes `p_expected_status` **and** `p_expected_scheduled_at` and does `FOR UPDATE` — a compare-and-set on both status and time. This is the strongest guard pattern found.
- **Authorization**: `auth.uid()` + `is_admin()` present. 10 `RAISE EXCEPTION`. Correct.

### 7.3 Ticket checkout
- `ticket_checkout_create_pending` (SECDEF, **anon**, `search_path=public,pg_temp`): `pg_advisory_xact_lock(hashtext(event_id))`, attendee-count vs quantity validation (`ATTENDEES_QUANTITY_MISMATCH`), ticket `FOR UPDATE`, `TICKET_INACTIVE` and event/ticket match checks, 3 locks total. **Capacity is enforced transactionally.**
- `ticket_payment_finalize` (SECDEF, service-role), `ticket_payment_refund_v2` (SECDEF, authenticated), `ticket_checkout_cancel` (SECDEF, service-role).
- **Uniqueness**: `event_orders_access_token_key` UNIQUE, `event_orders_short_id_key` UNIQUE, `event_attendees_qr_token_key` UNIQUE, `event_tickets_check1 = (qty_sold + qty_pending) <= qty_total`. Order status constrained to `pending|paid|partial_refund|refunded|cancelled`; check-in result fully enumerated.
- **Idempotency risk**: `stripe_payment_intent` has only a **non-unique** filtered index (`event_orders_pi_idx`), not a UNIQUE constraint. Double-finalize protection therefore depends on the `status` state guard inside `ticket_payment_finalize`, not on a DB constraint. Verify that guard before trusting webhook retries.

### 7.4 Voting / contests — verified in detail

**All 11 `vote.*` tables exist and are RLS-enabled** (30 policies total). Present: `contests`, `contest_audit`, `categories`, `entities`, `entity_tally`, `fraud_signals`, `judge_scores`, `judges`, `paid_vote_orders`, `scoring_criteria`, `votes`.

**Tables that do NOT exist (state plainly):** there is **no** `restaurant_contest*` table of any kind (`restaurant_contests`, `restaurant_contest_entries`, `restaurant_contest_votes` — all absent). Contests are modeled generically in `vote.*`; restaurants are attached via `vote.entities.restaurant_id → public.restaurants(id) ON DELETE SET NULL` plus `vote.votes.restaurant_ballot`. Likewise there is **no** `receipts` table — `receipt` exists only as the RPCs `vote_receipt` / `vote_my_receipt`, and the unrelated `public.delivery_receipts`.

**Duplicate-prevention constraints — present and real:**

| Constraint | Type | Prevents |
|---|---|---|
| `vote_votes_idempotency_idx` UNIQUE (`idempotency_key`) | unique | **Replays of the same vote request** — the core nonce/idempotency guard |
| `vote_votes_one_restaurant_ballot_idx` UNIQUE (`contest_id`, `voter_user_id`) WHERE `restaurant_ballot` AND `source = …` | partial unique | **One restaurant ballot per voter per contest** — double-voting is impossible at the table level |
| `vote_entities_one_entry_per_restaurant_idx` UNIQUE (`contest_id`, `restaurant_id`) WHERE `restaurant_id IS NOT NULL` | partial unique | Same restaurant entered twice in one contest |
| `vote_contest_audit_actor_request_idx` UNIQUE (`actor_user_id`, `request_id`) WHERE `request_id IS NOT NULL` | partial unique | Duplicate audit rows from retried admin actions |
| `entities_contest_id_slug_key`, `categories_contest_id_slug_key`, `contests_slug_key`, `scoring_criteria_contest_id_key_key` | unique | Slug/key collisions |
| `entity_tally_pkey` (entity_id), `judges_pkey` (contest_id,user_id), `judge_scores_pkey` (contest,entity,judge,criterion), `fraud_signals_pkey` (vote_id) | PK | Duplicate tally/judge/score rows |

**Referential integrity is complete**: every `vote.*` FK is declared with an explicit delete action (`ON DELETE CASCADE` for contest-scoped children, `SET NULL` for optional `restaurant_id`/`event_id`/`category_id`). No orphan risk found.

**Vote/contest RPCs — 22 functions, all `SECURITY DEFINER`, all `search_path` pinned, and every one is service-role-only** (`anon=false`, `authenticated=false`; confirmed with `has_function_privilege`): `cast_restaurant_vote`, `vote_receipt`, `vote_my_receipt`, `vote_consume_nonce`, `vote_tally`, `vote_contest_context`, `vote_restaurant_target`, `vote_restaurant_contest_options`, `admin_contest_{create,get,list,update,link_restaurant,unlink_restaurant}`, `assert_contest_admin`, `contest_audit_insert`, `contest_public_{get,list}`, `recompute_contest_tally` (INVOKER), `recompute_entity_tally`, `trigger_recompute_on_vote`, `broadcast_vote_tally_changes`.

**Tally recomputation exists** (`recompute_contest_tally`, `recompute_entity_tally`, `trigger_recompute_on_vote` all live), matching the merged contest-standings migrations (`san1497_*_recompute`, `san1497_refresh_tally_on_review_and_delete`, `san1497_contest_wide_recompute` are all applied).

**Replay protection**: `public.vote_consumed_nonces` with `PRIMARY KEY (jti)`, RLS on with **0 policies** (service-role only), 99 rows — a consumed-nonce ledger. `vote_receipt(contest, user, idempotency_key)` and `vote_my_receipt` both exist.

**Concurrency**: `cast_restaurant_vote` is 5.3 KB with 9 idempotency references, 1 lock, 12 `RAISE EXCEPTION`.

**Remaining caveat**: caller identity arrives as an argument (`p_user_id`, `p_actor`) to these service-role-only functions, so the DB trusts its caller. Vote integrity is enforced by (a) table constraints above and (b) whatever authenticates the caller in the Edge/route layer. The constraint layer is verified; the caller layer is **Unverified**.


### 7.5 Approval / commission
`decide_approval` (anon-granted but internally checks `auth.uid()` + `is_admin()`), `post_new_project_commission` (authenticated, idempotency key), `request_approval` + `outbox_*` (service-role), `validate_commission_claim_transition`, `validate_developer_registration_transition` (trigger functions).

---

## 8. Auth and storage

| Metric | Value |
|---|---|
| `auth.users` | **24** |
| `auth.identities` | 25 |
| `auth.sessions` | 1058 |
| `public.profiles` | **1235** |
| `public.user_roles` | **3** |
| Storage buckets | **5** |
| `storage.objects` | **542** |

**Profile role distribution** (aggregate only, no PII): `user` **1234**, `moderator` **1**.
**`user_roles` distribution**: `admin` 1, `moderator` 1, `super_admin` 1.

**Anomaly worth flagging**: `profiles` (1235) is **51×** `auth.users` (24). Either seeded/demo profiles, orphaned rows, or the auth users were deleted. Do not treat "1235 profiles" as 1235 real users — this ratio will mislead any growth/capacity planning. Exact cause Unverified (would need a join query; not run to avoid PII exposure).

**Storage buckets** (5): `contracts` (private), `identity-docs` (private), `listing-photos` (**public**), `partner-assets` (private), `sponsor-assets` (**public**). `storage.objects` has 17 policies.

---

## 9. Security flags (ranked)

1. **`redeem_promo_code` — unauthenticated SECDEF state mutation.** Callable by `anon`, no caller authorization, and it unconditionally does `UPDATE event_promo_codes SET usage_count = usage_count + 1`. Anyone holding the public anon key can burn a promo code's usage budget without buying a ticket (`PROMO_EXHAUSTED` denial-of-inventory). Not data disclosure, but a real unauthenticated integrity/availability vector. *Verified from `pg_get_functiondef`.*
2. **`ticket_validate_consume` — anon-callable token consumption + PII return.** SECDEF, anon-executable, no caller auth. Given a QR token it marks `qr_used_at` and, on `refunded`/`already_used`, returns `attendee_name` in the response. A leaked/forwarded QR can be burned by anyone, and attendee names are returned to unauthenticated callers. Verify the scanner route is the only intended caller; the DB grants no such restriction.
3. **`fn_record_conversion` — anon-executable SECDEF with no internal guard.** Unauthenticated callers can inflate conversion metrics. Metric poisoning, not a breach.
4. **`fn_join_wait_list` — anon-executable SECDEF with no internal guard.** Anon can enqueue arbitrary emails on a wait list. Abuse/notification-spam risk.
5. **Promo/finalize idempotency is state-guard-only.** `stripe_payment_intent` is not UNIQUE on `event_orders`. Webhook retry safety rests entirely on the `status` transition inside `ticket_payment_finalize`. High-value verification target.
6. **Vote integrity is stronger than expected in-table, but the caller layer is unverified.** Duplicate voting and vote replays are blocked by real partial-unique constraints (`vote_votes_one_restaurant_ballot_idx`, `vote_votes_idempotency_idx`) plus the `vote_consumed_nonces` PK — not only by RPC logic. However every vote/contest RPC is service-role-only and accepts `p_user_id`/`p_actor` as an argument, so the DB cannot itself verify who is voting. "Vote integrity is DB-enforced" is half true; the identity half lives in the Edge layer and was **not** verified here.
7. **No SECDEF function is missing `search_path` (0/190).** Contrast with the finding above: the `search_path` hygiene rule is fully enforced; the *grant* hygiene (`anon` EXECUTE on write-capable SECDEFs) is not.
8. **`spatial_ref_sys` has RLS off** — extension-owned, expected.
9. **Low-risk**: 8 unindexed FK columns; `pg_trgm` installed without trigram indexes; `vector`/`postgis` in `public` schema; `hermes` 1536-dim vs 768-dim pipeline split.

---

## 10. What this audit does NOT establish

- Whether any RPC **succeeds** end-to-end (RPC existence + guard branches read, but no execution).
- Whether Edge Functions authenticate users before calling service-role RPCs that take `p_user_id`/`p_actor` as arguments — **the single largest unverified assumption** in this design.
- Whether RLS policies behave correctly under actual JWT claims (predicates read, not executed).
- Real applied timestamps (not stored in the remote table).
- Actual index usage (`pg_stat_statements` and `index_advisor` are installed but were not queried).
- Cause of the `profiles` 1235 vs `auth.users` 24 ratio.
- Anything about the FashionOS project `nvdlhrodvevgwdsneplk` — out of scope by instruction.
