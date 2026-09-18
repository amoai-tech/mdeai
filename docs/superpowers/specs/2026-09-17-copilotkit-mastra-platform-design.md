# Task 53 · MDE-AI-PLATFORM-DOCS-001 — CopilotKit + Mastra Platform Design

## Goal

Create one canonical MDE platform reference for CopilotKit + Mastra that reflects merged `main`, current package/API reality, and official upstream guidance.

## Architecture decision

Keep the existing MDE runtime:

```text
Next.js / React
      ↓
CopilotKit / AG-UI
      ↓
Mastra agents + tools + workflows
      ↓
Supabase / trusted external services
```

Ownership stays explicit:

- **Next.js / React** — screens, user interaction, route boundaries.
- **CopilotKit / AG-UI** — agent UI bridge, app context, shared state, tool rendering, HITL UI.
- **Mastra** — agents, tools, workflows, memory, evaluation, observability, orchestration.
- **Supabase** — identity, durable application state, RLS, transactional truth.
- **Gemini** — reasoning/generation, not authorization or state truth.

## Current MDE constraints

- CopilotKit packages remain pinned to `1.55.2` unless a dedicated upgrade task changes them.
- Current application code uses the `@copilotkit/react-core/v2` API surface.
- Bare v1 React imports must not be reintroduced into `src/**`.
- Production Mastra storage uses Postgres when `DATABASE_URL` is configured; local development may use in-memory LibSQL.
- Browser code must never receive Supabase `service_role` credentials.
- AI does not authorize privileged writes.
- Tool-based `useHumanInTheLoop` remains the production HITL standard until a dedicated compatibility spike proves a safer replacement.

## Build-before-custom decision ladder

Every CopilotKit/Mastra task follows this order:

1. Existing MDE implementation.
2. Mastra Studio / CLI / built-in server capability.
3. Existing CopilotKit primitive.
4. Existing Mastra primitive.
5. Official CopilotKit integration/example.
6. Official Mastra template/skill.
7. Official source implementation.
8. Small custom implementation only when the previous layers cannot satisfy the requirement.

## Documentation structure

```text
docs/03-platform/copilotkit-mastra/
├── README.md
├── reference-pack.md
└── roadmap.md
```

- `README.md` — current architecture and implementation rules.
- `reference-pack.md` — exact official docs, examples, templates, Studio/CLI references.
- `roadmap.md` — durable capability sequence only; Linear remains execution truth.

## HITL decision

Current MDE production pattern:

```text
Agent proposes action
→ CopilotKit useHumanInTheLoop renders approval UI
→ user approves/rejects
→ deterministic server/RPC validates authorization
→ Supabase/RLS/transaction performs the state change
```

Do not standardize Mastra `useInterrupt` yet. Upstream guidance is evolving and current MDE already has a working tool-based HITL path. Any interrupt migration requires a dedicated spike covering installed package compatibility, AG-UI transport, persistence, refresh/cold-start behavior, duplicate-action prevention, and Playwright approval/rejection proof.

## Efficiency rule

Do not build custom agent-management, prompt-management, tool-testing, workflow visualization, tracing, evaluation, MCP inspection, or observability UIs until Mastra Studio/CLI has been evaluated and found insufficient for the actual production-user requirement.

## Verification contract

Changes to this platform area must verify:

- `npm run check:mastra`
- `npm run lint`
- `npm run typecheck`
- focused Vitest tests
- relevant Playwright journeys
- production build when runtime code changes
- no bare v1 CopilotKit React imports
- no browser `service_role` access
- current agent/tool/workflow registration consistency

A known guardrail gap exists: `package.json` defines `npm run audit:copilotkit-v2`, but the referenced script is not present on current `main`. The roadmap must either restore that check or remove the dead command after equivalent coverage is proven elsewhere.

## Sources of truth

1. Linear — execution status/order.
2. merged GitHub `main` — shipped code truth.
3. source/manifests/tests — runtime truth.
4. live Supabase — data/auth truth.
5. official CopilotKit/Mastra docs and repositories — upstream API/pattern truth.
6. active docs — explanation only.
