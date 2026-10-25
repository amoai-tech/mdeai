# WhatsApp + Supabase — existing source of truth

**Official:** https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/docs/guides/database/functions · https://supabase.com/docs/guides/functions/auth · https://supabase.com/docs/guides/queues

## Inspect before any migration
- Live project: `zkwcbyxiwklihegjhuql`. Audit actual schema, grants, triggers, policies, indexes, RLS and runtime workers for `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_subscriptions`, `wa_outbox`.
- Prior audit found RLS enabled, `whatsapp_messages.external_id` unique when present, `wa_outbox.idempotency_key` unique, and zero rows at that time. Recheck; zero rows never proves the legacy provider has zero live traffic.
- Inspect generic `outbox`, Mastra channel tables and any marketing message writers before choosing who processes queued items.
- Treat server-side service-role clients as privileged; never expose them to the browser. Test RLS for anonymous, renter A/B, broker A/B, organizer and operator. Phone ownership does not imply Supabase account permission.
- Inspect `SECURITY DEFINER` grants/functions before changes; don't broadly revoke legitimate public APIs. Minimize the number of direct RPC grants.

## Data decisions
- Keep existing four tables and their unique indexes. Only add consent evidence/provider correlation fields through a reviewed migration if the installed adapter and live schema demonstrate a gap.
- Support durable, atomic dedupe at ingress and atomic business transitions with stable action idempotency keys. A unique key alone does not guarantee exactly one external network send.
- **STOP vs dispatch race:** Lock or atomically fence recipient consent with message claim/authorization, using consistent lock ordering. Commit STOP plus cancellation of queued and not-yet-submitted claimed work atomically; stale `opted_in=true` snapshots cannot authorize a send. Define the exact point after which a provider submission is in flight and cannot be recalled, with status reconciliation and no retries after opt-out. Avoid holding database locks across the provider network call unless a reviewed design explicitly justifies it.
- Re-check template rules at dispatch and ensure consent state is coordinated with dispatch, not merely read beforehand. Reconcile out-of-order callbacks without regressing final status.
- **Durable inbound handoff:** In one transaction persist the unique provider event identity **and** retryable pending work (existing queue/worker if suitable). Ack only after commit; on duplicate, return/inspect the existing work state rather than suppressing incomplete work. A worker lease, retry/backoff and dead-letter/operator replay must recover crash-after-ack cases; business writes still need their own idempotency key.
- Use existing `pg_cron`, `pg_net` or outbound worker as justified; don't add `pgmq` or another queue by default.

**Verification:** pgTAP/negative RLS probes, unique/retry/concurrency tests, migration roll-forward/rollback, STOP/claim/send race tests, crash-after-ack recovery and live source comparison.
