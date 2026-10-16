# SAN-1523 · Embedding worker — production rollout runbook (PR 1 of 2)

SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep Semantic Search Current.
Scope: PR #341 only. No cron schedule (PR 2). **Nothing here has been run against production.**
Every step marked **[OWNER]** is a production action that needs the owner's explicit go-ahead at that step.
Approval for one step is not approval for the next.

Project ref: `zkwcbyxiwklihegjhuql`. Secrets are never pasted into chat, tickets or logs; commands read them from the shell environment.

## 0. Prerequisites (all must be true, or STOP)

| # | Requirement | How to check | STOP if |
|---|---|---|---|
| 0.1 | PR #341 has one human approval, `floor`, `supabase-acl`, `mastra-schema-init`, `deterministic chromium` green on the exact head, and is **merged to `main`** | `gh pr view 341 --json state,mergeStateStatus,reviewDecision` | not `MERGED` |
| 0.2 | **`main` contains every migration production already applied.** `supabase db push` refuses to run when production's history has versions missing locally ("Remote migration versions not found in local migrations directory"). Production was last read (2026-10-16) as holding SAN-1502 `20261016162000`, `180000`, `190000`, `210000` (PR #342), `20261016200000` (PR #351) and `20261016230000_vote_my_receipt` (PR #345). #342 and #351 are on `main`; **#345 is not until it merges** — it was applied from its branch, and #341 originally collided with it, which is why this migration is `20261017010000`. | step 2.3 below | any `REMOTE`-only version. Merge the owning PR; do **not** `migration repair` production history to get around it |
| 0.3 | `20261017010000` is later than every applied version | step 2.3 | it sorts before a remote version (needs `--include-all`; re-number instead) |
| 0.4 | The database password that was exposed in an earlier session has been rotated and `SUPABASE_DB_URL` uses the new one | owner confirms | not rotated |

## 1. Read-only baseline (record the numbers; compare after the apply)

Use a read-only session so a typo cannot write:

```bash
export PGOPTIONS='-c default_transaction_read_only=on'
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
-- queue state
select status, count(*) from public.embedding_jobs group by status order by status;
select entity_type, status, count(*) from public.embedding_jobs group by 1,2 order by 1,2;
-- entities and vectors (note both numbers per type)
select 'apartment'  as t, (select count(*) from public.apartments)   as entities, (select count(*) from public.listing_embeddings)    as vectors
union all select 'event',      (select count(*) from public.events),      (select count(*) from public.event_embeddings)
union all select 'restaurant', (select count(*) from public.restaurants), (select count(*) from public.restaurant_embeddings);
-- vector dimensions must be 768
select 'listing' as t, vector_dims(embedding) as dims, count(*) from public.listing_embeddings group by 2
union all select 'event',      vector_dims(embedding), count(*) from public.event_embeddings group by 2
union all select 'restaurant', vector_dims(embedding), count(*) from public.restaurant_embeddings group by 2;
-- the three triggers this migration drops and recreates must exist under exactly these names (any other trigger
-- calling the enqueue function would keep firing; harmless because jobs are deduplicated, but worth knowing)
select tgrelid::regclass as on_table, tgname from pg_trigger
 where tgfoid = 'public.enqueue_embedding_job'::regproc and not tgisinternal order by 1, 2;
-- applied migrations (latest first)
select version from supabase_migrations.schema_migrations order by version desc limit 8;
SQL
```

