# Release & Runtime Audit — MDE AI (Phase A prelaunch)

- **Audit date:** 2026-10-21 (UTC), audit window ~17:20–17:30Z
- **Auditor:** release-auditor (delegated teammate)
- **Doctrine:** read-only. No deploy, promote, rollback, merge, or env mutation. Only this file written.
- **Secrets:** all tokens/passwords redacted. No env values printed; env section is key names only.

---

## 0. Headline

| Question | Answer |
| --- | --- |
| Deployed commit | `5d1d76ddf6c2` — **exactly equal to `origin/main` HEAD**, zero drift |
| Production state | `READY` / `PROMOTED`, production target, healthy, all audited pages HTTP 200 |
| Main green? | **Partially.** Required gate (`Floor`) green on the merge commit; but scheduled `Prod behaviour smoke` has failed **6 consecutive runs** (~22.7h) on a real product assertion |
| Migration drift | **None.** 207 applied = 207 on `origin/main` (2 archived files excluded by design) |
| Supabase prod | `ACTIVE_HEALTHY`, Postgres 17, 349 MB |
| Top risk | `Prod behaviour smoke`: "peso budget is disclosed, never silently capped" FAILs on the **serving** deployment — a live product/behaviour regression, not deploy drift |

---

## 1. GitHub `main` health

### 1.1 HEAD

```
$ git fetch origin main
$ git rev-parse origin/main
5d1d76ddf6c26ca8996c4e121a87b584c3a2971b
$ git log -1 --format='%H%n%ci%n%s' origin/main
5d1d76ddf6c26ca8996c4e121a87b584c3a2971b
2026-10-20 11:09:48 -0500        (= 2026-10-20T16:09:48Z)
Merge pull request #444 from amoai-tech/fix/rental-currency-cue
```

PR #444 ("Rentals: Clearly label USD prices on apartment cards and details") merged at
`2026-10-20T16:09:49Z`, merge commit `5d1d76dd…` (`gh pr view 444` → `state: MERGED`,
`reviewDecision: REVIEW_REQUIRED`, i.e. the approval was not recorded on the PR).

### 1.2 Last 10 workflow runs (`gh run list -b main --limit 12`)

| # | Workflow | Event | Conclusion | Created (UTC) | URL |
| --- | --- | --- | --- | --- | --- |
| 1 | Prod behaviour smoke | schedule | **failure** | 2026-10-21T17:06:34Z | https://github.com/amoai-tech/mdeai/actions/runs/39640824602 |
| 2 | Prod renter journey | schedule | success | 2026-10-21T14:30:35Z | …/runs/39617403713 |
| 3 | Production Runtime Smoke | schedule | success | 2026-10-21T14:23:23Z | …/runs/39616410735 |
| 4 | VEB-MVP-010 integration | schedule | skipped | 2026-10-21T12:49:38Z | …/runs/39602729124 |
| 5 | Prod behaviour smoke | schedule | **failure** | 2026-10-21T11:40:36Z | …/runs/39593708926 |
| 6 | Prod behaviour smoke | schedule | **failure** | 2026-10-21T05:58:35Z | …/runs/39552611874 |
| 7 | Prod behaviour smoke | schedule | **failure** | 2026-10-21T00:53:07Z | …/runs/39524000186 |
| 8 | Prod behaviour smoke | schedule | **failure** | 2026-10-20T22:15:08Z | …/runs/39506717750 |
| 9 | Prod behaviour smoke | schedule | **failure** | 2026-10-20T18:42:33Z | …/runs/39477109386 |
| 10 | Candidate Runtime Certification | repository_dispatch | skipped | 2026-10-20T16:51:37Z | …/runs/39461116168 |

Run URLs are `https://github.com/amoai-tech/mdeai/actions/runs/<id>`.

