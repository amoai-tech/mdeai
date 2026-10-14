---
title: SAN-1444 P0 — durable WhatsApp inbound
status: implemented
updated: 2026-10-14
owner_task: SAN-1444
---

# SAN-1444 P0 — durable WhatsApp inbound

## Problem
The webhook acknowledged Meta before anything recoverable was written. A crash after the
acknowledgement lost the customer message with no retry, and a Meta redelivery could start the
concierge twice because nothing atomically claimed the message.

## Design
1. **Record before acknowledging.** The POST handler verifies the signature, extracts each inbound
   message and calls `whatsapp_record_inbound`. If any insert fails the handler returns **500**
   and lets Meta retry; **200 is returned only after the message is durably committed.**
2. **Deduplicate on the existing index.** `whatsapp_record_inbound` inserts into the existing
   `whatsapp_messages` and relies on the existing partial unique index on `external_id`
   (`on conflict (external_id) where external_id is not null do nothing`). No new messages table.
3. **Atomic claim + lease.** `whatsapp_claim_inbound` selects due rows with
   `for update skip locked` and moves them to `processing` with a claimant and lease, so two
   workers cannot take the same row. A crashed worker lease expires and the row is reclaimed.
4. **Recovery.** A claimed row is replayed through the **same** adapter webhook using a
   single-message envelope re-signed with the app secret, so replaying one row processes exactly
   one message. Success marks `processed`; failure records the error, increments attempts and
   schedules a bounded exponential backoff, becoming `dead` after 5 attempts.
5. **Sweeper.** `src/app/api/whatsapp/process-inbound/route.ts` retries due work when no new
   traffic arrives. It is disabled unless `WHATSAPP_PROCESS_SECRET` is set and requires the
   matching `x-whatsapp-process-secret` header.

State machine: `pending -> processing -> processed`, or `processing -> failed -> (retry) ... -> dead`.

## The at-least-once boundary (important)
Preventing a duplicate **agent run** does not guarantee exactly one external WhatsApp **send**.
If the provider accepted a reply and the process then crashed before `whatsapp_complete_inbound`
committed, the lease expires, the row is retried, and the reply is sent **again**. The system is
therefore at-least-once for external sends. This is deliberate: the alternative (marking processed
before the send) loses replies. A future increment can add the provider message id from the send
response and suppress a duplicate send.

## Tests (Vitest)
`src/lib/whatsapp/__tests__/inbound-store.test.ts` and
`src/lib/whatsapp/__tests__/process-inbound.test.ts` cover: duplicate delivery marked
`is_new=false`; a database failure throws so the route does not acknowledge; a claimed row is
completed on success and failed (with the error) when the adapter returns non-OK; a row with no
stored payload is failed, not dropped; no work when nothing is due; and two concurrent workers
process disjoint claims exactly once each. The route test covers 503/401/413/500/200 and the
status-only no-op.

## Not in this PR
Delivery receipts, Meta account configuration, new agents, and changes to legacy WhatsApp senders.

## Verification still required
- Apply the migration with `supabase db push` and run `npx supabase test db` against a local stack.
- Run the real Meta device round trip once credentials exist.
- Confirm production logging does not emit message content or phone numbers.
