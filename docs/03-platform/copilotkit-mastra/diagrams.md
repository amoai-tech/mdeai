# Task 53.M.40 · MDE-MASTRA-MERMAID-001 — Mastra Architecture Diagrams

These diagrams are the visual architecture reference for the current MDE CopilotKit + Mastra runtime.

## Diagram rules

Use Mermaid as executable documentation, not decoration:

- use `flowchart LR` for system/data flow and `flowchart TD` for decision trees;
- use `sequenceDiagram` when request order, approval, suspend/resume, or retries matter;
- group trust/ownership boundaries with named `subgraph` blocks;
- keep node IDs short and labels explicit; quote labels when punctuation is needed;
- keep one question per diagram; split large diagrams instead of creating a wall of nodes;
- use solid arrows for current behavior and dotted arrows only for clearly labeled proposed behavior;
- do not depend on custom colors/styles for meaning; GitHub, Linear, light and dark themes must all remain readable;
- avoid Mermaid parser hazards such as lower-case `end` as a node identifier;
- prefer stable flowchart/sequence syntax over newer beta-only diagram types when GitHub/Linear rendering compatibility matters.

Official Mermaid references:
- https://mermaid.js.org/intro/
- https://mermaid.js.org/syntax/flowchart.html
- https://mermaid.js.org/syntax/sequenceDiagram

## Current MDE trust boundaries

```mermaid
flowchart LR
  subgraph Browser["Browser / React"]
    UI["Next.js UI"]
    CKUI["CopilotKit v2 UI"]
  end

  subgraph Server["Trusted Next.js server"]
    API["/api/copilotkit"]
    AUTH["Supabase Auth"]
    RL["Distributed rate limit"]
    RC["Mastra RequestContext"]
    AL["Runtime agent allowlist"]
  end

  subgraph AI["Mastra runtime"]
    AG["4 CopilotKit-exposed agents"]
    TOOL["Typed tools"]
    WF["Registered workflows"]
    LOG["LoggingMastraAgent"]
  end

  subgraph Data["Durable data"]
    RLS["User-scoped Supabase + RLS"]
    PG["Mastra PostgresStore"]
    AIR["public.ai_runs"]
  end
  UI --> CKUI --> API
  API --> AUTH
  API --> RL
  AUTH --> RC
  RC --> AL --> AG
  AG --> TOOL
  AG --> WF
  TOOL --> RLS
  WF --> RLS
  AG --> PG
  AG --> LOG --> AIR
```

Current runtime allowlist:
- `conciergeAgent`
- `hostEventAgent`
- `hostOpsAgent`
- `pingAgent`

The other registered agents remain available to Mastra/Studio but are not exposed by the CopilotKit route by default.

## Authenticated CopilotKit request lifecycle

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as Next.js UI
  participant API as /api/copilotkit
  participant Auth as Supabase Auth
  participant RC as RequestContext
  participant Agent as Allowed Mastra agent
  participant Tool as Typed tool
  participant DB as Supabase RLS
  participant Audit as ai_runs

  User->>UI: Send AI request
  UI->>API: CopilotKit / AG-UI request
  API->>API: Authorization + IP hard ceiling
  API->>Auth: getUser()
  Auth-->>API: user or anonymous
  API->>API: User-aware distributed rate limit
  API->>RC: Create fresh per-request context
  opt authenticated
    API->>RC: Set resourceId, audit userId, scoped Supabase client
  end
  API->>Agent: Run allowlisted agent
  Agent->>Tool: Invoke capability
  Tool->>DB: RLS-governed read/write
  DB-->>Tool: Authorized result
  Tool-->>Agent: Structured result
  Agent-->>UI: Stream AG-UI response
  API-->>Audit: after() persists turn telemetry
