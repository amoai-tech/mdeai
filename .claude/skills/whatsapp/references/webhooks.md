# WhatsApp webhooks — verification and delivery

**References:** https://github.com/hookdeck/webhook-skills/tree/main/skills/whatsapp-webhooks · https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads

## Ingress
1. Confirm the installed Mastra adapter's generated webhook path and ownership; **do not** add a parallel Next.js/Supabase handler.
2. Support Meta's GET verification challenge by matching the configured verify token and returning the challenge correctly.
3. For POST, require `X-Hub-Signature-256` and compare HMAC-SHA256 using the **original raw request bytes**, Meta app secret, and timing-safe comparison **before privileged processing**. Configure the adapter's verified hook if it already supplies this contract.
4. Validate outer `whatsapp_business_account` envelope, account/phone ID, message/status type and size. Unknown types must not create business actions.
5. **Atomically persist both the unique provider event identity and retryable pending work** in one committed transaction, before acknowledging. Reuse an existing durable job/queue when suitable; a dedupe record alone is insufficient. The pending work identifies the processing state, attempt count and next eligible retry so a crash cannot orphan accepted events.
6. On duplicate delivery, inspect the already-persisted work: completed work is a no-op, pending/leased work remains eligible for recovery, and failed-retryable work resumes under the same identity. Protect actual agent response and business action with separate stable idempotency keys so recovery does not repeat side effects.

## Acknowledgement and recovery
- Return a successful acknowledgement **only after the event and recoverable work are durably committed together**. If that transaction fails, do not acknowledge success; let Meta retry. Acknowledge legitimate duplicates once their existing pending/completed state is known.
- A supervised worker must reclaim expired leases, retry with bounded backoff, and dead-letter or surface poison events for explicit operator replay. Crash after ack but before execution must recover without waiting for another Meta callback. Do not acknowledge in-memory-only scheduled work as durable.
- Do not promise exactly-once external delivery from a DB unique constraint alone; handle uncertain send outcomes and track accepted/delivered/failed truthfully.
- Test missing/incorrect signature, modified UTF-8 body, malformed JSON, valid duplicate, out-of-order status, Meta retries, 429/5xx, stuck dispatch, dead letter and operator replay; simulate crash immediately after durable ack, crash during processing, duplicate while pending, and restart recovery.
- Legacy deployed Infobip webhook is a separate public trust boundary; map traffic, contain safely, then retire it after cutover.

**Destination:** existing Mastra channel registration and the canonical WhatsApp storage/delivery service, located from current main; avoid inferred file paths.
