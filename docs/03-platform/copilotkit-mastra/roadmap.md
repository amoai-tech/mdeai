# Task 53.3 · MDE-AI-ROADMAP-001 — CopilotKit + Mastra Technical Roadmap

This is a durable capability roadmap, not a live task tracker. Linear owns issue status, priority, ownership, and sequencing.

## Roadmap principles

1. Keep the existing runtime architecture unless a measured problem justifies change.
2. Use built-in platform capability before custom infrastructure.
3. Extend a small number of durable agents instead of creating an agent per screen.
4. Use tools for single typed capabilities and workflows for explicit multi-step orchestration.
5. Keep privileged state changes deterministic, authorized, idempotent, and RLS-aware.
6. Upgrade CopilotKit/Mastra APIs only in dedicated compatibility work, never incidentally inside feature tasks.

## NOW — stabilize and standardize

### Task 53.3A · MDE-CK-MASTRA-BRIDGE-001 — Keep the current bridge boring

Success criteria:

- one canonical `/api/copilotkit` route;
- per-request user/resource identity propagated into Mastra;
- host tools keep the user-scoped Supabase client;
- AI-run persistence continues after streamed responses;
- no duplicate/parallel agent runtime introduced.

### Task 53.3B · MDE-CK-GUARDRAIL-001 — Repair CopilotKit API-surface verification

Current gap: `package.json` defines `npm run audit:copilotkit-v2`, but current `main` does not contain the referenced script.

Required outcome:

- restore the missing verification script **or** replace the command with equivalent tested coverage;
- fail CI on new bare-v1 `@copilotkit/react-core` imports in active source;
- verify registered UI agent IDs exist in the Mastra registry;
- keep package pins explicit.

Do not leave a dead npm command that gives false confidence.

### Task 53.3C · MDE-HITL-STANDARD-001 — Standardize consequential actions

Keep `useHumanInTheLoop` as the production UI approval primitive for current MDE.

For every consequential action:

```text
agent proposal
→ human review
→ deterministic authorization
→ atomic/idempotent backend operation
→ Supabase/RLS truth
```

Do not treat frontend approval UI as authorization by itself.

### Task 53.3D · MDE-MASTRA-STUDIO-001 — Studio/CLI before custom admin tooling

Use Mastra's built-in Agents, Tools, Workflows, Request Context, Workspaces, MCP, Scorers, Datasets, Experiments, Traces, Metrics and Logs before planning custom developer dashboards.

Custom MDE admin tooling is justified only for product/user requirements that Studio cannot satisfy.

### Task 53.3E · MDE-MASTRA-PERSISTENCE-001 — Prove production continuity

Verify Postgres-backed Mastra persistence across:

- multi-turn chat;
- page navigation;
- Vercel/serverless cold start;
- user/resource isolation;
- workflow state where used;
- failure/retry behavior.

Local in-memory LibSQL remains a development convenience, not production truth.

### Task 53.3F · MDE-CK-SHARED-STATE-001 — Standardize app context and render state

Use official CopilotKit primitives for:

- app context;
- agent/shared state;
- frontend tools;
- tool rendering;
- HITL rendering.

Map/card/chat state should converge on one domain state contract instead of parallel custom bridges.

## NEXT — evaluation, reuse and observability

### Task 53.3G · MDE-MASTRA-EVALS-001 — Make scorers/datasets part of delivery

Use Mastra scorers, datasets and experiments for repeatable quality checks on:

- tool selection;
- groundedness/faithfulness;
- structured result completeness;
- workflow outcomes;
- latency/cost regressions where measurable.

A feature is stronger when quality can be rerun against a stable dataset instead of relying only on manual chat testing.

### Task 53.3H · MDE-GENUI-REUSE-001 — Reusable generative UI patterns

Create/reuse a small catalog of controlled components for:

- search result cards;
- approval cards;
- comparison blocks;
- booking/payment status;
- host operational summaries;
- map-linked results.

Prefer controlled tool rendering for trusted product workflows before open-ended UI generation.

