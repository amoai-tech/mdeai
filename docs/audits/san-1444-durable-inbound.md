---
title: SAN-1444 P0 — durable WhatsApp inbound (runbook)
status: database-and-concurrency-verified
updated: 2026-10-14
owner_task: SAN-1444
---

# SAN-1444 P0 — durable WhatsApp inbound

## 1. What this guarantees
- Every acknowledged Meta message is durably recorded first; a failed record returns 500 so Meta retries.
- Deduplication reuses the existing `whatsapp_messages.external_id` unique index. No new messages table.
- Claims are atomic (`for update skip locked`) and carry a fencing `claim_token`; only the current owner can complete or fail a row.
- Completion waits for the agent work the adapter schedules via `waitUntil` (bounded 150s), so a webhook HTTP 200 alone is not treated as success.
- Retries are bounded; exhausted work is dead-lettered (`processing_status = 'dead'`).

## 2. Local database setup and test commands
```bash
supabase start                       # local stack only
supabase db reset --local            # clean migration replay (never --linked)
supabase test db --local             # pgTAP: schema, behaviour, privileges
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres \
  node supabase/tests/concurrency/san1444_claim_concurrency.mjs
```

Verified on this branch (local PostgreSQL 17.6):
- `supabase db reset --local` — clean replay, all migrations including `20261014090000_…durability.sql`.
- `supabase test db --local` — **Result: PASS** (37 files, 1127 tests); `san1444_whatsapp_inbound_durability_test.sql` ok (23 assertions).
- `san1444_claim_concurrency.mjs` — **PASS** (two connections; A holds locks, B skips them, no double claim, distinct tokens).
- `npm run check:function-acl` with the local DB — 49 reachable, 49 baselined (new RPCs revoked from anon/authenticated).

## 3. Migrations, dependencies and deployment order
1. `20261014090000_san1444_whatsapp_inbound_durability.sql` — additive columns on `whatsapp_messages`, one CHECK, one partial index, five SECURITY DEFINER RPCs (`record`, `claim`, `dead_letter`, `complete`, `fail`) with EXECUTE revoked from `public`/`anon`/`authenticated` and granted to `service_role`.
2. Deploy the application code (route + worker) **before** enabling the channel.
3. Recurring recovery is **not scheduled in this PR** (task constraint: do not enable production schedules). Provision the two Vault secrets and create the schedule manually — see §7.

## 4. RPC permission verification
The pgTAP suite asserts `service_role` may claim, and `anon`/`authenticated` may **not** execute `claim`/`complete`. `check:function-acl` confirms no new PUBLIC/anon executable functions were introduced.

## 5. Restart, retry and recovery
1. A crash after claim leaves the row `processing` with an expired lease.
2. `whatsapp_claim_inbound` (called by the sweeper or the next webhook) reclaims it after the lease, with a new token.
3. Failures set `failed` with `last_error` and bounded exponential backoff; at `attempts >= 5` the row becomes `dead`.
4. The old owner's late complete/fail affects 0 rows and is reported `stale` — it cannot overwrite the new owner.

## 6. Monitoring and dead-letter investigation
- Background failures are emitted as one structured JSON line (`event=whatsapp.inbound.processing_failed`) and forwarded to `setInboundFailureSink()` (unwired by default; point it at Sentry/alerting at startup).
- The sweeper returns **500** on failure, so pg_net/the scheduler records a failed run.
- Investigate dead work:
```sql
select id, external_id, attempts, last_error, processed_at
from public.whatsapp_messages
where processing_status = 'dead' order by attempts desc;
```
- Logs must never include message content or phone numbers; only ids, attempts and error text are logged.

## 7. Recovery schedule (manual, after provisioning)
Not created by a migration on purpose, so production is not silently scheduled. After setting Vault secrets `mde_app_url` and `whatsapp_process_secret`:
```sql
select cron.schedule('whatsapp_inbound_recovery', '*/2 * * * *', $cron$
  do $$
  declare v_app_url text; v_secret text;
  begin
    select decrypted_secret into v_app_url from vault.decrypted_secrets where name = 'mde_app_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'whatsapp_process_secret';
    if v_app_url is null or btrim(v_app_url) = '' then raise exception 'missing mde_app_url'; end if;
    if v_secret is null or btrim(v_secret) = '' then raise exception 'missing whatsapp_process_secret'; end if;
    perform net.http_post(
      url := rtrim(v_app_url, '/') || '/api/whatsapp/process-inbound',
      headers := jsonb_build_object('content-type', 'application/json', 'x-whatsapp-process-secret', v_secret),
      body := '{}'::jsonb);
  end $$;
$cron$);
```
Adding this schedule changes the cron manifest that `san1313b_pg_cron_schedule_replay_test.sql` locks at exactly four jobs — update that test in the same change that enables the schedule.

## 8. Rollback
- The route returns 503 when `WHATSAPP_*` is absent, so removing the env vars disables the channel without a deploy.
- To drop the schema change: `drop function` the four RPCs, then `alter table public.whatsapp_messages drop column` the processing columns. Do this only after confirming no rows are in `processing`/`failed`.
- Never run `supabase db reset --linked` or `db push` against production as a rollback.

## 9. Production verification checklist
- [ ] Migration applied in order; `supabase test db` and the concurrency script pass against a local replay.
- [ ] `check:function-acl` reports no new anon/PUBLIC executable functions.
- [ ] One signed inbound event becomes one durable row; ten duplicates produce one row (pgTAP).
- [ ] Two concurrent claims never share a row (concurrency script).
- [ ] Stale complete/fail affects 0 rows (pgTAP).
- [ ] Real Meta device round trip: one reply, valid `wamid`, no fabricated status.
- [ ] Production logs contain no message text or phone numbers.

## 10. Remaining Meta-account requirements
WABA ID, phone number id, permanent system-user token, app secret, MDE verify token, a public HTTPS callback URL, and one approved template for business-initiated messages. The recovery schedule's Vault secrets are also unprovisioned.

## 11. Known limitations (do not over-claim)
- **At-least-once external sends.** If the provider accepted a reply and the process died before completion committed, the retry sends again. Fencing prevents stale overwrites, not a duplicate send.
- **Completion contract.** Completion awaits the task the adapter registers via `waitUntil` (`chat.processMessage(..., options)`); the adapter does not reference `waitUntil` directly but forwards `WebhookOptions` to `chat`, which does. Residual ambiguity remains for any provider send that settles after that task.
- **Defect found by this suite.** The first `whatsapp_record_inbound` revision returned two rows on conflict: PL/pgSQL `RETURN QUERY` appends a row without exiting, so the `true` branch also ran. Fixed with an explicit `RETURN`. Unit tests missed it; the PostgreSQL test caught it.