- **Latest failed:** `Prod behaviour smoke` @ 2026-10-21T17:06:34Z (id 39640824602), `headSha=5d1d76dd…`.
- **Latest successful:** `Prod renter journey` @ 2026-10-21T14:30:35Z (id 39617403713).
- **Last green `Prod behaviour smoke`:** 2026-10-20T14:16:12Z (id 39437682818, success). Every run since is red —
  i.e. the workflow has been failing for **6 runs / ~22.7 h**, starting *after* `5d1d76dd` was deployed.

### 1.3 Required gate on the deployed commit

```
$ gh run list --commit 5d1d76ddf6c26ca8996c4e121a87b584c3a2971b
1 success  Floor                        push                 main
1 success  Prod deploy freshness        push                 main
1 success  Prod renter journey          schedule             main
1 success  Production Runtime Smoke     repository_dispatch  main
1 success  Production Runtime Smoke     schedule             main
1 success  Candidate Runtime Certification repository_dispatch main
6 failure  Prod behaviour smoke         schedule             main
6 skipped  Candidate Runtime Certification repository_dispatch main
1 skipped  VEB-MVP-010 integration      schedule             main
```

`Floor` — the only *required* status check on `main` — **passed** on this commit (push event).
The red signal is the scheduled production behaviour verification, which is advisory for merge but
material for release certification.

### 1.4 CI verdict

**Main is not fully green.** Distinguish the layers:

- Merge gate: **green** (`Floor` success on `5d1d76dd`).
- Production verification: **red** on one assertion, repeatedly, deterministically.
- Adjacent prod checks (`Prod renter journey`, `Production Runtime Smoke`) **pass**, so the site is
  up and the renter journey works; the failure is narrower than "production is down".

### 1.5 Open PRs

```
$ gh pr list --state open --limit 100 --json number,baseRefName --jq 'group_by(.baseRefName)|…'
[{"base":"ai/san-1560-public-event-catalog-truth","count":1},
 {"base":"ai/san693-contact","count":1},
 {"base":"feat/san-705-partner-agent","count":1},
 {"base":"feat/san-709-ai-signup","count":1},
 {"base":"main","count":39}]
OPEN PR COUNT: 43
```

- **39 PRs target `main`**; 4 are stacked on feature branches (not `main`): `ai/san-1560-public-event-catalog-truth`, `ai/san693-contact`, `feat/san-705-partner-agent`, `feat/san-709-ai-signup`.
- **43 open PRs total** is a large unreleased backlog immediately before Phase A launch — a scoping
  decision, not a deploy defect.

---

## 2. Vercel production state

### 2.1 Project

```
$ curl -s "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_TEAM_ID" -H "Authorization: Bearer <redacted>"
```

- name: **`mdeai`**, framework `nextjs`, plan `pro`, type `LAMBDAS`, region `sfo1`
- id: **`prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB`**
- team: `team_OPBk3bdOXAg6fpYnL4vxnLZd`
- owner/creator account: `amo-1000` (`amo@ipix.co`, GitHub `amoai-tech`)

### 2.2 Domains / aliases (`/v9/projects/<id>/domains`)

| Domain | Role | Redirect | Verified |
| --- | --- | --- | --- |
| `mdeai.co` | apex | 308 → `www.mdeai.co` | yes |
| `www.mdeai.co` | **primary production domain** | — | yes |
| `mdeai-gamma.vercel.app` | Vercel-generated | — | yes |

Deployment-level aliases on the production deployment: `mdeai-amoco.vercel.app`,
`mdeai-git-main-amoco.vercel.app` (both Vercel SSO-protected — see §3).

### 2.3 Latest production deployment

```
$ curl -s "https://api.vercel.com/v13/deployments/dpl_HvShr4ZcvnF1zoMrdHs25qbxCKoH?teamId=$VERCEL_TEAM_ID" -H "Authorization: Bearer <redacted>"
```

