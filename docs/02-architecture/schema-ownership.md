# Schema Ownership — MDE Supabase (`zkwcbyxiwklihegjhuql`)

**Snapshot:** 2026-09-17, read-only · **Comparison commit:** `a9a9eb931ae602568b2be61904f2dee886c45ec4`
**Owner task:** Task 48.2H.1 · MDE-SB-001 — Canonical Supabase Inventory
**Companions:** [`migration-drift.md`](./migration-drift.md) · [`edge-functions.md`](./edge-functions.md)

Every count below was re-queried live at snapshot time. **Do not copy these into a later task without re-running the harness** — advisor and ACL counts drift.

---

## 1. Schemas

| Schema | Base tables | Classification | Data API exposed? |
|---|---|---|---|
| `public` | **132** | MDE application + extension-owned objects | ✅ yes |
| `auth` | 27 | Supabase-managed | no (via Data API) |
| `marketing` | 12 | Auxiliary (OpenClaw/Postiz/outreach campaigns) | no |
| `vote` | 10 | Auxiliary (contest) | **no** |
| `sponsor` | 10 | **MDE application** (sponsor domain) | ✅ **yes** |
| `storage` | 8 | Supabase-managed | storage API |
| `outreach` | 6 | Auxiliary | no |
| `hermes` | 5 | Auxiliary | no |
| `paperclip` | 5 | Auxiliary | no |
| `postiz` | 5 | Auxiliary | no |
| `openclaw` | 4 | Auxiliary | no |
| `realtime` | 9 | Supabase-managed (locked down upstream) | n/a |
| `net` / `cron` | 2 / 2 | Supabase-managed (pg_net, pg_cron) | no |
| `supabase_migrations` | 1 | Supabase-managed | no |
| `vault` | 1 | Supabase-managed | no |

**Object ownership:** 188 tables owned by `postgres`; 1 by `supabase_admin` (`spatial_ref_sys`). No third-party/unexpected owner.

### 1.1 Auxiliary schema ownership — an unresolved gap

Repo-side reference counts (`src/**`, `supabase/functions/**`, `supabase/migrations/**`, `scripts/**`):

| Schema | Files referencing it | Assessment |
|---|---|---|
| `sponsor` | **11** | owned by MDE; exposed; kept |
| `marketing` | 2 | partial |
| `vote` | 1 | contest domain; not exposed |
| `openclaw` | **0** | ⚠️ no repo dependency |
| `outreach` | **0** | ⚠️ no repo dependency |
| `postiz` | **0** | ⚠️ no repo dependency |
| `paperclip` | **0** | ⚠️ no repo dependency |
| `hermes` | **0** | ⚠️ no repo dependency |

**These five schemas have no owner and no MDE dependency statement**, yet they hold 25 tables between them and are all owned by `postgres`.

**Most likely their real callers are the 35 live-only Edge Functions** — the deployment list includes `openclaw-delivery-webhook`, `openclaw-outreach`, `postiz-approval-webhook`, `postiz-schedule-posts`, `outbox-dispatch` and `failed-deliveries-digest`, none of which has source in Git. That matches: the schemas are written to, but nothing in the repository writes to them.

**Consequence:** SB-008 must recover those functions (`supabase functions download`) **before** any decision is taken on these schemas. **All five are `UNKNOWN-PRESERVE`.** Do not drop, move or lock down any object in them on the basis of the zero repo reference count alone — the reference is missing because the writer's source is missing.

### 1.2 Exposed-schema drift — ✅ RESOLVED 2026-09-17 (repo aligned to hosted truth)

```text
Hosted  authenticator.pgrst.db_schemas = public,sponsor
Repo before  supabase/config.toml  schemas = ["public", "graphql_public"]
Repo after   supabase/config.toml  schemas = ["public", "sponsor"]   ← changed by SB-001
```

**Resolution:** the hosted value is the applied truth, so the repo config was aligned to it. `graphql_public` was default boilerplate — it is **not** exposed in production and `pg_graphql` is not installed (`installed_version` is null after the 2026-01-26 upstream change that stopped auto-enabling it). `sponsor` **is** exposed in production and was invisible to local dev and to local advisor runs.

