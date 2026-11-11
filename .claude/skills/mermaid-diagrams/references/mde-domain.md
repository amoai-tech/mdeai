# MDE AI domain diagram patterns

Use these only when they expose a real relationship, state, trust boundary, or failure path.

## Core runtime

```mermaid
flowchart LR
  U[User] --> UI[Next.js + CopilotKit]
  UI --> API[/api/copilotkit/]
  API --> M[Mastra agent/workflow]
  M --> G[Gemini]
  M --> S[(Supabase)]
  M --> P[Maps / Places]
  UI --> MAP[Map UI]
```

## Consequential action

```mermaid
flowchart LR
  A[AI proposal] --> R{Human review}
  R -- Reject --> X[Revise or stop]
  R -- Approve --> V[Server revalidates user + artifact]
  V --> W[Idempotent write]
  W --> D[(Durable state)]
  D --> C[Visible confirmation]
```

Use domain-specific variants for events publishing, ticket purchase, rental lead/viewing, partner actions, and admin approvals. Show Stripe/webhook retry paths and Supabase/RLS boundaries when they are material.