| Field | Value |
| --- | --- |
| id | `dpl_HvShr4ZcvnF1zoMrdHs25qbxCKoH` |
| state | **`READY`** (readySubstate `PROMOTED`) |
| target | `production` |
| created | **2026-10-20T16:09:52Z** |
| creator | `amoco-1000` |
| commit sha | **`5d1d76ddf6c26ca8996c4e121a87b584c3a2971b`** |
| commit ref | `main` |
| commit message | `Merge pull request #444 from amoai-tech/fix/rental-currency-cue` / `Rentals: Clearly label USD prices on apartment cards and details` |
| aliases | `mdeai-amoco.vercel.app`, `mdeai-git-main-amoco.vercel.app` |

**Age vs today (2026-10-21T17:26:35Z): 25.3 hours.**

### 2.4 Deployed vs `origin/main` — drift

| | SHA |
| --- | --- |
| `origin/main` HEAD | `5d1d76ddf6c26ca8996c4e121a87b584c3a2971b` |
| Production deployment commit | `5d1d76ddf6c26ca8996c4e121a87b584c3a2971b` |
| **Drift** | **NONE — identical** |

Independently corroborated by the CI job itself, which reports the served fingerprint:
`PASS production deployment is successful and matches main — 5d1d76ddf; served fingerprint=ada08dec51a2c26c deployed=5d1d76ddf main=5d1d76ddf`.

### 2.5 Deployment history (last 100 deployments, `/v6/deployments`)

```
sample size: 100 | production: 17 | preview: 83
state counts overall: {'READY': 80, 'CANCELED': 20}
```

- **0 `ERROR` deployments** in the sample window — no build failures promoted or otherwise.
- **17 production deployments** (13 `READY`, 4 `CANCELED`), all on 2026-10-20, the last being `5d1d76dd`.
- **83 preview deployments** (67 `READY`, 16 `CANCELED`) in the same window.
- Recent production sequence (newest first): `5d1d76dd` READY 16:09Z → `25e40bce` READY 15:39Z →
  `acb78f56` READY 15:28Z → `d19d7fd8` READY 15:21Z → **CANCELED 15:11Z** → **CANCELED 15:02Z** →
  `f52fcd6b` READY 14:45Z → **CANCELED 14:45Z** → `a8e1172` READY 14:34Z → `d0bcfec` READY 14:13Z.
- **ERROR/CANCELED sample:** only `CANCELED` — 16 preview, 4 production (e.g. `dpl_HJiKxzz…` and
  `dpl_4MECnXT…`, both `target=production`, 2026-10-20 15:11Z / 15:02Z, ref `main`).
  These are **superseded-queue cancellations during the 2026-10-20 merge burst**, not build errors.
- Note: v13 deployments API returns `{"error":{"code":"bad_request","message":"Invalid API version"}}`;
  `v6/deployments` is the working read endpoint.

---

## 3. Production HTTP checks

Command pattern (`no redirect following`, status + redirect only, no form submissions, no data writes):

```
curl -sS -o /dev/null --max-time 30 -w '%{http_code} %{redirect_url}\n' "<url><path>"
```

### `https://www.mdeai.co` (primary production domain)

| Path | Status | Redirect |
| --- | --- | --- |
| `/` | **200** | — |
| `/rentals` | **200** | — |
| `/events` | **200** | — |
| `/chat` | **200** | — |
| `/restaurants` | **200** | — |
| `/login` | **200** | — |

### `https://mdeai.co` (apex)

| Path | Status | Redirect |
| --- | --- | --- |
| `/` | 308 | `https://www.mdeai.co/` |
| `/login` | 308 | `https://www.mdeai.co/login` |

**All six production pages return 200 on `www.mdeai.co`; the apex canonicalises to `www` via 308.**
No auth redirect to `/login` was observed (`/login` itself is 200, as expected for the public form).

### `https://mdeai-amoco.vercel.app` (deployment hostname)

```
/            302 https://vercel.com/sso-api?url=…&nonce=…
/rentals     302 https://vercel.com/sso-api?url=…
/events      302 https://vercel.com/sso-api?url=…
/chat        302 https://vercel.com/sso-api?url=…
/restaurants 302 https://vercel.com/sso-api?url=…
/login       302 https://vercel.com/sso-api?url=…
```