Rationale for repo→hosted rather than hosted→repo: aligning the hosted value would require disabling a deliberately exposed application schema (10 tables, 21 policies) that the sponsor domain depends on. No production write was needed for this fix.

⚠️ **Still open — advisor blind spot:** the Dashboard/CLI Advisors **do not report `sponsor.*` or `vote.*` DEFINER exposure** even though `sponsor` is exposed. SB-001's privileged-function inventory is the only artifact that catches it.

---

## 2. RLS state

| Metric | Value | Note |
|---|---|---|
| `public` tables with RLS **disabled** | **9** | 8 `fashionos_*` (→ SB-002) + `spatial_ref_sys` |
| RLS enabled with **zero** policies | **0** ✅ | every RLS-enabled `public` table has ≥1 policy |
| `public` policies | **346** | |
| Policies, all schemas | **518** | 367 in exposed schemas (`public` 346 + `sponsor` 21) |
| Policies targeting `TO public` (no explicit role) | **84** | each needs classification (SB-006) |
| Policies using deprecated `auth.role()` | **3** | `grounding_quota_log`, `search_grounding_quota_log`, `proactive_suggestions` |
| UPDATE policies missing `WITH CHECK` | **13** | 4 `public` + 2 `storage.objects` + 7 `vote.*` |
| `auth_rls_initplan` (lint 0003) findings | **0** ✅ | `auth.uid()` is already wrapped as `(select auth.uid())` |
| Multiple-permissive-policy findings (advisor raw) | **114** | ⚠️ inflated — see §2.1 |

### 2.1 The 114 figure is a role-inflated artefact

Re-grouped by `(schema, table, command, target role)` the real scope is **33 groups**, of which **29 involve API roles** and **24 are `authenticated`**. The advisor emits each finding once per role, including `authenticator`, `cli_login_postgres`, `dashboard_user` and `supabase_privileged_role` — none of which are end-user roles.

**Highest-value RLS defect (do first — SB-006 General):** `user_preferences_update_own` and `wa_subs_own_update` use `USING (user_id = (select auth.uid()))` with **no `WITH CHECK`**, so a user can UPDATE their own row and **reassign `user_id` to another account**. Same shape: `event_stakeholders`, `event_vendors`.

**Advisor blind spot:** `is_admin()`, `has_role()`, `is_moderator()`, `partner_ids_for_user()`, `partner_is_active()`, `partner_organization_ids_for_user()` are called **unwrapped** in policy quals → per-row evaluation. No lint catches this. See <https://supabase.com/docs/guides/database/postgres/row-level-security-performance>.

---

## 3. Grants (grants ≠ RLS; both are required)

| Grantee | `public` tables | Privileges held |
|---|---|---|
| `anon` | **100 of 132** | SELECT, INSERT, UPDATE, DELETE, **TRUNCATE**, REFERENCES, TRIGGER, MAINTAIN |
| `authenticated` | ~99–100 | same |
| `service_role` | 132 | all |
| `PUBLIC` | **1** | SELECT — `spatial_ref_sys` only |
| Tables with `relacl IS NULL` | **0** | every table has an explicit ACL |

* The 32 tables **not** granted to `anon` are exactly the `mastra_*` set — locked down by `20260517144706_mastra_public_tables_rls_lockdown.sql`. **That migration is the pattern to copy** for SB-003/SB-006.
* `sponsor`: `authenticated` has SELECT (10), INSERT (9), UPDATE (9); **`anon` has none** ✅.
* `TRUNCATE` is granted to `anon`/`authenticated`. **Not exploitable via the Data API** (PostgREST has no TRUNCATE verb, and `anon` is not a login role) — it is a least-privilege defect, not a live hole. Record it as such rather than as an incident.

### 3.1 ⚠️ Default privileges are the root cause of recurring exposure

Two grantors hold default ACLs that re-grant full DML for **every new object**:

