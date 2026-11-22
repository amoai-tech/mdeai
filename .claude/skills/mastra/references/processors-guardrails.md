# MDE Mastra input/output processors and technical guardrails

**Use when:** changing prompt-injection handling, token limits, input/output sanitization, tool-result checks, or provider-error processors. Do not confuse technical safety with postponed business eligibility and approval rules.

## Existing production-facing path

- src/mastra/lib/agent-input-processors.ts owns TokenLimiter and opt-in PromptInjectionDetector.
- src/mastra/agents/concierge.ts applies the processors.
- src/mastra/lib/gemini-malformed-retry.ts owns a narrow error recovery decision.
- src/mastra/lib/mastra-telemetry.ts classifies turn outcomes.
- Focused tests live under src/mastra/lib/__tests__/ and src/mastra/agents/__tests__/.

The current source documents measured **additional model latency (~3–5 seconds)** for the prompt-injection detector. For the current Concierge, this detector is opt-in with MASTRA_PROMPT_INJECTION_GUARD=true; TokenLimiter remains on. Do not reverse that choice based solely on a community example.

## Design and proof

1. **Reproduce the failure and measure the cost** of any proposed processor before changing the runtime chain.
2. **Use server-side authorization for actions.** A prompt, LLM guardrail, approval dialog or processor is not authentication, tenant isolation, an admin check or transaction validation.
3. **Prefer cheap deterministic controls first:** Zod input validation, length/token caps, allowlisted tool dispatch, safe output schemas, non-secret logs.
4. **Add model-based processors only for a demonstrated risk.** Measure p50/p95 latency, additional token/cost usage, true/false blocks and interaction with streaming.
5. **Document fail behavior:** denial for unauthorized tool/action writes; truthful error or unknown for unavailable facts; controlled fallback for provider failures. Never turn a broken AI result into fabricated availability or success.
6. **Do not duplicate error retries.** Recovery from Gemini MALFORMED_FUNCTION_CALL and timeout/provider fallback already has dedicated code; re-running a payment, lead, booking or ticket side effect must be idempotent at its database boundary.
7. **Preserve Phase A development freedom.** No ownership checks, partner approval, photo-rights paperwork, verified listing status, or publication eligibility prerequisites for ordinary development journeys. Keep secrets, RLS, server auth and atomic writes.
8. **Exercise negative tests:** malicious prompt cannot read another user's data, blocked action does not persist, model error is classified correctly, Stop does not falsely claim rollback, tool results cannot inject ungrounded fields.

## Example: performance-aware safety

A renter asks “What is the rent for Casa Jardín Azul?” The deterministic token limit and tool schemas still protect the request. A separate prompt-injection model is not automatically called for every query, avoiding a second LLM round-trip unless the measured threat justifies it. The rental lookup must still enforce authorization for private records on the server.

## Sources

- Community pattern: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-processors-guardrails
- Official docs: https://mastra.ai/docs/agents/processors
- Official docs: https://mastra.ai/docs/agents/guardrails