This is **Vercel Deployment Protection (SSO) on the `*.vercel.app` hostname**, not an application
fault. The canonical domain `www.mdeai.co` is public and 200. Any probe pointed at the
`*.vercel.app` alias will read 302 and must not be interpreted as downtime.

---

## 4. Supabase production status

### 4.1 Project

```
$ curl -s "https://api.supabase.com/v1/projects/zkwcbyxiwklihegjhuql" -H "Authorization: Bearer <redacted>"
{"id":"zkwcbyxiwklihegjhuql","name":"medellin","status":"ACTIVE_HEALTHY",
 "region":"us-east-1","created_at":"2025-12-22T14:54:02Z",
 "database":{"host":"db.zkwcbyxiwklihegjhuql.supabase.co","version":"17.6.1.063","postgres_engine":"17","release_channel":"ga"}}
```

### 4.2 Database size

```
$ /tmp/mde_sql.sh "select pg_size_pretty(pg_database_size(current_database())) as db_size;"
[{"db_size":"349 MB"}]
```

### 4.3 Migrations — live DB vs `origin/main`

Important correction: the local worktree is **not** on `main` (`HEAD` = `ai/san-1332-frozen-canary`,
3 ahead / **1061 behind** `origin/main`). Counting migration files from the working tree is therefore
wrong; the comparison below uses the **`origin/main` tree**.

```
$ git ls-tree -r --name-only origin/main -- supabase/migrations/ | grep -E '\.sql$' | wc -l
209
(excluding the 2 files under supabase/migrations/_archive-not-on-remote/ → 207 applied-candidate files)

$ /tmp/mde_sql.sh "select count(*) from supabase_migrations.schema_migrations;"
[{"count":207}]
```

Set difference:

```
origin/main live migration files: 207
origin/main archived (not applied by design): 2
   20260430140000_landlord_v1_base_tables_stub.sql
   20260516120000_rls_audit_fixes.sql
applied in live DB: 207
DB-applied not on main: []
main not in DB: []
DRIFT: NONE
```

**Latest applied migration (live DB):**

| version | name |
| --- | --- |
| `20261021070000` | `san1502_phase_a_pending_rental_search` |
| `20261021060000` | `san1305_restore_fts_hybrid_search` |
| `20261021050000` | `san1556_destination_photos` |
| `20261021040000` | `san1470_contest_accepted_leaderboard` |
| `20261021030000` | `san1548_event_approval_id` |
| `20261021020000` | `san1524_hide_test_fixture_contests` |
| `20261021010000` | `san1281_applied_migration_versions` |
| `20261021000000` | `san1497_contest_wide_recompute` |

(Caveat: `schema_migrations` has **no `inserted_at` column** — columns are `version`, `statements`,
`name`, `created_by`, `idempotency_key`, `rollback` — so ordering is by `version`, not apply time.
"Latest applied" = highest version present, not necessarily applied most recently.)

**Migration verdict: production DB matches `origin/main` exactly; nothing unapplied, nothing extra.**

---

## 5. Environment contract / drift

### 5.1 `.env` vs `.env.local` — key **names** only (no values read or printed)

```
$ python3 (parse KEY= names, filter prefixes VERCEL_, SUPABASE_, DATABASE_URL, GOOGLE_)
.env present: True | .env.local present: True
only in .env       : ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_MAPS_SERVER_API_KEY',
                      'SUPABASE_ACCESS_TOKEN', 'VERCEL_TEAM_ID']
only in .env.local : ['GOOGLE_API_KEY', 'SUPABASE_DB_URL', 'SUPABASE_PERSONAL_ACCESS_TOKEN',
                      'VERCEL_OIDC_TOKEN']
in both            : 9
ALL .env keys      : 29   ALL .env.local keys: 51
```

Observed drift (presence only, never values):

- `GOOGLE_GENERATIVE_AI_API_KEY` + `GOOGLE_MAPS_SERVER_API_KEY` exist **only** in `.env`;
  `GOOGLE_API_KEY` exists **only** in `.env.local` — the Gemini provider key name differs per file.
