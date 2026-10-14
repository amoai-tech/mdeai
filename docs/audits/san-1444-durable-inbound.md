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
- If an approved schema rollback is necessary, first stop inbound processing and the recovery schedule, reconcile or preserve any unprocessed rows (`pending`/`processing`/`failed`/`dead`), and back up needed processing history. Drop **all five RPCs** using their exact signatures, before removing the processing columns:
```sql
drop function if exists public.whatsapp_record_inbound(text, text, text, text, jsonb);
drop function if exists public.whatsapp_claim_inbound(text, integer, integer, integer);
drop function if exists public.whatsapp_dead_letter_inbound(integer, integer);
drop function if exists public.whatsapp_complete_inbound(uuid, uuid);
drop function if exists public.whatsapp_fail_inbound(uuid, uuid, text, integer, integer);
```
- Only then, in a separately reviewed rollback migration, remove the eight processing columns (`processing_status`, `attempts`, `claimed_at`, `claimed_by`, `claim_token`, `next_attempt_at`, `processed_at`, `last_error`) and their associated index/constraint. Do not use `CASCADE` to bypass unexpected dependencies.
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
- **Completion contract.** Completion now requires a **confirmed outbound send**, not just a settled task. The worker opens an AsyncLocalStorage scope; the WhatsApp adapter's `postMessage` records each attempt (success with the provider message id, or the error). A settled `waitUntil` task with no successful send fails the row for retry, because the Chat SDK resolves that task even when the agent or the Meta send failed. Residual ambiguity remains for a send that succeeds and then the process dies before completion (at-least-once).
- **Defect found by this suite.** The first `whatsapp_record_inbound` revision returned two rows on conflict: PL/pgSQL `RETURN QUERY` appends a row without exiting, so the `true` branch also ran. Fixed with an explicit `RETURN`. Unit tests missed it; the PostgreSQL test caught it.

## 12. Review hardening (post-review)
- **waitUntil is now enforced, not assumed.** If the adapter returns HTTP 200 without registering work through `waitUntil` (or passes a non-promise), the row is **failed** with `adapter did not register background work via waitUntil` instead of being marked `processed`. A silent-200 path can no longer tell the sweeper a message is done.
- **Count RPCs fail loudly.** `whatsapp_complete_inbound`/`whatsapp_fail_inbound`/`whatsapp_dead_letter_inbound` must return an integer. An unexpected return type throws instead of being coerced to 0 (which would masquerade as a fenced `stale` claim).
- **Dead-letter semantics are deliberate.** A row at `attempts >= max` that is **actively processing with a valid lease** is *not* dead-lettered, because that would kill a live final attempt. It is dead-lettered once the lease expires. The pgTAP suite asserts both cases (expired ⇒ `dead`; valid lease ⇒ still `processing`).
- **Sweeper is a hard operational dependency.** A durable row left `pending` by a failed `after()` is only retried by the sweeper. Provision the schedule (§7) before enabling customer traffic; until then the residual latency is unbounded. Recommended alert:
```sql
select now() - min(coalesce(next_attempt_at, created_at)) as oldest_due,
       count(*) filter (where processing_status in ('pending','failed')) as waiting,
       count(*) filter (where processing_status = 'dead') as dead
from public.whatsapp_messages where direction = 'inbound';
```
Alert when `oldest_due` exceeds the retry SLA or `dead > 0`.

## 13. Pre-enablement gates (before any customer traffic)
These do not block merging the durable foundation; they block turning the channel on.
1. **Recovery schedule.** Live has zero WhatsApp cron jobs. Provision the Vault secrets and apply §7, then prove restart recovery by claiming a row, killing the worker, and watching the sweeper complete it.
2. **Same-sender ordering across serverless instances.** Distinct messages are distinct rows, so nothing is processed twice, but two messages from one customer can run concurrently and out of order. Add sender-level serialization (or a supported shared pub/sub) and test two rapid messages from one number.
3. **Agent-run cancellation.** The 120s wait is bounded and fencing prevents stale writes, but the underlying promise can outlive the wait. Thread an AbortSignal through the adapter before enabling traffic.
4. **Delivery truth.** Completion is now gated on a confirmed send (the provider message id is captured in-process). Remaining: **persist** the outbound provider id and the `sent`/`delivered`/`read`/`failed` statuses so delivery is auditable.
5. **Authorization.** Prove a WhatsApp user without an MDE account cannot read private data or trigger consequential actions (viewings, bookings).
6. **Real device round trip.** One signed inbound message ⇒ one durable row ⇒ one grounded reply ⇒ valid `wamid` ⇒ receipt, with no fabricated prices, availability, or coordinates.