| Grantor | Schema | Object | Default ACL |
|---|---|---|---|
| `postgres` | `public` | tables | `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm` |
| `postgres` | `public` | functions | `anon=X`, `authenticated=X` |
| `postgres` | `public` | sequences | `anon=rwU`, `authenticated=rwU` |
| `supabase_admin` | `public` | tables / functions / sequences | **same grants again** |
| `postgres` | `storage` | tables / functions / sequences | same |

So a new `public` table or function is born exposed unless explicitly revoked. The fix must run `ALTER DEFAULT PRIVILEGES` **for both `postgres` and `supabase_admin`** (SB-003), otherwise the drift returns.

**Upstream deadline:** new `public` tables stop being auto-exposed platform-wide on **2026-10-30** — <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>. Recorded here; gated by SB-010.

### 3.2 `PUBLIC` grant on `spatial_ref_sys`

The only `PUBLIC` grant in `public`. Extension-owned (below) — document, do not "fix".

---

## 4. Privileged functions (`SECURITY DEFINER`)

| Scope | Count |
|---|---|
| `public` | **86** |
| `vote` | 3 |
| `sponsor` | 2 |
| `vault` | 2 |
| `pgbouncer` | 1 |
| **Total** | **94** |

`public` contains **1 000** functions in total because PostGIS, `vector` and `pg_trgm` are installed there — extension-owned functions must be excluded mechanically via `pg_depend` / `pg_extension`.

### 4.1 Executable-role counts — the advisor is wrong in both directions

| Advisor claim | Reality |
|---|---|
| 39 anon-executable | Includes **3 PostGIS `st_estimatedextent` overloads** (extension-owned) → app-owned = 36, **but** |
| | **omits** `sponsor.attribute_order` + `sponsor.rollup_roi_daily`, which **are** anon-executable and reachable because `sponsor` is exposed → **app-owned anon-executable = 38** |
| 65 authenticated-executable | app-owned = **62** |
| 1 mutable `search_path` | ✅ exactly 1: `public.trigger_set_timestamps` |

### 4.2 Actionable classification (SB-003 input)

**MOVE-PRIVATE — 7 functions called from RLS policy expressions. Revoking EXECUTE breaks RLS.**
`acting_landlord_ids`, `has_role`, `is_admin`, `is_moderator`, `partner_ids_for_user`, `partner_is_active`, `partner_organization_ids_for_user`
→ relocate to a non-exposed `private` schema, `GRANT USAGE`/`GRANT EXECUTE` there, re-point policies. Supabase: *"Never create a `security definer` function in a schema listed under Exposed schemas."*

**REVOKE-NOW — 8 trigger-only functions wrongly carrying `anon` EXECUTE** (triggers fire as table owner; EXECUTE is not needed):
`compute_lead_score`, `enqueue_embedding_job`, `fn_apply_approval_decision`, `fn_audit_outbox`, `fn_outbox_set_updated_at`, `fn_outbox_suppression_check`, `guard_booking_partner_decision`, `handle_new_user`

**search_path is already clean — this is NOT a programme of work.**
All app-owned `SECURITY DEFINER` functions already pin `search_path`: **0 lack it** (verified: `proconfig` present with a `search_path=` entry on every one). The single `function_search_path_mutable` advisor finding is `public.trigger_set_timestamps`, which is **not** `SECURITY DEFINER` (`prosecdef = false`) and carries no privilege. The other **891** functions without a pinned `search_path` are extension-owned (`_postgis_*`, `st_*`, `pg_trgm` helpers) and out of scope.

→ **SB-003's search_path remediation is one non-privileged trigger function, not a hardening programme.** Do not size this task around the raw advisor count.

**EXCLUDE — extension-owned:** 3 × `st_estimatedextent` (PostGIS); all else in `public` owned by `postgis`/`vector`/`pg_trgm`.

**UNKNOWN-PRESERVE:** every remaining app-owned definer not proven safe → classify in SB-003 Batch 0.

**Precedent:** `bookings_validate_event_resource()` already has no EXECUTE — revoked by `20260610021420_san492_revoke_trigger_fn_execute` (recovered in `migration-drift.md` §2.2). That is the exact pattern to repeat.

---

## 5. Extensions

