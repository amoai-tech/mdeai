---
name: whatsapp
description: Use when implementing, auditing, testing or debugging MDE WhatsApp Meta Cloud API channels, Mastra adapters, webhooks, consent, templates, messaging, rental viewing or broker notifications, restaurant/venue discovery, and event reminders. Reuse Supabase, CopilotKit and existing agents rather than creating a standalone bot.
---

# WhatsApp — MDE channel domain skill

**Owner:** WhatsApp-specific integration contracts. For task execution, use the primary `implement`, `errors`, `plan` or `tasks` workflow; read this skill as domain guidance. Read `AGENTS.md` and the applicable `mastra`, `supabase`, `copilotkit`, `real-estate`, `events`, or `testing` skill only when relevant.

## Product contract

Meta Cloud API → installed Mastra WhatsApp adapter → existing `conciergeAgent` and authorized domain tools → Supabase. CopilotKit stays the web UI. Retire legacy Infobip only after a real traffic/dependency and rollback check; do not rewrite its independent AI agent. Preserve existing `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_subscriptions`, `wa_outbox` and their constraints/policies unless live evidence requires a minimal migration.

## Execute

1. **Verify:** Inspect current main, pinned packages/types, relevant Linear issue, live Supabase schema/RLS/functions, channel endpoint, active webhook traffic, workers and sender owner. Unknown remains unknown. Check upstream docs against installed API.
2. **Reuse:** Attach `@chat-adapter/whatsapp` through the existing Mastra agent **only if installed contracts support it**. Do not scaffold a new app, add a second chatbot/webhook, duplicate queue, create another rental search engine, or copy legacy v0 examples.
3. **Secure ingress:** Verify Meta GET challenge and POST `X-Hub-Signature-256` over raw bytes at the **actual** adapter ingress; validate event types and atomically persist deduplication **and retryable work** before acknowledging; recover crash-after-ack without duplicate business actions. A phone number or provider signature does not authenticate an MDE renter/broker.
4. **Own outbound:** Inspect whether the adapter auto-replies. Reuse the approved existing outbox/worker for proactive messages only after identifying who truly dispatches; never have two components independently send the same message. Fence STOP against concurrent claim/send so stale consent cannot authorize a send; cancel unsent jobs and reconcile already-in-flight submissions. Track provider IDs, retries, terminal failures and out-of-order statuses.
5. **Authorize action:** Business services enforce rental eligibility, one lead/viewing, assigned-broker isolation, venue request status, payment/ticket ownership, and consent/STOP/template policy at dispatch. Do not infer real prices, coordinates, availability or confirmed actions.
6. **Prove:** Focused tests → RLS/negative tests → typecheck/lint → integration and mobile E2E → real signed provider round trip. Verify duplicate delivery, replay, missing consent, unauthorized actor, provider errors, and web chat regression before any production claim.

## Read relevant detail only

- [Meta Cloud API and templates](references/meta-cloud-api.md) — provider setup, conversations, templates, message status.
- [Webhooks](references/webhooks.md) — GET/POST authentication, raw-body validation, replay and recovery.
- [Mastra and Chat SDK](references/mastra-chat-sdk.md) — adapter, ownership and version checks.
- [Supabase](references/supabase.md) — four existing tables, RLS, grants, outbox, idempotency.
- [User journeys](references/journeys.md) — rentals, restaurants/venues, events, broker/ops handoff.

## Response
**What's correct · What's broken · Smallest change · Verification · Next step.** Separate confirmed issues from risks and unknowns. Never call a PR merged/deployed or the journey production-ready without evidence.