Last read (not independently re-verified by this runbook's author): 96–97 `pending` jobs, 0 attempts (67 apartment, 28 event, 1 restaurant); all three embedding columns `vector(768)`.

## 2. Release gate (repository + ledger + dry run)

```bash
git switch main && git pull --ff-only
git status --short                      # must print nothing
npm ci
npm run preflight:migration             # exit 0 required: branch main, clean tree, no untracked .sql in supabase/migrations
```

2.3 Ledger (read-only):

```bash
npx supabase migration list --db-url "$SUPABASE_DB_URL"
```

Expected: every row has both LOCAL and REMOTE **except** `20261017010000`, which is LOCAL only.
**STOP** on any REMOTE-only row (see 0.2) or any LOCAL-only row other than `20261017010000`.

2.4 Dry run (read-only, applies nothing):

```bash
npm run migration:dry-run
```

Expected manifest: **exactly one** file, `20261017010000_embedding_worker_pipeline.sql`.
**STOP** if anything else is listed. This is the check that stops an unreviewed migration reaching production.

## 3. What the migration changes (so the apply is not a surprise)

1. `embedding_jobs`: adds `lease_token`, `lease_expires_at`, `next_attempt_at` and the index `embedding_jobs_claim_idx` (additive; small table).
2. New functions: `embedding_document_for_entity`, `claim_embedding_jobs`, `complete_embedding_job`, `fail_embedding_job` (`EXECUTE` for `service_role` only; revoked from `PUBLIC`, `anon`, `authenticated`), and `enqueue_embedding_job` (trigger function, `SECURITY DEFINER`, `search_path ''`).
3. The enqueue triggers on `apartments`, `events`, `restaurants` are **replaced** (no `WHEN` business gate; they fire on every semantic field). No data in those tables is modified.
4. One-time queue rebuild:
   - every existing `pending` job becomes `skipped` with `last_error = 'superseded: queue rebuilt by SAN-1523 (new document fingerprint)'` (history kept; rows are not deleted);
   - one new `pending` job is inserted per apartment/event/restaurant whose stored vector hash differs from the new document hash. Existing vectors were built with the old fingerprint, so **expect roughly one job per entity** (about the entity totals from step 1), not 96.
5. Nothing is scheduled. No vector is written by the migration.

**STOP before applying** if the SQL in the dry run is not this, or if step 1 shows a vector column that is not 768-dimensional.

## 4. Apply the migration — [OWNER] separate go-ahead

```bash
MDEAI_CONFIRM_PUSH=1 npm run push:migration
```

(runs preflight → dry run → confirmation gate → `supabase db push`). Read the manifest it prints before it pushes.

4.1 Verify (read-only):

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
select version from supabase_migrations.schema_migrations where version = '20261017010000';           -- 1 row
select column_name from information_schema.columns
 where table_schema='public' and table_name='embedding_jobs' and column_name in ('lease_token','lease_expires_at','next_attempt_at'); -- 3 rows
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role',  p.oid, 'execute') as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname in ('claim_embedding_jobs','complete_embedding_job','fail_embedding_job','embedding_document_for_entity');
                                                      -- anon=false, authenticated=false, service_role=true for all four
select count(*) as triggers_without_when
  from pg_trigger t where t.tgfoid = 'public.enqueue_embedding_job'::regproc and not t.tgisinternal and t.tgqual is null; -- 3
select status, count(*) from public.embedding_jobs group by status order by status;
        -- skipped >= the old 96; pending = one per entity needing a vector; processing = 0; done/failed = 0
SQL
```

**STOP** if any ACL is wider than stated, the trigger count is not 3, or `processing` is not 0.

## 5. Secrets and deploy — [OWNER]

Generate the cron secret in your own shell (never echo it; keep it only in your shell session / password manager, because PR 2 stores the same value in Vault):

```bash
export EMBEDDING_CRON_SECRET="$(openssl rand -hex 32)"
npx supabase secrets set EMBEDDING_CRON_SECRET="$EMBEDDING_CRON_SECRET" --project-ref zkwcbyxiwklihegjhuql
# the Gemini key must already be in your shell from your password manager / .env — do not paste it anywhere
npx supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY="$GOOGLE_GENERATIVE_AI_API_KEY" --project-ref zkwcbyxiwklihegjhuql
npx supabase secrets list --project-ref zkwcbyxiwklihegjhuql      # names + digests only; both names must be present
```

Deploy (`--no-verify-jwt` as well as the `[functions.process-embedding-jobs]` entry in `supabase/config.toml`, because the caller sends no user JWT):

```bash
npx supabase functions deploy process-embedding-jobs --project-ref zkwcbyxiwklihegjhuql --no-verify-jwt
```

5.1 Smoke test with no side effects:

```bash
URL="https://zkwcbyxiwklihegjhuql.supabase.co/functions/v1/process-embedding-jobs"
curl -s -o /dev/null -w "GET  (expect 405): %{http_code}\n" "$URL"
curl -s -o /dev/null -w "POST no secret (expect 401): %{http_code}\n" -X POST "$URL"
```

**STOP** if either answer differs. A `500 not_configured` means a secret is missing; a `401` from the platform before the function runs (JSON mentioning the JWT) means `verify_jwt` is still on: redeploy with `--no-verify-jwt`.

## 6. One real job, then five — [OWNER] go-ahead for each

6.1 One job:

```bash
curl -s -X POST "$URL" -H "x-cron-secret: $EMBEDDING_CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":1}'
```

Expected: HTTP 200 and `{"claimed":1,"done":1,"retry":0,"failed":0,"skipped":0,"superseded":0,"lost_lease":0,"unrecorded":0,"deferred":0}`.

Verify that exact entity (read-only; replace the type/id from the job row):

```sql
select id, entity_type, entity_id, status, attempts, last_error, processed_at
  from public.embedding_jobs where status = 'done' order by processed_at desc limit 1;
