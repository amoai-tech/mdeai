# Meta Cloud API — MDE provider reference

**Source of truth:** https://developers.facebook.com/docs/whatsapp/cloud-api/ and https://github.com/fbsamples/whatsapp-api-examples

## Setup and messages
- Identify the actual WABA, Meta app, phone-number ID, required app permissions, production access token, business verification and template approval. Keep secrets in server-side configuration only.
- Read the Meta docs for the **currently supported** Graph API version, limits, pricing, media caps and conversation windows. The imported upstream skill hardcodes Graph v21.0, 80 messages/sec and fixed prices/window claims; do **not** transplant these as evergreen truths.
- Use the native Mastra/Chat adapter for provider sends when supported. For proactive approved notifications, inspect whether it supports templates and delivery IDs before adding a minimal supported wrapper in the existing outbound owner.
- Record provider message ID (`wamid`), normalized recipient identifiers, template ID/language, purpose, consent decision and real status as justified by live schema.

## Policy
- Distinguish customer-initiated replies from business-initiated sends. Observe Meta's current service window/template category rules and approved opt-in requirements. A prior inbound message is not blanket permission to send later.
- Respect STOP immediately, before queued messages dispatch; ensure inbound opt-out survives retries. Keep broker identity/auth separate from phone.
- Test rejected template, unknown recipient, expired session, rate limit, token rotation, media link failure and callback arriving after retry.

**MDE adaptation:** reuse `whatsapp_subscriptions` + `wa_outbox` and the one authorized Meta sender. Do not paste separate vendor SDK startup code.
