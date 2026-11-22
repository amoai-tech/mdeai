# MDE Mastra structured output and Gemini compatibility

**Use when:** an agent or workflow returns machine-readable data consumed by CopilotKit, cards, maps, Events, Rentals, or authorized actions. Check installed @mastra/core type declarations before using any method from newer docs.

## Reuse the MDE path

- Existing agent: src/mastra/agents/concierge.ts.
- Tool definitions and Zod boundaries: src/mastra/tools/.
- Tool-result → Generative UI translation: src/mastra/lib/recommendation-surface-bridge.ts.
- Model ownership and provider fallback: src/mastra/lib/models.ts.
- Existing malformed Gemini function-call recovery: src/mastra/lib/gemini-malformed-retry.ts.
- Same-origin runtime: src/app/api/copilotkit/[[...path]]/route.ts.

Keep the current stable tool keys and CopilotKit v2 render catalog. Do not create a second API route, new JSON formatter service, or parallel React component library.

## Verification recipe

1. **Separate intent from facts.** The model can choose a filter or request a tool, but the tool's returned ID, price, coordinates, address, event time and availability are the authoritative values.
2. **Validate at the existing boundary.** Reuse tool input/output schemas, stable ID fields, and Zod parsing for data sent to the UI or to a server action.
3. **Prefer tool-rendered structured payloads** for existing cards and maps. Add an agent structuredOutput schema only if the caller truly needs a typed agent response; avoid wrapping every tool call in a new schema.
4. **Test the configured Gemini model with tools and structured responses together.** Some provider versions reject a JSON response MIME type while function calling. If a verified installed version supports jsonPromptInjection or a separate structuring model, consider it only after reproducing that exact error.
5. **Treat invalid or fallback objects as unverified.** A schema-compatible fallback is not proof that a price, listing, booking, ticket or location exists. Branch on the actual error/fallback signal and keep unknown values unknown.
6. **Respect existing retry ownership.** MDE already classifies malformed-function-call errors and has a bounded recovery path. Do not add a second model/transport retry around mutating tools; verify Stop/abort and exact-once effects.
7. **Test field truth and UI rendering separately.** A rendered table can be attractive and still include an invented price. Check row-to-tool provenance and Details/action ID selection, including refresh/replay and a 390px viewport when UI is changed.

## Real example

For “Show furnished two-bedroom homes under 3M COP,” the rental tool returns actual listing IDs and amounts. Cards receive those **existing** IDs and amounts; unavailable balcony information remains “not specified.” The UI must never synthesize a pin or price merely to fill required JSON fields.

## Required regression proof

Valid schema; invalid/missing field; tool+Gemini compatibility when the model is involved; user Stop; no repeated action after retry; grounded IDs/prices; CopilotKit card/pin sync. Run the relevant existing Vitest/Playwright tests, not a detached demonstration.

## Sources

- Community pattern: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-structured-output
- Official docs: https://mastra.ai/docs/agents/structured-output
- MDE local: references/gemini.md and references/tools.md.