- `VERCEL_TEAM_ID` only in `.env`; `VERCEL_OIDC_TOKEN` only in `.env.local` — consistent with
  AGENTS.md's warning that `.env` and `.env.local` disagree on `VERCEL_*`.
- `SUPABASE_ACCESS_TOKEN` (`.env`) vs `SUPABASE_PERSONAL_ACCESS_TOKEN` (`.env.local`);
  `SUPABASE_DB_URL` only in `.env.local`. This audit used the `.env` set.

### 5.2 `npm run check:env:ci`

Two runs, deliberately:

**(a) With no exported env** (the documented fresh-worktree trap):

```
$ npm run check:env:ci
env-contract: FAIL — 3 required variable(s) missing: NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
```

This is expected behaviour, not a repository defect.

**(b) After exporting the required keys from `.env`** (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`…_ANON_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`):

```
$ set -a && source .env && set +a && export NEXT_PUBLIC_SUPABASE_URL …
$ npm run check:env:ci
env-contract: OK
REAL_EXIT=0
```

**Env contract result: PASS (exit 0)** when `.env` is sourced. Safe, read-only; no env file was modified.

---

## 6. Release truth summary

### 6.1 What is actually deployed

Production is serving Vercel deployment `dpl_HvShr4ZcvnF1zoMrdHs25qbxCKoH` (`READY`/`PROMOTED`) on
`www.mdeai.co` (apex `mdeai.co` 308→www), built from `main` commit
`5d1d76ddf6c26ca8996c4e121a87b584c3a2971b` — "Merge pull request #444 … Rentals: Clearly label USD
prices" — created 2026-10-20T16:09:52Z, **25.3 h old**, zero drift against `origin/main`. All six
audited pages return 200. Supabase production (`medellin`, `ACTIVE_HEALTHY`, PG 17, 349 MB) is
schema-synchronised with `main` (207/207 migrations, no drift). The repo's `env-contract` passes.

### 6.2 Is it current with main?

**Yes — exactly.** Deployed sha == `origin/main` HEAD, and `prod-deploy-freshness` plus the smoke
job's own served-build fingerprint both confirm parity. There is no stale-deploy problem.

### 6.3 Is main green?

**Not fully.** `Floor` (the only required check) passed on the deployed commit, and three
production suites pass. But `Prod behaviour smoke` has failed **6 consecutive scheduled runs over
~22.7 h**, starting after this deployment, on a genuine product assertion — so the release is
*current and up*, but a real behaviour verification is red.

### 6.4 Concrete release risks

