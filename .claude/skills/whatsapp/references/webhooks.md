# WhatsApp webhooks — verification and delivery

**References:** https://github.com/hookdeck/webhook-skills/tree/main/skills/whatsapp-webhooks · https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads

## Ingress
1. Confirm the installed Mastra adapter's generated webhook path and ownership; **do not** add a parallel Next.js/Supabase handler.
2. Support Meta's GET verification challenge by matching the configured verify token and returning the challenge correctly.
3. For POST, require `X-Hub-Signature-256` and compare HMAC-SHA256 using the **original raw request bytes**, Meta app secret, and timing-safe comparison **before privileged processing**. Configure the adapter's verified hook if it already supplies this contract.
4. Validate outer `whatsapp_business_account` envelope, account/phone ID, message/status type and size. Unknown types must not create business actions.
5. Persist provider message/event identity atomically before side effects; duplicate deliveries must not duplicate agent replies, viewing requests or notifications.

## Acknowledgement and recovery
- Return a successful acknowledgement **only after verified durable acceptance**, not for discarded failed work. Handle processing asynchronously after durable capture when supported.
- Do not promise exactly-once external delivery from a DB unique constraint alone; handle uncertain send outcomes and track accepted/delivered/failed truthfully.
- Test missing/incorrect signature, modified UTF-8 body, malformed JSON, valid duplicate, out-of-order status, Meta retries, 429/5xx, stuck dispatch, dead letter and operator replay.
- Legacy deployed Infobip webhook is a separate public trust boundary; map traffic, contain safely, then retire it after cutover.

**Destination:** existing Mastra channel registration and the canonical WhatsApp storage/delivery service, located from current main; avoid inferred file paths.
