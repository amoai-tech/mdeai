---
title: SAN-1444 P0 — durable WhatsApp inbound
status: implemented-not-verified
updated: 2026-10-14
owner_task: SAN-1444
---

# SAN-1444 P0 — durable WhatsApp inbound

## Problem
The webhook acknowledged Meta before anything recoverable was written, and a redelivery could
start the concierge twice.

## Design
1. **Record before acknowledging.** POST verifies the signature, extracts each inbound message and
   calls `whatsapp_record_inbound`. A failed insert returns **500** so Meta retries; **200 only
   after the message is durably committed.**
2. **Deduplicate on the existing index.** The RPC inserts into the existing `whatsapp_messages` and
   relies on the existing partial unique index on `external_id`. No new messages table.
3. **Atomic claim + fencing.** `whatsapp_claim_inbound` selects due rows with `for update skip
   locked` and sets a fresh `claim_token`, claimant and lease. Completion and failure carry the
   `claim_token` and update only when this claim still owns the row; the affected-row count is
   returned, so a fenced-out worker is reported as `stale` and never counted as success.
4. **Attempt ceiling everywhere.** Claiming excludes rows at `attempts >= p_max_attempts`, including
   the lease-expiry path, and `whatsapp_dead_letter_inbound` moves exhausted work to `dead`.
5. **Completion follows real processing.** The adapter receives a `waitUntil` callback; the worker
   awaits that promise (bounded, default 150s) before marking the row processed. An HTTP 200 from
   the webhook is NOT treated as proof the customer received an answer.
6. **Recovery on a schedule.** `20261014091000_…recovery_schedule.sql` runs the sweeper every 2
   minutes via pg_cron/pg_net using Vault secrets `mde_app_url` and `whatsapp_process_secret`.

State machine: `pending -> processing -> processed`, or `processing -> failed -> (retry) -> dead`.

## At-least-once boundary
Preventing a duplicate **agent run** does not guarantee exactly one external **send**. If the
provider accepted a reply and the process died before completion committed, the retry sends again.
Fencing stops a stale worker from overwriting a newer claim, but it cannot un-send a message. A
later increment can store the send's provider id and suppress a duplicate send.

## Verified locally
55 Vitest tests pass, including: duplicate delivery marked `is_new=false`; DB failure returns 500;
multi-entry payloads replay the correct entry/change; a fenced-out completion is `stale`, not
`processed`; completion waits for the scheduled agent work and fails on timeout; the attempt
ceiling is passed to the claim; dead-letter runs before claiming; two workers process disjoint
claims exactly once each.

## Not verified yet (do not treat as done)
- The migration is **not applied** to any live database and pgTAP has **not run** (no local stack
  here). `supabase/tests/database/san1444_whatsapp_inbound_durability_test.sql` must pass before
  the channel is enabled.
- The recovery schedule's Vault secrets are **not provisioned**; until they are, the cron job
  raises on every run.
- No real Meta device round trip, and delivery receipts are out of scope for this PR.
- Production logging redaction and the WhatsApp authorization boundary are unproven.
