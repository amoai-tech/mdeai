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

## Workspace surfaces (/app canonical, /host compatibility)

- `/app/events` is the canonical Events workspace. Existing `/host/*` routes remain usable aliases, with shared feature bodies and data loaders rather than page-local copies.
- Change `host-events-content`, `HostDashboardOsShell`, `HostAnalyticsShell`, `HostEventShell`, `src/lib/events/load-host-events.ts`, or `src/lib/events/load-host-dashboard.ts` at their shared owner; keep route-specific navigation/layout separate.
- New surfaces have one canonical `/app` address. Do not create a placeholder with no working action behind it.
- Reuse the existing Host OS context and `HostEventProvider` for wizard/edit AI; do not nest a competing CopilotKit provider.
- When adding a route, extend the existing Events workspace parity proof rather than creating a second fixture harness.

## Workflow

1. Identify the persona and surface: host creation, discovery, ticket purchase, saved event, or admin operations.
2. Identify the canonical event state and transition being changed.
3. Load only the affected stack skills.
4. Define success/failure/empty/retry states.
5. Verify the user journey and persistence path end to end.

## Handoff

Use `stripe` for payment mechanics, `supabase` for persistence/RLS, `mastra` for agent logic, `copilotkit` for AI UI/runtime, `maps` for venue/place behavior, and `nextjs` for framework-specific behavior.
