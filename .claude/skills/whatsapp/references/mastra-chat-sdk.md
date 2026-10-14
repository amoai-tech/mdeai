# Mastra + Chat SDK — adapter ownership

**Official implementation:** https://mastra.ai/integrations/channels/whatsapp · https://github.com/mastra-ai/mastra · https://github.com/vercel/chat

## Use
- Inspect current `package.json`, lockfile and installed Mastra/adapter types. The upstream example's agent ID is illustrative; derive the generated callback path from the actual registered MDE agent ID.
- Adapt `createWhatsAppAdapter()` into existing `conciergeAgent` / Mastra registry only when version compatibility is verified.
- Preserve the current CopilotKit route and tools. The web UI and WhatsApp should share authorized domain capabilities without sharing identity or unsafe session data.
- Inspect native transport lifecycle, response sending, thread key, memory, status callbacks, errors and template support before integrating `wa_outbox`.
- Do **not** execute `create-chat-sdk` or install standalone `chat` just to integrate WhatsApp; the vendor `chat-sdk` skill is general multi-platform guidance, not an MDE scaffold instruction.

## Not production implementation references
- https://mastra.ai/examples/v0/agents/whatsapp-chat-bot — historical example only; no custom webhook, second AI message splitter, LibSQL DB or direct sender.
- https://mastra.ai/blog/introducing-harness-channels — optional future operator collaboration; not needed for customer messaging.

**Proof:** typecheck adapter, real signed ingress, one response, persisted state, one dispatch owner, and unchanged /chat regression.
