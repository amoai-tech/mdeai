# Meta Cloud API — MDE provider reference

**Source of truth:** https://developers.facebook.com/docs/whatsapp/cloud-api/ and https://github.com/fbsamples/whatsapp-api-examples

## Setup and messages
- Identify the actual WABA, Meta app, phone-number ID, required app permissions, production access token, business verification and template approval. Keep secrets in server-side configuration only.
- Read the Meta docs for the **currently supported** Graph API version, limits, pricing, media caps and conversation windows. The imported upstream skill hardcodes Graph v21.0, 80 messages/sec and fixed prices/window claims; do **not** transplant these as evergreen truths.
- Use the native Mastra/Chat adapter for provider sends when supported. For proactive approved notifications, inspect whether it supports templates and delivery IDs before adding a minimal supported wrapper in the existing outbound owner.
- Record provider message ID (`wamid`), normalized recipient identifiers, template ID/language, purpose, consent decision and real status as justified by live schema.

## Policy
- Distinguish customer-initiated replies from business-initiated sends. Observe Meta's current service window/template category rules and approved opt-in requirements. A prior inbound message is not blanket permission to send later.
- Treat STOP as a concurrent state transition, not a best-effort boolean check: in one database transaction lock the recipient/suppression state using a consistent order, persist the opt-out, and cancel eligible queued/claimed-but-not-sent messages. Coordinate the dispatch claim/final authorization decision with this same lock or an equivalent atomic compare-and-set/consent version check. A worker must not rely on an earlier `opted_in=true` read. Keep broker identity/auth separate from phone.
- Define an explicit send boundary. Work already submitted to Meta or irrevocably in flight may not be recallable after STOP; record that outcome accurately, stop retries/future sends, reconcile provider callbacks, and never promise retroactive cancellation. For a worker that has claimed but **not submitted** a message, STOP must win or the sender must hold the per-recipient dispatch fence until the provider submission decision. Do not hold a database transaction across a remote network call by default; document and test the selected concurrency protocol.
- Test rejected template, unknown recipient, expired session, rate limit, token rotation, media link failure and callback arriving after retry.

**MDE adaptation:** reuse `whatsapp_subscriptions` + `wa_outbox` and the one authorized Meta sender. Do not paste separate vendor SDK startup code.