```
## Durable workflow suspend/resume lifecycle

Use a Mastra workflow when the business process must survive a pause, restart, approval, or multi-step deterministic transition.

```mermaid
sequenceDiagram
  autonumber
  participant Agent as Agent / server caller
  participant WF as Mastra workflow
  participant Step as Deterministic step
  participant Store as Postgres workflow snapshot
  actor Human as Human approver
  participant DB as Supabase business data

  Agent->>WF: createRun() + RequestContext
  WF->>Step: Validate / prepare
  Step-->>WF: Structured output
  WF->>Store: Persist workflow snapshot
  WF-->>Human: Suspend with review payload
  Human->>WF: Resume with structured decision
  WF->>Store: Load/update snapshot
  alt approved
    WF->>DB: Idempotent authorized mutation
    DB-->>WF: Commit result
  else rejected
    WF-->>Agent: Rejected / no mutation
  end
  WF->>Store: Persist terminal state
```

Best practice: the approval UI is not authorization. The resumed workflow/server path must still validate identity, state, and idempotency before mutation.

## Observability — current and recommended target

```mermaid
flowchart LR
  RUN["CopilotKit agent turn"]
  WRAP["LoggingMastraAgent"]
  TOOL["Tool audit spans"]
  AIR["public.ai_runs"]
  NATIVE["Mastra native spans"]
  STUDIO["Mastra Studio traces / metrics / logs"]
  CORR["Correlation by runId / threadId"]
  OPS["One operator view"]

  RUN --> WRAP
  WRAP --> TOOL
  WRAP --> AIR
  RUN --> NATIVE
  NATIVE --> STUDIO

  AIR -. "recommended" .-> CORR
  STUDIO -. "recommended" .-> CORR
  CORR -. "recommended" .-> OPS
```

Current state has two evidence paths: MDE `ai_runs` telemetry and native Mastra observability. Do not create a third telemetry store. SAN-1003 and SAN-856 should converge them through shared identifiers and ownership rules.

## Storage mode

```mermaid
flowchart TD
  START["Mastra storage initialization"]
  DBURL{"DATABASE_URL configured?"}
  PROD{"Production or Postgres-enabled dev?"}
  PG["PostgresStore: max=3, idleTimeout=10s"]
  MEM["In-memory LibSQLStore: local development only"]
  CORE["Mastra threads / memory / workflow state"]

  START --> DBURL
  DBURL -->|no| MEM
  DBURL -->|yes| PROD
  PROD -->|yes| PG
  PROD -->|MASTRA_DEV_LIBSQL=1| MEM
  PG --> CORE
  MEM --> CORE
```

Production rule: do not use file-based LibSQL on serverless production.

## Recommended improvements

1. **SAN-1302 · MDE-MASTRA-UPGRADE-001 — Pin Mastra package family.** Exact versions first; coordinated upgrade only after compatibility proof.
2. **SAN-547 · AUTH-009 — Prove RequestContext isolation.** Add user A/user B/anonymous/concurrent tests around the diagrammed trust boundary.
3. **SAN-1303 · MDE-MASTRA-PG-001 — Prove storage durability.** Verify workflow snapshot schema/primary-key requirements and cold-start continuity.
4. **SAN-1003 · MASTRA-RE-006 + SAN-856 · ai_runs capture — Unify observability.** Correlate native spans and `ai_runs` with shared run/thread identifiers; do not build a third dashboard first. After SAN-1302 pins the package baseline, make the supported Mastra `observability` configuration explicit in `new Mastra({...})` rather than relying on historical/default behavior.
5. **SAN-1255 · EVOS-14 — Verify agent exposure before pruning.** Keep the 4-agent runtime allowlist explicit, add a contract test for the exposed agent set, and use traces/journeys before deleting registered agents.
6. **Workflow writes — standardize suspend/resume + idempotency.** Money, publish, booking and other consequential mutations should follow the durable workflow pattern when a pause/retry boundary exists.
7. **Evaluation — make diagrams testable.** Each architecture arrow that crosses auth, persistence, workflow, or telemetry boundaries should map to a focused integration test or production evidence item.
8. **Mermaid maintenance — keep diagrams beside canonical architecture docs.** Update diagrams in the same PR whenever the underlying boundary changes; never maintain a second status tracker in diagram labels.

## Mastra references

- https://mastra.ai/docs/server/request-context
- https://mastra.ai/docs/workflows/overview
- https://mastra.ai/docs/workflows/suspend-and-resume
- https://mastra.ai/docs/memory/overview
- https://mastra.ai/docs/observability/overview
- https://mastra.ai/docs/studio/overview
- https://github.com/mastra-ai/mastra