| Extension | Version | Schema | Note |
|---|---|---|---|
| `postgis` | 3.3.7 | **`public`** ⚠️ | not relocatable since 2.3 |
| `vector` | 0.8.0 | **`public`** ⚠️ | relocation would jeopardise existing `vector(…)` columns |
| `pg_trgm` | 1.6 | **`public`** ⚠️ | |
| `pg_stat_statements` | 1.11 | `extensions` | qualify as `extensions.pg_stat_statements` |
| `pg_net` | 0.19.5 | `extensions` | owns `net._http_response` (bloat finding) |
| `pg_cron` | 1.6.4 | `pg_catalog` | 6 active jobs (§6.2) |
| `index_advisor` | 0.2.0 | `extensions` | **reuse for SB-009** |
| `hypopg` | 1.4.1 | `extensions` | hypothetical indexes |
| `supabase_vault` | 0.3.1 | `vault` | holds cron secrets |
| `pgcrypto`, `citext`, `uuid-ossp` | — | `extensions` | |

**`extension_in_public` (lint 0014) → documented exception.** The three WARNs stand. PostGIS cannot move via `ALTER EXTENSION … SET SCHEMA` (needs dump → `DROP EXTENSION postgis CASCADE` → `CREATE EXTENSION postgis SCHEMA extensions` → restore, or a Support-assisted `extrelocatable` flip); moving `vector`/`pg_trgm` risks existing column types. **Not in scope for this epic** — see <https://supabase.com/docs/guides/database/extensions/postgis>.

---

## 6. Triggers

**71** triggers in `public`, all mapped to their trigger functions (`pg_trigger.tgfoid → pg_proc`).

### 6.1 Realtime producers — 9 triggers on 5 tables, with duplicates

| Table | Trigger | Function | Problem |
|---|---|---|---|
| `trips` | `trigger_trips_broadcast` | `broadcast_trips_changes` | emits `trip:{id}:meta` |
| `trips` | `trips_realtime_broadcast` | `realtime_broadcast_trips` | **same topic → duplicate delivery** |
| `trip_items` | `trigger_trip_items_broadcast` | `broadcast_trip_items_changes` | emits `trip:{id}:items` |
| `trip_items` | `trip_items_realtime_broadcast` | `realtime_broadcast_trip_items` | **same topic → duplicate** |
| `proactive_suggestions` | `trigger_suggestions_broadcast` | `broadcast_suggestions_changes` | `user:{id}:notifications` via `realtime.send(...,TRUE)` |
| `proactive_suggestions` | `trigger_broadcast_proactive_suggestions` | `broadcast_proactive_suggestions_changes` | same topic via **legacy `pg_notify`** |
| `event_attendees` | `event_attendees_broadcast_trigger` | `broadcast_event_attendees_changes` | `host-event-dashboard:*` + `staff-checkin:*`, sent **`false` = PUBLIC** |
| `event_check_ins` | `event_check_ins_broadcast_trigger` | `broadcast_event_dashboard_changes` | sent **`false` = PUBLIC** |
| `event_orders` | `event_orders_broadcast_trigger` | `broadcast_event_dashboard_changes` | sent **`false` = PUBLIC** |

**Orphan broadcast functions with NO trigger (dead code):** `broadcast_vote_tally_changes`, `broadcast_messages_changes`, `broadcast_agent_jobs_changes`, `realtime_broadcast_messages`, `realtime_broadcast_agent_jobs` — so `vote:tally:*`, `conversation:{id}:messages` and `job:{id}:status` never fire from the database.

**Publication** `supabase_realtime`: `public.event_attendees`, `public.event_check_ins`, `public.event_orders`, `public.leads`, `vote.entity_tally`.

**`realtime.messages` RLS:** exactly **3** policies — `rt_host_event_dashboard_select`, `rt_staff_checkin_select`, `rt_vote_tally_select`. **None** for `trip:*`, `trip:*:items`, `user:*:notifications`, `job:*:status`.

⚠️ **The model is inconsistent in both directions:** the three policies protect topics whose producers send **public** messages (`realtime.send(..., false)`), while the private-by-default `broadcast_changes` topics have **no** policy. → SB-007 / **RT-001 (Phase 1)**.

