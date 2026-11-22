# MDE AI — Complete Mastra Platform Audit-Improvements and Implementation

## Role and objective

Act as a **Senior Mastra Architect, AI Agent Engineer, Systems Debugger, QA Lead, and Implementation Partner** for MDE AI.

**Goal:** Examine the entire existing Mastra implementation, identify defects and missing capabilities, improve its architecture, and implement valuable Core and Advanced Mastra features using the real MDE application.

Prioritize functional user experiences, performance, security, reliability, code reuse, and development speed.

**Project:**

- GitHub: [https://github.com/amoai-tech/mdeai](https://github.com/amoai-tech/mdeai)

- Mastra source: [https://github.com/amoai-tech/mdeai/tree/main/src/mastra](https://github.com/amoai-tech/mdeai/tree/main/src/mastra)

- Local repository: `/home/sk/mdeai`

- Linear: [https://linear.app/amo100/](https://linear.app/amo100/)

- Product: Rentals, Events and Ticketing, AI Concierge, Local Discovery and Admin Operations

- Current phase: **Prelaunch development**


**Critical:** Keep development workflows usable without business approval, listing eligibility, ownership verification, publishing or booking certification gates. Preserve authentication, role authorization, RLS, tenant isolation, truthful data, transaction correctness, idempotency and audit trails. Public-launch business gates activate only when the product owner initiates launch.

Do not replace the existing Mastra implementation with another agent framework, search engine, booking subsystem, MCP platform or vector database.

---

## STEP 1 — Load repository rules and establish the truth

Before making changes:

1. Read `/home/sk/mdeai/AGENTS.md`.

2. Read `.claude/skills/INDEX.md` and the relevant `errors`, `praudit`, `linear-task`, `implement`, `efficient`, `mastra`, `supabase` and `testing` skills as needed.

3. Inspect current `origin/main`, working-tree changes, relevant open PRs and CI results.

4. Verify the live Linear task titles, statuses, owners, acceptance criteria and dependencies.

5. Read `prd.md`, `roadmap.md`, `mvp.md` and applicable product-specific documents.

6. Verify actual installed Mastra packages and TypeScript exports against `package.json` and the lockfile.

7. Consult official Mastra documentation and GitHub source before changing any API.


**Repository baseline to verify:** Mastra Core 1.84.0, Mastra CLI 1.40.0, CopilotKit 1.88.0, AG-UI and the current compatible Mastra package family. Never blindly install `@latest`.

Report mismatches between documentation, dependencies, code, database and live behavior.

**Output:** A short source-of-truth report with commit SHA, runtime versions and areas inspected.

---

## STEP 2 — Inventory the entire Mastra architecture

Inspect these locations and follow their actual imports, registrations and callers:

|Component|Primary location|What to inspect|
|---|---|---|
|Runtime|`src/mastra/index.ts`|Registration, storage, global configuration|
|Agents|`src/mastra/agents/`|All agents, prompts, models, delegation|
|Tools|`src/mastra/tools/`|Tool schemas, execution, security, real data|
|Workflows|`src/mastra/workflows/`|State, suspension, resume, retries|
|Processors|`src/mastra/lib/agent-input-processors.ts` and actual callers|Input/output handling, guardrails, latency|
|Memory|`src/mastra/lib/agent-memory.ts`|Thread scope, retention, concurrency|
|Storage|`src/mastra/lib/storage.ts`|PostgreSQL, durability, failure recovery|
|Scorers|`src/mastra/scorers/`|Faithfulness, grounding and evaluation|
|CopilotKit|`src/mastra/copilotkit/` and Next.js runtime|Streaming, Generative UI, tool actions|
|Studio Builder|`src/mastra-studio/`|Development isolation, capabilities and limitations|
|MCP/Knowledge|Search whole repository|Existing connections, resources, schemas and missing registrations|

**Important:** MDE currently registers nine agents and four workflows. Start with these implementations. Do not assume a missing directory means a feature is completely absent elsewhere.

Create a Mermaid architecture diagram showing:

User → CopilotKit → Mastra Agent → Tool/Workflow → Existing Domain Service → Supabase → User-visible result.

Include authentication, memory, human interaction, error/retry and audit paths.

**Output:** Inventory table with actual source files, purpose, callers, status and verified evidence.

---

## STEP 3 — Audit every Mastra agent

Examine Concierge, Router, Rentals, Events, Host Events, Host Operations, Partners, Evaluation, Ping, and any additional agents discovered.

For each agent, verify:

- Purpose and real-world benefit

- Exact model and provider configuration

- Registered tools and allowed capabilities

- Prompt quality and tool selection

- Input/output schema validation

- RequestContext and identity propagation

- Thread memory and persistence

- Response accuracy and citations

- Streaming, cancellation and recovery

- Token consumption, latency and API costs

- Duplicate logic between agents

- Integration with CopilotKit


Test real examples:

**Rentals:** “Find furnished two-bedroom apartments in Laureles below COP 3 million.”

**Events:** “Find live music this weekend and show actual event cards.”

**Concierge:** “Compare these apartments, explain the differences and show them on a map.”

**Host Operations:** “Which upcoming event bookings require attention?”

**Decision:** Improve existing agents first. Add supervisor/subagent delegation only when a measurable cross-domain user journey benefits.

---

## STEP 4 — Audit tools and discover missing capabilities

Inspect every tool's `createTool()` definition, schema, caller, execution code and output.

Check for:

- Incorrect or missing parameters

- Tool calls that return empty or fabricated results

- Unauthorized or cross-tenant data access

- Inconsistent `RequestContext`

- Broken external API integrations

- Missing timeouts and cancellation

- Duplicate searching or filtering

- Tool execution errors hidden by fallback responses

- Excessive LLM/tool loops

- Missing source attribution

- Incorrect map coordinates or availability

- Consequential actions without server-side authorization

- Retry behavior that duplicates domain records


Reuse existing Supabase RPCs, Maps/Places integrations, rental and event search, and domain services.

Evaluate native Mastra tools, structured output, conditional tool selection, built-in search/fetch, `toModelOutput`, and ToolSearchProcessor.

**Do not introduce ToolSearchProcessor simply because it exists.** First measure whether the actual tool inventory has a selection or context-cost problem.

**Output:** One row per tool: correct, broken, incomplete, duplicate or unused; include exact corrective action.

---

## STEP 5 — Audit all workflows and durable execution

Inspect the existing:

1. Rental Search workflow

2. Event Discovery workflow

3. Event/Venue Booking workflow

4. Sales Insight workflow


Trace each from user action to actual persisted result.

Evaluate:

- Workflow input/output schemas

- Control flow and state sharing

- Snapshots and persistence

- Suspend/resume

- Human-in-the-loop

- Error handling

- Retries and backoff

- Process restarts

- Concurrent execution

- Cancellation propagation

- External API failures

- Idempotency and transaction boundaries

- Observability and tracing


**Critical:** A successful Mastra run does not prove a successful booking, lead, ticket or payment. Verify the actual Supabase transaction and applicable payment/webhook result.

Test retries and process restarts without duplicate bookings, leads, tickets or payments.

Compare fixed workflows against dynamic workflows. Do not replace deterministic business workflows with dynamic agent-generated workflows without a proven benefit.

---

## STEP 6 — Review all processors and guardrails

Inspect the actual input processors, agent-level configuration and output handling.

Specifically examine the existing `TokenLimiter` and optional `PromptInjectionDetector` configuration.

Measure:

- Prompt processing time

- Additional model round trips

- Total token consumption

- False positives and false negatives

- Prompt injection from retrieved websites/listings

- Model/tool output schema violations

- Unsafe tool escalation

- Sensitive information in traces

- Behavior after processor failure

- Streaming compatibility


The current prompt-injection detector is configurable. Treat that as an architecture choice to **evaluate**, not automatically as a defect.

Recommend lightweight deterministic protection for cheap operations and targeted stronger protection for higher-risk retrieved content or actions.

Never weaken server-side authorization as a performance optimization.

---

## STEP 7 — Audit MCP architecture

Inspect current MCP usage across the application, agent configuration, Studio and external services.

Verify whether MDE needs:

- Native Mastra tools

- Mastra MCPClient

- A curated MCPServer

- Built-in `/api/mcp`

- External provider connections


**Decision matrix:**

|Need|Preferred solution|
|---|---|
|Existing internal MDE capability|Native Mastra tool|
|Existing Supabase business operation|Existing service/RPC through a typed tool|
|External service offering useful MCP tools|MCPClient|
|External agents need MDE functionality|Curated MCPServer|
|Only need to display more Studio tools|No implementation|

For any proposed MCP integration, prove authentication, tool-level authorization, tenant isolation, compatible protocol version, credential handling, timeout/reconnect, error recovery and a real user benefit.

Do not expose every internal MDE tool through MCP by default.

---

## STEP 8 — Assess Mastra Knowledge and memory

Investigate whether Mastra Knowledge would improve MDE without duplicating Supabase or pgvector.

Potential Knowledge content:

- MDE product help and feature documentation

- Concierge operational instructions

- Event-host setup guidance

- Super Admin runbooks

- Rental and booking process explanations

- Troubleshooting and customer support FAQs


**Separate knowledge from live facts.**

Actual listings, prices, availability, ownership, events, tickets, payments and user-specific records remain in their canonical database/domain services.

Knowledge is currently an alpha Mastra capability. Verify compatibility with the pinned runtime and storage before implementation.

Start with non-sensitive, read-only documentation. Do not rely on Knowledge scope rules alone to protect confidential tenant data.

Test citations, document updates, removed-source retirement, missing answers, persistence and scoped access.

Also audit working-memory scope, stale preferences, thread replay, concurrent updates, storage cleanup and cross-instance behavior.

---

## STEP 9 — Evaluate tracing, scorers and AI quality

Reuse existing faithfulness and grounding-coverage scorers.

Add only the evaluation capabilities that improve real product decisions.

Test a repeatable dataset of actual user questions covering:

- Correct rental and event retrieval

- Grounded card/map output

- Correct follow-up context

- Accurate prices and availability

- No fabricated facts

- Correct tools selected

- Agent latency and token costs

- User cancellation

- Error recovery

- Unauthorized user rejection


Measure p50/p95 latency, time to first response, model/tool failure rates, cost per successful request and quality regression rates.

Compare before and after changes using the same questions.

---

## STEP 10 — Recommend Core Mastra features

Score each feature from 0–100 for **implementation priority**, based on user value, current gaps, code reuse, effort, reliability and operational risk.

Evaluate at minimum:

|Core capability|Real-world use case|
|---|---|
|Reliable tool calling|Concierge consistently finds correct apartments|
|Durable memory|Follow-up remembers the selected rental|
|Workflow recovery|Venue request survives reconnect/restart|
|Reliable HITL actions|Confirmed viewing creates one saved record|
|Structured outputs|Real cards/maps receive valid data|
|Grounding and source attribution|Agent shows exact event source|
|Error and retry management|External API outage returns honest recovery|
|Processor improvements|Faster responses with safe handling|
|Tracing and evaluation|Detect failing questions before release|
|Read-only operational Knowledge|Host gets a cited setup answer|

For each feature identify **Already working / Needs fixing / Missing / Unnecessary**, with file changes, tests and task owner.

Implement verified Core deficiencies before adding optional Advanced features.

---

## STEP 11 — Evaluate Advanced Mastra features

Consider the following **only when justified by existing product requirements and measurable improvements**:

|Advanced capability|Example|
|---|---|
|Supervisor and specialist delegation|Concierge consults Rentals, Events and Research agents|
|Dynamic workflows|Authorized admin configures a reusable process|
|Advanced workflow state/recovery|Long-running multi-step event operations resume accurately|
|Context-aware tool discovery|Large validated tool inventory is selected efficiently|
|External MCP connections|Authorized business data from a needed external provider|
|Curated MCPServer|Another authorized agent can reuse an MDE capability|
|Knowledge-assisted operational support|Cited host instructions without leaking private data|
|Agent quality experiments|Compare agent prompts/models against the same dataset|
|Cost-aware model routing|Use cheaper models for simple requests when quality holds|
|Advanced tracing and diagnostics|Identify slow/error-prone steps and their causes|

For each, document prerequisites, expected user value, complexity, runtime compatibility, operational risk and proof needed.

Reject features that add duplicate infrastructure or unnecessary latency.

---

## STEP 12 — Identify defects, red flags and blockers

Produce a forensic issue table.

For each finding include:

- Exact file, function and line

- User-visible symptom

- Reproduction steps

- Root cause and evidence

- Severity P0/P1/P2/P3

- Scope of impact

- Smallest canonical fix

- Existing Linear issue and PR, if any

- Required test

- Confidence level

- Status: proven defect, risk or unknown


Prioritize broken real user journeys over theoretical architecture improvements.

Explicitly examine stale model/tool APIs, memory lost across instances, concurrency, duplicate retries, wrong-org data, broken MCP credentials, unavailable storage, false AI success and misleading error fallbacks.

Do not label something broken without reproducing or citing reliable evidence.

---

## STEP 13 — Verify Linear and produce the implementation roadmap

Search the existing SAN issues before creating anything.

Use only **verified exact Linear task names** in the form `SAN-#### · Exact Task Name`.

Do not duplicate tickets for capabilities already owned by another task.

Categorize work:

- **Core now:** Real defects and missing essential product functionality

- **Advanced next:** Useful improvements with dependencies satisfied

- **Post-MVP:** Nonessential capabilities

- **Obsolete:** Superseded or duplicated work


Prioritize by:

1. Broken user journey

2. Security or transaction correctness

3. Reuse of existing infrastructure

4. User value

5. Time/cost to deliver

6. Dependencies

7. Measurable performance or reliability improvement


Make tasks small enough to implement, test and review independently.

---

## STEP 14 — Implement and verify

After the audit, **do not stop at recommendations**.

For verified and authorized development work:

1. Choose the highest-impact existing task.

2. Reproduce the defect or establish the missing capability.

3. Inspect its canonical implementation owner.

4. Reuse existing code, service, schema, tools and workflows.

5. Make the smallest correct change.

6. Add focused regression tests.

7. Run relevant `npm run test:mastra`, lint, typecheck, schema checks and `npm run floor` before merge.

8. Test the actual Next.js/CopilotKit UI, API and persisted Supabase result.

9. Verify unauthorized actors fail and retries do not duplicate effects.

10. Verify 390px mobile where UI changes are involved.

11. Commit/push a focused branch and create/update the PR.

12. Recheck PR reviews, CI and exact head.

13. Update the existing Linear issue with proof and next action.


Do not merge without required review/CI, and do not perform destructive production actions or change production AI models without the required owner approval.

---

## STEP 15 — Produce the final Progress Task Tracker

Deliver one concise table with these columns:

|Priority|Linear task|Component|Feature / defect|Status|Complete|PR|Evidence|Next action|
|---|---|---|---|---|---|---|---|---|

**Status colors:**

- 🟢 Completed — verified for the exact task scope

- 🟡 In progress — implementation or proof incomplete

- 🔴 Failed — confirmed defect

- 🔵 Not started — missing implementation


Use a percentage only when evidence supports it. Explain the scoring rules. Do not mistake an existing agent file, green CI, a Studio listing or a completed document for proven product readiness.

Provide:

1. Executive summary

2. What is currently working

3. Proven problems and root causes

4. Core improvement table, scored /100

5. Advanced feature table, scored /100

6. Existing Linear ownership and PRs

7. Smallest ordered implementation roadmap

8. Files/code to change

9. Tests and real-world acceptance criteria

10. Changes actually implemented, with proof

11. Blockers and exact next action


Use Mermaid diagrams for architecture and user journeys.

**Final rule:** Prefer working functionality, reuse, straightforward architecture and measured improvements. Make MDE's existing Mastra + CopilotKit + Supabase platform better rather than creating a second system.

---

## Official references to inspect

### Agents and processors

- [https://mastra.ai/docs/agents/overview](https://mastra.ai/docs/agents/overview)

- [https://mastra.ai/docs/agents/tools](https://mastra.ai/docs/agents/tools)

- [https://mastra.ai/docs/agents/processors](https://mastra.ai/docs/agents/processors)

- [https://mastra.ai/docs/agents/supervisor-agents](https://mastra.ai/docs/agents/supervisor-agents)

- [https://mastra.ai/docs/agents/human-in-the-loop](https://mastra.ai/docs/agents/human-in-the-loop)

- [https://mastra.ai/docs/memory/overview](https://mastra.ai/docs/memory/overview)


### Workflows

- [https://mastra.ai/docs/workflows/workflow-state](https://mastra.ai/docs/workflows/workflow-state)

- [https://mastra.ai/docs/workflows/control-flow](https://mastra.ai/docs/workflows/control-flow)

- [https://mastra.ai/docs/workflows/agents-and-tools](https://mastra.ai/docs/workflows/agents-and-tools)

- [https://mastra.ai/docs/workflows/snapshots](https://mastra.ai/docs/workflows/snapshots)

- [https://mastra.ai/docs/workflows/suspend-and-resume](https://mastra.ai/docs/workflows/suspend-and-resume)

- [https://mastra.ai/docs/workflows/error-handling](https://mastra.ai/docs/workflows/error-handling)

- [https://mastra.ai/docs/workflows/dynamic-workflows](https://mastra.ai/docs/workflows/dynamic-workflows)

- [https://mastra.ai/docs/workflows/time-travel](https://mastra.ai/docs/workflows/time-travel)


### MCP

- [https://mastra.ai/docs/connections/mcp](https://mastra.ai/docs/connections/mcp)

- [https://mastra.ai/docs/server/mcp](https://mastra.ai/docs/server/mcp)

- [https://mastra.ai/reference/tools/mcp-client](https://mastra.ai/reference/tools/mcp-client)

- [https://mastra.ai/reference/tools/mcp-server](https://mastra.ai/reference/tools/mcp-server)

- [https://mastra.ai/docs/guides/mcp-authentication-authorization](https://mastra.ai/docs/guides/mcp-authentication-authorization)


### Knowledge, quality and operations

- [https://mastra.ai/docs/knowledge/overview](https://mastra.ai/docs/knowledge/overview)

- [https://mastra.ai/docs/knowledge/scopes-and-access](https://mastra.ai/docs/knowledge/scopes-and-access)

- [https://mastra.ai/docs/knowledge/agents-and-tools](https://mastra.ai/docs/knowledge/agents-and-tools)

- [https://mastra.ai/docs/knowledge/load-your-content](https://mastra.ai/docs/knowledge/load-your-content)

- [https://mastra.ai/docs/studio/knowledge](https://mastra.ai/docs/studio/knowledge)

- [https://mastra.ai/docs/observability/overview](https://mastra.ai/docs/observability/overview)

- [https://mastra.ai/docs/storage](https://mastra.ai/docs/storage)

- [https://mastra.ai/docs/studio/overview](https://mastra.ai/docs/studio/overview)


### Official and example GitHub repositories

- [https://github.com/mastra-ai/mastra](https://github.com/mastra-ai/mastra)

- [https://github.com/mastra-ai/mastra/tree/main/examples](https://github.com/mastra-ai/mastra/tree/main/examples)

- [https://github.com/mastra-ai/workflow-builder-template](https://github.com/mastra-ai/workflow-builder-template)

- [https://github.com/mastra-ai/personal-assistant-example](https://github.com/mastra-ai/personal-assistant-example)

- [https://github.com/mastra-ai/mcp-server-best-practice-workshop](https://github.com/mastra-ai/mcp-server-best-practice-workshop)

- [https://github.com/mastra-ai/workshops](https://github.com/mastra-ai/workshops)

- [https://github.com/mastra-ai/skills](https://github.com/mastra-ai/skills)


For every material reference, record its source URL, version/commit where relevant, the specific feature, whether to **COPY / ADAPT / MODEL / REFERENCE ONLY**, the destination in MDE, and the tests proving it works.

**Execution priority:** Verify → reuse → fix Core → test actual journeys → measure → add valuable Advanced features → independently verify → update GitHub and Linear.
