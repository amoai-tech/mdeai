---
title: SAN-1444 — Meta WhatsApp ingress and Mastra concierge round trip
status: in-progress
updated: 2026-10-14
owner_task: SAN-1444
---

# SAN-1444 — Meta WhatsApp ingress and Mastra concierge round trip

## What is proven (no Meta credentials required)

Verified against the installed packages, not from memory:

| Claim | Evidence |
| --- | --- |
| The adapter is Vercel Chat SDK's, not a Mastra package | `@chat-adapter/whatsapp@4.41.1`, repo `vercel/chat` |
| It owns the GET `hub.challenge` handshake | `WhatsAppAdapter.handleWebhook` GET → 200 challenge on token match, 403 on mismatch |
| It owns POST `X-Hub-Signature-256` over raw bytes | valid → 200; forged/missing → 401; malformed JSON with a valid signature → 400; UTF-8 body signed over raw bytes → 200 |
| It fails closed without credentials | `createWhatsAppAdapter()` throws `ValidationError` when any of the four env values is missing |
| Mastra mounts the channel in-process | `new Mastra({ agents })` initializes the adapter; `agent.getChannels().handleWebhookEvent('whatsapp', req)` returns the challenge. Before init it returns 503 "Chat not initialized" |
| MDE attaches the channel only when configured | `buildConciergeChannels()` in `sq/src/mastra/agents/concierge.ts` returns `u ndefined` without the full credential set, so web chat is unaffected |

Tests: `sq/src/lib/whatsapp/__tests__/`, `sq/src/app/api/whatsapp/__tests__/`, `sq/src/mastra/agents/__tests__/whatsapp-channel-adapter.test.ts` (23 tests). Run:

```bash
./node_modules/.bin/vitest run src/lib/whatsapp src/app/api/whatsapp src/mastra/agents/__tests__/whatsapp-channel-adapter.test.ts
```

## Architecture decision

MDE runs Mastra **in-process** (see `sq/src/app/api/copilotkit/[[...path]]/route.ts`); there is no standalone Mastra server, so the generated `/api/agents/<id>/channels/whatsapp/webhook` route is not reachable by Meta. `sq/src/app/api/whatsapp/webhook/route.ts` is therefore the real ingress. It does **not** reimplement transport — it verifies the signature first, then delegates to `handleWebhookEvent`.

The route returns **503** when the channel is unconfigured, so an environment without WhatsApp credentials is inert, never open.

## Meta prerequisites (unconfirmed — required for the real round trip)

WABA ID, phone number id, a permanent system-user access token, the app secret, an MDE-chosen verify token, a public HTTPS callback URL, and at least one approved template for business-initiated messages.

## Runbook for the real signed round trip

1. Provision the Meta app + WhatsApp product; set the callback URL to `https://<host>/api/whatsapp/webhook`.
2. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` in the deployment (server-only; never `NEXT_PUBLIC_*`).
3. Meta calls GET — expect 200 with the raw challenge echoed.
4. Send a real inbound text. Expect one grounded concierge reply, and a real `wamid` in the logs.
5. Replay the same POST — expect no second reply.
6. POST with a modified body / wrong secret — expect 401 and no agent run.

## Not done here (remaining increments)

- **Live Meta round trip** — blocked on the prerequisites above; no `WHATSAPP_*` values exist in any environment checked.
- **Atomic inbound event + retryable work before acknowledgement** — requires a durable table and a supervised worker (the adapter acknowledges before the agent run completes). Next SAN-1444 increment.
- **Outbound ownership and delivery-status persistence** — the adapter sends conversational replies directly, and Meta `statuses[]` must be reconciled into `whatsapp_messages`; both depend on the single-sender decision owned by SAN-309.
- **Legacy credential revocation** — tracked from SAN-1443.
