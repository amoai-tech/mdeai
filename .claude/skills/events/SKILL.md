---
name: events
description: >-
  Use when MDE work changes event creation, host workflows, event publishing, ticket configuration, event discovery, attendee flows, or event-domain rules.
---

# Events

Own event-domain behavior. Stack implementation details remain with `copilotkit`, `mastra`, `supabase`, `stripe`, `nextjs`, and other stack skills.

## Core domain boundaries

- Host creation/editing and publishing must preserve explicit approval where the flow requires HITL.
- Ticket tiers, event capacity, dates, venue, publish state, and buyer-facing availability must stay internally consistent.
- Payment success is owned by verified payment state, never by UI optimism.
- Domain writes must remain organization/user scoped.
- Do not duplicate event state across UI, agent state, and database without an explicit source-of-truth contract.

## Workflow

1. Identify the persona and surface: host creation, discovery, ticket purchase, saved event, or admin operations.
2. Identify the canonical event state and transition being changed.
3. Load only the affected stack skills.
4. Define success/failure/empty/retry states.
5. Verify the user journey and persistence path end to end.

## Handoff

Use `stripe` for payment mechanics, `supabase` for persistence/RLS, `mastra` for agent logic, `copilotkit` for AI UI/runtime, `maps` for venue/place behavior, and `nextjs` for framework-specific behavior.