### Task 53.3I · MDE-CROSS-SCREEN-STATE-001 — Persistent workspace context

Extend proven Host OS persistence patterns to other multi-screen experiences only where the product needs continuity.

Success means thread/context survives navigation without remounting providers unnecessarily or duplicating chat chrome.

### Task 53.3J · MDE-AI-OBSERVABILITY-001 — One traceable AI execution path

Connect current AI-run logging and Mastra observability so an operator can answer:

- which agent ran;
- which tools/workflows ran;
- which user/resource context applied;
- what failed;
- latency/token/cost where available;
- whether the final state change committed.

Use built-in Mastra observability first.

## LATER — only after measured need

### Task 53.3K · MDE-INTERRUPT-SPIKE-001 — Evaluate native interrupt flow

This is a compatibility spike, not a migration commitment.

Prove:

- exact pinned/new package compatibility;
- AG-UI interrupt transport;
- suspend/resume;
- Postgres persistence;
- page refresh;
- cold start;
- approval/rejection UX;
- duplicate-action prevention;
- Playwright proof.

Adopt only if it is clearly safer/simpler than current `useHumanInTheLoop` flows.

### Task 53.3L · MDE-COPILOTKIT-UPGRADE-001 — Evaluate package upgrade

Do not combine this with product features.

Required before upgrade:

- official migration docs;
- API/import diff;
- example compatibility review;
- current runtime/auth parity;
- thread/HITL/shared-state regression suite;
- rollback plan.

### Task 53.3M · MDE-MCP-001 — Add MCP where it removes bespoke integration code

Use MCP only where a maintained MCP server gives a simpler, auditable capability boundary than a custom integration.

Do not convert existing safe typed tools to MCP solely for architectural novelty.

### Task 53.3N · MDE-MULTI-AGENT-001 — Add agents only for durable ownership boundaries

A new agent requires a durable reason such as:

- distinct tool/security boundary;
- persistent domain responsibility;
- independently evaluated behavior;
- separate long-lived context.

Otherwise add a tool/workflow to an existing agent.

## Reference-first implementation flow

```mermaid
flowchart LR
  R[Requirement]
  A[Existing MDE pattern]
  S[Mastra Studio / CLI]
  C[CopilotKit primitive]
  M[Mastra primitive]
  E[Official examples/templates]
  X[Small custom code]

  R --> A --> S --> C --> M --> E --> X
```

Stop at the earliest layer that solves the requirement correctly.

## Production readiness checklist

- [ ] Auth identity resolved server-side.
- [ ] Supabase RLS/user scoping preserved.
- [ ] No browser `service_role` usage.
- [ ] Consequential actions require deterministic authorization and approval when appropriate.
- [ ] Tool/workflow input and output schemas are typed/validated.
- [ ] Thread/resource IDs do not cross users.
- [ ] Postgres persistence proven where continuity matters.
- [ ] Focused unit/integration tests pass.
- [ ] Relevant Playwright user journey passes.
- [ ] `npm run check:mastra` passes.
- [ ] Production build passes for runtime changes.
- [ ] Observability/evidence exists for the failure boundary changed.

## Anti-patterns

Avoid:

- one agent per screen;
- custom transport when AG-UI already carries the interaction;
- custom developer dashboards before Studio/CLI evaluation;
- LLM output as authorization;
- service-role browser access;
- feature work mixed with framework migration;
- copying upstream examples without checking pinned MDE APIs;
- maintaining a second execution queue in Markdown.

## Official references

- https://docs.copilotkit.ai/mastra
- https://github.com/CopilotKit/CopilotKit/blob/main/examples/README.md
- https://github.com/CopilotKit/CopilotKit/tree/main/examples/integrations/mastra
- https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra
- https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra-pm
- https://mastra.ai/docs
- https://mastra.ai/docs/studio/overview
- https://mastra.ai/docs/evals/overview
- https://github.com/mastra-ai/mastra
- https://github.com/mastra-ai/template-agent-harness
- https://github.com/mastra-ai/skills
