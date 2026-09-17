# Architecture

Current MDE AI system architecture and durable technical decisions.

## Start here

| Document | Purpose |
|---|---|
| [`system-overview.md`](system-overview.md) | End-to-end runtime architecture: Next.js, CopilotKit, Mastra, Gemini, Supabase, Maps, payments, security, observability, and data flow |
| [`data-model.md`](data-model.md) | Live Supabase data model, domain ERDs, pgvector/intelligence data flow, approval/outbox model, and database trust boundaries |

## Source-of-truth rule

Architecture claims must be rewritten from:

1. live/current runtime evidence where available;
2. merged GitHub `main`;
3. current source code and `src/app` routes;
4. live Supabase schema + merged migrations for data architecture;
5. package manifests and tests;
6. Linear only for planned work and live execution status.

Do not use old SHAs, local machine paths, stale percentages, archived task descriptions, or PRD intent as implementation truth.

## Diagram policy

Use Mermaid diagrams when they make relationships or execution flow easier to understand. Prefer:

- `flowchart` for system and data-flow views;
- `sequenceDiagram` for request/transaction flows;
- `erDiagram` for relational data models;
- `stateDiagram-v2` for durable state transitions.

Keep large database diagrams split by domain instead of creating one unreadable global ERD.

Mermaid documentation: https://mermaid.ai/open-source/intro/
