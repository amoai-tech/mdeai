# Edge Functions — MDE Supabase (`zkwcbyxiwklihegjhuql`)

**Snapshot:** 2026-09-17, read-only (`list_edge_functions`) · **Comparison commit:** `a9a9eb931ae602568b2be61904f2dee886c45ec4`
**Owner task:** Task 48.2H.1 · MDE-SB-001 — Canonical Supabase Inventory

**Result: 39 ACTIVE deployments vs 4 repo directories → 4 MATCHED, 35 UNKNOWN-PRESERVE.**
This is the single largest provenance gap in the epic. Nothing may be deleted until the recovery path in §3 has run.

---

## 1. The four canonical (MATCHED) functions

| Slug | `verify_jwt` | Declared auth model | Repo path | Caller |
|---|---|---|---|---|
| `approval-commit` | **true** | user JWT → service-role writes (⚠️ defect, SB-004) | `supabase/functions/approval-commit/` | `/api/approval-commit` route |
| `chat-lead-capture` | **false** | optional anonymous; Bearer JWT validated in-function | `supabase/functions/chat-lead-capture/` | browser / Mastra tool |
| `ticket-checkout` | **false** | anonymous checkout; `buyer_email` + `access_token` carry identity | `supabase/functions/ticket-checkout/` | `/api/tickets/checkout` |
| `ticket-payment-webhook` | **false** | **Stripe HMAC signature verified** (`constructEventAsync`, L96) ✅ | `supabase/functions/ticket-payment-webhook/` | Stripe |

Every `verify_jwt=false` above is documented in its `config.toml` and matches Supabase's rule that all functions require a JWT unless explicitly disabled.

---

## 2. Provenance failures (35 UNKNOWN-PRESERVE)

Distribution of the live `entrypoint_path` values:

| Provenance pattern | Meaning | Count |
|---|---|---|
| `/home/sk/mde/supabase/functions/**` | legacy frozen tree — `mde/` accepts only P0 fixes since 2026-05-26 | most |
| `/tmp/user_fn_*` | deployed from an ephemeral path; **source is unrecoverable from the path alone** | several |
| `/home/sk/mdeai/mdeapp/supabase/functions/approval-commit/index.ts` | **path no longer exists** — the `mdeapp/` subdirectory was consolidated away | 1 |
| `/home/sk/mde/.claude/worktrees/practical-carson-f17be4/...` | an abandoned worktree | 1 |
| `/home/sk/mdeai/supabase/functions/**` | current canonical tree | 2 |

### 2.1 ⚠️ The unmatched functions are load-bearing, not dead

`pg_cron` **job 2** calls `https://<ref>.supabase.co/functions/v1/lead-reminder-tick` **every 5 minutes**, authenticating with `X-Cron-Secret` read from `vault.decrypted_secrets`. `lead-reminder-tick` has **no repo source**.

**Therefore: deleting "unmatched" live functions stops production silently.** Every one of the 35 is `UNKNOWN-PRESERVE` until its caller set is proven.

### 2.2 Known DB-side callers

| Caller | Target | Evidence |
|---|---|---|
| `cron.job` id 2 (`*/5 * * * *`) | `lead-reminder-tick` | `net.http_post` + vault secret |
| (others) | none found via `pg_proc` scan for `functions/v1` / `net.http_post` outside job 2 | — |

### 2.3 `verify_jwt` spread across the 35

Mixed and undeclared in Git. `ticket-validate`, `vote-cast`, `sponsor-*`, `openclaw-*`, `outreach`-related and `postiz-*` functions include several `verify_jwt=false` deployments whose in-function verification cannot be assessed because **there is no source**. This is the core risk SB-008 must close.

---

## 3. Required recovery path (official, before any rewrite or deletion)

1. Check `docs/tasks/backup/edge-functions-2026-05-24/deployed-live/` — the repo may already hold a live Edge snapshot from an earlier audit.
2. Otherwise run **`supabase functions download <slug>`** for all 35 slugs, commit the recovered source, and only then reconcile, rewrite or retire.
3. Add a `supabase/config.toml` `[functions.<slug>]` block per function so auth mode is declared in Git rather than living only in cloud metadata.
4. Re-run `list_edge_functions` and prove every ACTIVE slug maps to a repo path + auth mode + commit, or is explicitly `UNKNOWN-PRESERVE`.

**Blocker:** `supabase functions download` needs a linked project / `SUPABASE_ACCESS_TOKEN`, which this workspace does not have (see `migration-drift.md` §2.3). Recovery therefore starts by establishing credentials.

---

## 4. CORS defect (affects every function using `_shared/http.ts`)

```ts
const IS_PRODUCTION = Deno.env.get("ENVIRONMENT") === "production";
```

* `isOriginAllowed()` returns `true` for **any** `https://*.vercel.app` origin.
* `ENVIRONMENT` appears **nowhere else in the repository** — if it is unset in the Edge runtime, `IS_PRODUCTION` is `false` and **every localhost origin is also allowed in production**.

**Fix (SB-008): fail closed.** Treat "unset" as production, or replace the mechanism with an explicit allowlist that has no environment dependency. Do not merely remove the `.vercel.app` wildcard.

---

## 5. Classification summary

| Class | Count | Objects |
|---|---|---|
| **MATCHED** | 4 | `approval-commit`, `chat-lead-capture`, `ticket-checkout`, `ticket-payment-webhook` |
| **LIVE_ONLY** | 35 | all others — pending `functions download` |
| **REPO_ONLY** | 0 | — |
| **UNKNOWN-PRESERVE** | 35 | same set as LIVE_ONLY until source is recovered and callers proven |