1. **Red production behaviour check on the serving build (highest severity).**
   `Prod behaviour smoke` (run 39640824602, 2026-10-21T17:06:34Z) fails two assertions:
   `FAIL desktop: peso budget is disclosed, never silently capped — budget disclosure present: false`
   and the same at `390px`. Everything else in that run passes: served-build fingerprint,
   validation-error safety, rental fast path, no uncaught exceptions, no horizontal overflow.
   Because the deployment matches `main`, this is a **live product regression on the deployed
   commit**, not drift. Timing correlation: last green smoke 2026-10-20T14:16:12Z; several production
   deploys occurred that afternoon; first red 2026-10-20T18:42:33Z; deployed commit `5d1d76dd`
   (#444, currency/price labelling) is USD-labelling work adjacent to a peso-budget disclosure.
   **Exact introducing commit: Unknown** without a bisect. Phase A blockers: a currency/budget
   disclosure that silently caps or omits peso budget on rental cards is a user-facing pricing-truth
   defect.

2. **Release verification cannot currently certify "green".**
   Adjacent suites pass (`Prod renter journey` 14:30Z, `Production Runtime Smoke` 14:23Z), so the
   signal is inconsistent — a release sign-off that cites only `Floor` would overstate readiness.
   Treat `Prod behaviour smoke` red as an open blocker until it is green on the serving build.

3. **43 open PRs, 39 against `main`, immediately pre-launch.** Large unreleased backlog; the launch
   scope decision (what must ship vs defer) is unresolved. This is planning risk, not deploy risk.

4. **Env-file contract drift (names).** `GOOGLE_API_KEY` vs `GOOGLE_GENERATIVE_AI_API_KEY`,
   `VERCEL_TEAM_ID` only in `.env`, `VERCEL_OIDC_TOKEN` only in `.env.local`,
   `SUPABASE_ACCESS_TOKEN` vs `SUPABASE_PERSONAL_ACCESS_TOKEN`, `SUPABASE_DB_URL` only in
   `.env.local`. Any script that sources only one file sees a different contract; `check:env:ci`
   only passes when the right set is exported. No values were compared, so a *value* mismatch
   between the files remains **Unknown**.

5. **Stale local checkout can mislead release checks.** This worktree is on `ai/san-1332-frozen-canary`
   (3 ahead, 1061 behind `main`); its `supabase/migrations` has 127 files vs 207 on `main`, which
   initially *looks* like 80 missing migrations. It is not drift — it is a stale branch. Anyone
   auditing migrations from a random worktree will get false positives; always use the
   `origin/main` tree.

6. **Governance note (not a deploy blocker).** PR #444, which produced the deployed commit, shows
   `reviewDecision: REVIEW_REQUIRED` despite being merged — approval evidence is absent on that PR
   record even though the merge is legitimate by other means. Worth a process look.

7. **Deploy-queue noise.** 4 production and 16 preview `CANCELED` deployments on 2026-10-20 during
   the merge burst. No `ERROR` builds. Cancellations are superseded-queue effects and did not leave
   a bad artifact promoted; no action required beyond noting them.

### 6.5 Explicit unknowns

- Exact commit that introduced the peso-budget-disclosure failure — needs a bisect across the
  2026-10-20 production deploys.
- Whether `.env` and `.env.local` disagree on *values* for the 9 shared keys — out of scope by rule
  (names only).
- Supabase backup/PITR posture and any drift in RLS policies vs `main` — not part of this audit.
- Why `mdeai-gamma.vercel.app` exists as a separate verified domain (unused alias) — informational only.

### 6.6 Verification commands used (all read-only)

```
git fetch origin main; git rev-parse origin/main; git log -1 --format='%H%n%ci%n%s' origin/main
gh run list -b main --limit 12 --json databaseId,name,workflowName,event,conclusion,createdAt,headSha,url
gh run view 39640824602 --json conclusion,jobs; gh run view 39640824602 --log-failed
gh run list -w "Prod behaviour smoke" -b main --limit 12 --json conclusion,createdAt,url,databaseId
gh run list --commit 5d1d76ddf6c26ca8996c4e121a87b584c3a2971b
gh pr list --state open --limit 100 --json number,baseRefName; gh pr view 444/484
curl "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_TEAM_ID"  (+ /domains)
curl "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&limit=100"
curl "https://api.vercel.com/v13/deployments/dpl_HvShr4ZcvnF1zoMrdHs25qbxCKoH?teamId=$VERCEL_TEAM_ID"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' https://www.mdeai.co{/ ,/rentals,/events,/chat,/restaurants,/login}
curl "https://api.supabase.com/v1/projects/zkwcbyxiwklihegjhuql"
/tmp/mde_sql.sh "select pg_size_pretty(pg_database_size(current_database()))"
/tmp/mde_sql.sh "select count(*) from supabase_migrations.schema_migrations;"
/tmp/mde_sql.sh "select version,name from supabase_migrations.schema_migrations order by version desc limit 12;"
git ls-tree -r --name-only origin/main -- supabase/migrations/
npm run check:env:ci   (twice: bare, and with NEXT_PUBLIC_* exported from .env)
```

Every `curl` above was issued with the token from `.env` in an `Authorization: Bearer` header,
printed as `<redacted>`. **No state was changed anywhere: no deploy, promote, rollback, merge, env
edit, form submission, or database write.**