### 6.2 Scheduled jobs (pg_cron, 6 active)

| Job | Schedule | Action |
|---|---|---|
| 2 | `*/5 * * * *` | `net.http_post` → `/functions/v1/lead-reminder-tick` with `X-Cron-Secret` from `vault.decrypted_secrets` ⚠️ **load-bearing dependency on a live-only Edge Function** |
| 3 | `10 3 * * *` | `public.snapshot_analytics_events_daily(current_date - 1)` |
| 8 | `*/5 * * * *` | expire `event_wait_list` holds + `fn_notify_next_in_line()` |
| 10 | `0 4 * * *` | delete `agent_tool_calls` older than 30 days |
| 16 | `0 6 * * *` | mark stale `conversations` abandoned |
| 17 | `0 14 * * *` | mark stale `leads` |

---

## 7. Ownership classification

| Class | Objects |
|---|---|
| **KEEP** | 131 of 132 `public` tables (all MDE application + `mastra_*`); the 10 `sponsor` tables; `public`/`sponsor` policies |
| **MOVE-PRIVATE** | 7 RLS-helper functions (§4.2) |
| **REMOVE-CANDIDATE** | 8 `fashionos_*` tables (→ SB-002); 5 trigger-less broadcast functions; 1 legacy `pg_notify` realtime path |
| **UNKNOWN-PRESERVE** | `spatial_ref_sys` + PostGIS/vector/pg_trgm extension objects; 14 auxiliary tables in `marketing`/`openclaw`/`outreach`/`paperclip`/`postiz` (not MDE, not exposed); all `auth`/`storage`/`vault`/`net`/`cron`/`realtime` managed objects |

---

## 8. Evidence gaps / follow-ups for later tasks

| Item | Status |
|---|---|
| Machine-readable table/RLS/grant/default-privilege inventory | ✅ **DONE** — [`snapshots/schema-exposure-2026-09-17.json`](./snapshots/schema-exposure-2026-09-17.json) |
| Machine-readable privileged-function inventory | ✅ **DONE** — [`snapshots/privileged-functions-2026-09-17.json`](./snapshots/privileged-functions-2026-09-17.json) |
| Advisor snapshots (security 05:16:58Z / performance 05:16:59Z) | ✅ **DONE** — [`snapshots/advisors-2026-09-17.json`](./snapshots/advisors-2026-09-17.json) |
| Generated-types diff | ✅ **DONE** (structural) — [`snapshots/generated-types-drift-2026-09-17.md`](./snapshots/generated-types-drift-2026-09-17.md). Table drift is *exactly* the 8 `fashionos_*` tables (SB-002 removes them); **zero** real function drift — all 37 differences are `RETURNS trigger`, which the generator legitimately excludes. Authoritative regeneration still needs a linked project or a working local stack. |
| Migration ledger reconciliation | ✅ **DONE — 109/109 MATCHED**, 0 local-only, 0 remote-only. Repair executed 2026-09-17 with `supabase migration repair --status applied 20260611160000`. See [`migration-drift.md`](./migration-drift.md) §2.3 |
| Local `db reset` replay proof | ⚠️ **blocked by a CLI environment fault, not a migration fault.** In a shifted-port workdir the Postgres container started (`supabase_db_mdeapp-verify` Up on 54422), but `supabase db reset` failed at "Initialising schema..." with `NotFound: FileSystem.readFile (/home/sk/.supabase/profile)` — the CLI profile file does not exist on this machine. Worth resolving before SB-010 Gate 1, which depends on replay. Note also that `[db.seed] enabled = true` points at `./seed.sql`, which does not exist. |
| `sponsor`/`vote` DEFINER exposure cannot be proven from Advisors | SB-003 — reconcile from this inventory (the advisor blind spot is recorded in §4.1) |
| Per-function `search_path` values | ✅ recorded as a conclusion: **0** app-owned definer functions lack a pinned `search_path`; the single advisor finding is the non-privileged `trigger_set_timestamps` (§4.2). The full per-function `proconfig` dump belongs to the SB-001 harness re-run. |