-- for an apartment job:
select vector_dims(e.embedding) as dims, e.model,
       e.content_hash = (select content_hash from public.embedding_document_for_entity('apartment', e.listing_id)) as hash_is_current
  from public.listing_embeddings e where e.listing_id = '<entity_id from above>';
-- required: dims = 768, model = 'gemini-embedding-001', hash_is_current = true
```

Running the same `{"limit":1}` request again must claim a **different** job (no double processing).

6.2 Five jobs (only after 6.1 passes):

```bash
curl -s -X POST "$URL" -H "x-cron-secret: $EMBEDDING_CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":5}'
```

Expected: HTTP 200, `claimed` = `done` (≤ 5), `failed`, `unrecorded`, `lost_lease` all 0. Re-run the 6.1 vector query for each processed entity.

**STOP and do not continue** on any of: HTTP 502 (an outcome could not be recorded), HTTP 503 or `"halted":"gemini_auth"` (wrong/missing Gemini key — attempts are refunded, nothing is lost), `failed > 0`, `dims != 768`, `hash_is_current = false`, a job left in `processing` for more than 6 minutes, or two requests claiming the same job.
Stopping is safe: with no schedule the queue just waits. Jobs left `pending` cost nothing.

## 7. After the five-job proof

- Record the evidence (HTTP bodies, the SQL results) on SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep Semantic Search Current. Do not mark it Done: the schedule (PR 2) and the real search journey are still open.
- Next in the agreed order: PR #347 (its own dry run, expecting exactly `20261016231000` and `20261016232000`), then PR #352 (`20261016233000`).
- Do **not** process the whole backlog by hand and do **not** enable cron here. PR 2 adds the named schedule and requires proof of scheduler success **and** HTTP 2xx **and** jobs reaching `done`.

## Rollback

- **Migration:** forward-fix only (never edit or delete an applied migration). The change is additive; the one data change (old `pending` → `skipped`) keeps the rows and their reason text.
- **Worker:** no schedule exists, so stopping means not calling it. To make it unreachable, delete the secret: `npx supabase secrets unset EMBEDDING_CRON_SECRET --project-ref zkwcbyxiwklihegjhuql` (the function then answers `500 not_configured`).
- **A wrong vector:** every vector carries the hash of the exact text it came from; editing the record enqueues a fresh job automatically.
