# Task 53.2 · MDE-AI-REFERENCE-001 — CopilotKit + Mastra Official Reference Pack

Use this page before writing custom CopilotKit/Mastra code.

## Required lookup order

1. Current MDE implementation.
2. Mastra Studio / CLI / built-in server capability.
3. CopilotKit primitive.
4. Mastra primitive.
5. Official CopilotKit example.
6. Official Mastra template/skill.
7. Official upstream source.
8. Small custom implementation only when the previous options do not satisfy the requirement.

## CopilotKit — core docs

| Use | URL |
|---|---|
| Mastra integration | https://docs.copilotkit.ai/mastra |
| Agent/app context | https://docs.copilotkit.ai/mastra/agent-app-context |
| Frontend tools | https://docs.copilotkit.ai/mastra/frontend-tools |
| Shared state | https://docs.copilotkit.ai/mastra/shared-state |
| Tool rendering / GenUI | https://docs.copilotkit.ai/generative-ui/tool-rendering |
| HITL overview | https://docs.copilotkit.ai/human-in-the-loop |
| Source repo | https://github.com/CopilotKit/CopilotKit |

## CopilotKit — official examples

| MDE need | Use first | Why |
|---|---|---|
| Runtime integration | https://github.com/CopilotKit/CopilotKit/tree/main/examples/integrations/mastra | Canonical CopilotKit + Mastra starter |
| Shared state / map + cards | https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra | Closest official shared-state canvas pattern |
| Complex workspace | https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra-pm | Shared state, multiple clients, workspace UI |
| Generative cards/tool UI | https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/generative-ui | GenUI/tool rendering patterns |
| CRM/operations workspace | https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/strands-crm | Pipeline/detail/agentic workspace pattern |
| Multi-agent UX reference | https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/a2a-travel | Pattern reference; do not add a second runtime by default |
| Full current catalog | https://github.com/CopilotKit/CopilotKit/blob/main/examples/README.md | Search before custom work |
| All examples | https://github.com/CopilotKit/CopilotKit/tree/main/examples | Broad discovery |

The current upstream examples index contains 61 consolidated examples across integrations, canvas apps, and showcases. Treat the index as an implementation search surface, not merely inspiration.

## CopilotKit — MDE-specific rule

Current MDE packages are pinned to `1.55.2`, while React application code uses `@copilotkit/react-core/v2`.

Do not copy code from current upstream examples blindly. Current upstream examples may target newer APIs/runtime wiring. Before adapting any example:

1. compare imports with installed MDE packages;
2. check current MDE runtime adapter;
3. preserve auth/RequestContext/RLS behavior;
4. reuse only the needed pattern;
5. test it against the pinned stack.

## HITL reference rule

MDE production standard remains tool-based `useHumanInTheLoop` because it is already implemented and verified in the repository.

Do not replace it with `useInterrupt` until a dedicated compatibility task proves the exact installed CopilotKit + AG-UI + Mastra stack end-to-end.

## Mastra — core docs

| Use | URL |
|---|---|
| Full docs | https://mastra.ai/docs |
| Agents | https://mastra.ai/docs/agents/overview |
| Tools | https://mastra.ai/docs/agents/tools |
| Workflows | https://mastra.ai/docs/workflows/overview |
| Suspend/resume | https://mastra.ai/docs/workflows/suspend-and-resume |
| Memory | https://mastra.ai/docs/memory/overview |
| Observability | https://mastra.ai/docs/observability/overview |
| Evals | https://mastra.ai/docs/evals/overview |
| Studio | https://mastra.ai/docs/studio/overview |
| PostgreSQL integration | https://mastra.ai/integrations/databases/postgresql |
| Source repo | https://github.com/mastra-ai/mastra |

## Mastra — official templates and skills

| MDE need | Reference |
|---|---|
| General agent architecture / memory / tasks | https://github.com/mastra-ai/template-agent-harness |
| Deep research | https://github.com/mastra-ai/template-deep-search |
| Browser automation | https://github.com/mastra-ai/template-browser-agent |
| Broader browsing automation | https://github.com/mastra-ai/template-browsing-agent |
| Text-to-SQL / admin analytics | https://github.com/mastra-ai/template-text-to-sql |
| Review-agent architecture | https://github.com/mastra-ai/template-github-review-agent |
| Mastra coding-agent skills | https://github.com/mastra-ai/skills |

## Mastra Studio / CLI first

Before building custom developer tooling, inspect the built-in Mastra surfaces:

| Need | Use first |
|---|---|
| Inspect/test agents | Studio Agents |
| Direct tool test | Studio Tools or `npx mastra api tool execute` |
| Workflow execution/visualization | Studio Workflows |
| Request context inspection | Studio Request Context |
| Workspaces | Studio Workspaces |
| MCP inspection | Studio MCP Servers |
| Scoring | Studio Scorers |
| Evaluation datasets | Studio Datasets |
| Experiments | Studio Experiments |
| Tracing | Studio Traces |
| Metrics | Studio Metrics |
| Logs | Studio Logs |

MDE already runs Mastra locally with:

```bash
npm run dev:agent
```

which maps to `PORT=4111 mastra dev`.

For direct tool execution, current Mastra docs support:

```bash
npx mastra api tool execute <tool-id> '{"key":"value"}'
```

Use `npx mastra api tool execute --schema` to inspect the expected command schema before constructing unfamiliar inputs.

Do not create a custom prompt/tool/workflow admin screen or temporary test script until Studio/CLI has been evaluated and the real requirement is still unmet.

## Real-world pattern selection

### Restaurant/event search result in chat

Prefer:

```text
Mastra tool
→ structured result
→ CopilotKit tool renderer
→ existing MDE ResultCard
→ existing map/card selection state
```

Avoid inventing a new SSE/event protocol and renderer stack.

### Host approval flow

Prefer:

```text
Mastra proposes structured action
→ CopilotKit useHumanInTheLoop
→ user confirms
→ deterministic backend/RPC
→ Supabase RLS/transaction
```

Avoid allowing an LLM-generated approval string to authorize a privileged write.

### Multi-step deterministic operation

Prefer Mastra workflow when ordering/retry/suspend-resume is part of the actual business process. Prefer a normal tool when the operation is a single typed capability.

## Verification before adopting upstream code

For every copied/adapted example or template:

- verify package/API compatibility;
- compare against current MDE source;
- preserve current auth/RLS boundaries;
- preserve thread/resource IDs;
- run focused tests;
- document deviations from upstream;
- never introduce a second agent runtime merely because a showcase uses one.
