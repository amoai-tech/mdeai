---
title: MDE Mastra — runtime skills and accurate tool selection
description: Load when deciding whether Concierge needs a Rentals/Events/Local Discovery runtime skill or a tool-search processor; distinguish coding-agent skills from shipped runtime capabilities.
parent: mastra
impact: MEDIUM
tags: mastra, agent-skills, tool-selection, workspace, discovery
---

# Runtime skills and tool selection — only when needed

**Use when:** a real Concierge task repeatedly selects the wrong tool, needs specialist instructions, or has measurable token/context overhead. First inspect the existing registered tools and prompt; a new catalog is not an automatic improvement.

## Two different kinds of skills

- **Developer skill:** `.claude/skills/mastra/` and its `.agents/skills/mastra/` relative symlink help coding agents. They are **not** public Concierge instructions.
- **Runtime skill:** an Agent Skills `SKILL.md` in a trusted Mastra Workspace can teach the *running* Concierge a bounded task. See `references/workspace-skills.md` for installed-version syntax.
- **Current MDE reality:** `src/mastra/workspaces.ts` exposes a read-only, local development workspace and deliberately returns no workspace on Vercel/production through `getRuntimeWorkspace()`. **Do not claim that specialized runtime skills are active in hosted Concierge.** A production deployment/packaging and permission design is separate work.

## Ground tool choice in the user request

| User request | Existing tool/path to investigate | Important behavior |
| --- | --- | --- |
| 'Furnished two-bedroom apartment in Laureles under COP 3M' | `src/mastra/tools/search-rentals.ts` | Retain monthly COP budget and listing IDs; do not invoke restaurant or route search |
| 'Quiet café with Wi-Fi in El Poblado' | `src/mastra/tools/search-restaurants.ts` or `search-grounded-places.ts` | Choose the supported grounded place source; do not invent Wi-Fi attributes or call both without a documented fallback |
| 'Live music events this weekend' | `src/mastra/tools/search-events.ts`, existing search-intent router | Use event inventory and freshness logic; do not equate an event listing with a confirmed seat or ticket |
| 'Walk from Parque Lleras to the metro' | `src/mastra/tools/compute-route.ts` and `src/mastra/lib/route-tool-choice.ts` | Require two real endpoints; do not hallucinate route distances |
| 'Pay for two event tickets' | Existing authenticated ticket checkout API and Stripe/Supabase workflow | Model/tool instructions never authorize payments or prove success; confirm persisted order and tickets |

Treat this as a **routing test plan**, not a new router implementation. Inspect `src/mastra/agents/concierge.ts`, `src/mastra/tools/index.ts`, `src/mastra/tools/classify-intent.ts`, and tests before editing. Reuse stable tool keys and current CopilotKit v2 rendering. Keep a single retrieval/booking source of truth.

## Fastest decision path

1. Collect real misrouting examples with user text, expected tool, actual tool call, result provenance, and outcome. Include ambiguous/negative prompts and Spanish variants.
2. Correct an existing prompt, tool description, schema or deterministic router **at its owner**. Run `src/mastra/lib/search-intent-router.test.ts` and `src/mastra/tools/__tests__/classify-intent.test.ts` plus the actual multi-turn Concierge test. These tests alone do not prove model selection.
3. If there is repeated domain-specific procedure, prototype a small, read-only runtime skill for **one** domain in a controlled dev workspace; compare model/tool accuracy and cost against no skill. Never mount `.claude/skills/` as runtime instructions.
4. Check packaging, filesystem scope, tenant isolation, auth and deployment support before promoting skills to a hosted user agent. `getRuntimeWorkspace()` currently disables this in production, so no docs change activates it.
5. Consider Mastra's `ToolSearchProcessor` or `SkillSearchProcessor` **only after** a measured large-catalog problem. Verify that each API exists in MDE's installed `@mastra/core` types and that dynamic discovery does not allowlist unauthorized tools or inject untrusted descriptions.
6. Measure tool-choice accuracy, relevant grounded results, latency, tokens, and failures. Keep the simplest current route if a processor does not clearly outperform it.

## Real-world pass/fail

**Pass:** renter asks for a COP 3M monthly cap; Concierge calls the rental search tool, returns only comparable monthly prices, and the listing card opens the same saved listing ID.

**Fail:** the model calls café search for a rental, invents a Wi-Fi fact, loads a developer skill into a customer conversation, or says a ticket was purchased without order verification.

**Do not add:** a second RentalSearchEngine, duplicate category router, hosted skill registry, client-authorized tool permissions, or Phase A listing eligibility/partner approval checks.

Official reference: https://mastra.ai/docs/workspace/skills
Community patterns (version-check before use): https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-agent-skills
Community tool guidance: https://github.com/YGhorbel/awesome-mastra-skills/tree/master/skills/mastra-tools
