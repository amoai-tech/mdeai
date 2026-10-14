---
title: SAN-1443 — WhatsApp channel, sender and provider inventory
status: current
updated: 2026-10-14
project: zkwcbyxiwklihegjhuql
comparison_commit: e286da7f8
owner_task: SAN-1443
---

# SAN-1443 — WhatsApp channel, sender and provider inventory

Read-only recovery and inventory for the WhatsApp audit. Complements
[edge-functions.md](../02-architecture/edge-functions.md) (the 2026-09-17 platform-wide snapshot); this file
focuses on the WhatsApp/messaging senders and the containment decision.

**Method:** deployed source recovered with Supabase `get_edge_function`; SHA-256 computed over the
returned entrypoint bytes. Traffic from the Supabase unified `logs` table (24h retention). No
production mutation beyond shipping the deny-by-default source in this PR.

## 1. Deployed messaging functions vs Git

Every deployed messaging function is **untracked** in `origin/main` and its recovered source is
byte-identical to the archived 2026-05-24 snapshot. The archive is a faithful recovery.

| Slug | Version | `verify_jwt` | SHA-256 (recovered) | Archive match | Risk |
| --- | --- | --- | --- | --- | --- |
| `whatsapp-webhook` | v39 | false | `65522081f60f0608fa7274ee53f75a5007be4f94e67b32f167295767fe891e1c` | yes | **Critical** — unauthenticated, service-role, paid provider calls |
| `outbox-dispatch` | v19 | false | `75902f7f6f2d7507ac9a3b535db7e38f88ba83511018dacd7b7d5ecc579857ca` | yes | High — shared-secret, but schema-broken (see §4) |
| `notify-entity-approved` | v26 | false | `e6dff076d440ce1f03c22823c688fd43f01b7ddf5fc392cdf74c7a274bee9e67` | yes | High — Infobip WhatsApp sender |
| `openclaw-delivery-webhook` | v23 | false | `36342190e191e95e9945f658b648523ac7054491d829e88bcbea529ffc47430b` | yes | Medium — bearer-verified |
| `openclaw-outreach` | v19 | false | `e2460ed44fb96d3fb658d96f1c0eee15e05e7a4687ef4e99cc37fdc2da7d755e` | yes | Medium |
| `failed-deliveries-digest` | v19 | false | `c5f0e94f0e2f85fb642e29a1bcea152d00a540fd268b66f2031434bbecbed11b` | yes | Low — shared-secret |
| `postiz-approval-webhook` | v18 | true | `ec67a93f6c18e972f1d07a0c1d5b5b52b43bab550a91689f30d33d8e5e9330c9` | yes | Low — JWT verified |

Archived recovery path (preserve, do not delete):
`sq/docs/_archive/legacy-active-docs-2026-09-18/tasks/backup/edge-functions-2026-05-24/deployed-live/supabase/functions/<slug>/index.ts`

## 2. Sender inventory

| Sender | Mechanism | Functions | Status |
| --- | --- | --- | --- |
| Infobip | REST `whatsapp/1/messages`, `whatsapp/2/message/text` | `whatsapp-webhook`, `notify-entity-approved` | Target: retire |
| OpenClaw | gateway `/api/sendText` | `outbox-dispatch` (+ `openclaw-delivery-webhook` receipts) | Target: retire |
| Twilio | `twilio-whatsapp.ts` helper / sandbox dependency | legacy rental reminder path | Target: retire |
| Meta Cloud API | none yet | — | Target: the single provider (SAN-1444) |

## 3. Traffic evidence

Supabase unified logs (retention ~24h), window 2026-10-13T04:35 → 2026-10-14T04:35: 8,581 log rows,
256 edge-function requests. **Only `lead-reminder-tick` received traffic** (256/256 failing on
PGRST204 — missing `landlord_inbox.reminder_sent_at`). `whatsapp-webhook`, `outbox-dispatch` and
`notify-entity-approved` received **0 requests**.

**Limitation:** a 24h window is not proof of inactivity. Before revoking credentials, extend the window
in the Supabase dashboard and check the Infobip/OpenClaw provider dashboards.

## 4. Database writer map

Two WhatsApp-capable outboxes coexist:

- `public.wa_outbox` — OpenClaw-era table; no `external_id`; status CHECK `queued|dispatching|sent|dead`.
  `outbox-dispatch` selects `wa_outbox.external_id` (column absent), writes `status='failed'` (CHECK
  violation) and reads the non-existent `public.posts_outbox`. **No working sender exists today.**
- `public.outbox` — canonical, with `outbox_enqueue`/`outbox_claim`/`outbox_mark_sent`/`outbox_mark_failed`,
  `provider_id`, `delivered_at`, channel CHECK including `whatsapp`, and a BEFORE INSERT suppression trigger.

**Decision:** `public.outbox` is the canonical business sender. Its RPCs are **not production-ready**
(no durable claim/lease, failed rows are never re-claimed, `pending` rows are claimable, suppression is
INSERT-only). Repair is owned by SAN-309.

## 5. Schema and grants (summary)

Four WhatsApp tables exist with RLS enabled and 0 rows. All four grant **ALL** privileges to `anon` and
`authenticated`; only `service_role` policies exist, so RLS default-denies today. `public.is_suppressed` is
`SECURITY DEFINER` and `anon`-executable. Tightening is owned by SAN-309. Full detail: the SAN-1443
Linear issue and the plan document.

## 6. Meta prerequisites (unconfirmed)

WABA, phone number id, permanent system-user token, app secret, verify token, approved templates,
callback URL. None verified. Owned by SAN-1444.

## 7. Containment and cutover runbook

1. **Contain (this PR).** Ship a deny-by-default `whatsapp-webhook`: every request is 403, no body parse,
   no env read, no database client, no outbound fetch. Deploy is the gated action.
2. **Deny.** Deploy the deny-by-default revision first, so the endpoint can neither write nor send
   while the review below runs. The function's `verify_jwt = false` is declared in the root
   `supabase/config.toml` under `[functions.whatsapp-webhook]` (Supabase's documented location).

   ```bash
   supabase functions deploy whatsapp-webhook --project-ref zkwcbyxiwklihegjhuql
   ```

   Note: four older functions (`approval-commit`, `chat-lead-capture`, `ticket-checkout`,
   `ticket-payment-webhook`) still carry a function-local `config.toml`, which is not the
   documented location. Migrating them is a separate follow-up; this task only moved
   `whatsapp-webhook`.
3. **Drain/verify.** Extend the traffic window; confirm no legitimate caller.
4. **Revoke.** After the extended window confirms inactivity, unregister the Infobip callback and revoke
   Infobip/OpenClaw/Twilio credentials and secrets. Do not revoke on 24h evidence alone.
5. **Retire the other senders** (`notify-entity-approved`, `outbox-dispatch`, `openclaw-*`) as SAN-1444
   proves the Meta path.

### Rollback

- **Endpoint:** redeploy the archived v39 source from the recovery path in §1 (restores the vulnerability;
  only for diagnosis). Preferred: roll forward.
- **Credentials:** keep exports of the Infobip/OpenClaw configuration and secret names (not values) before
  revoking, so a documented restore is possible.

## 8. Not proven / residual risk

- No live Meta round trip; provider provisioning unverified.
- Extended-window and provider-dashboard traffic checks outstanding.
- `public.outbox` delivery contract unproven (SAN-309).
- Deploy of the deny-by-default revision is not performed by this PR; it is the next gated step.
