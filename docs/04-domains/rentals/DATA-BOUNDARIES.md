# MDE Rentals — Accounts & Permissions

**Purpose:** define ownership and data visibility for renters, brokers, admins and AI tools.

## Core data relationships

```mermaid
erDiagram
  USER ||--o{ VIEWING : requests
  USER ||--o{ SAVED_LISTING : saves
  BROKER ||--o{ APARTMENT : manages
  APARTMENT ||--o{ VIEWING : receives
  VIEWING ||--|| LEAD : creates
  BROKER ||--o{ LEAD : follows_up
```

## Access boundary

```mermaid
flowchart LR
  U["Authenticated user"] --> API["Trusted server/API"]
  API --> RLS["Supabase RLS"]
  RLS --> OWN{"Authorized for row?"}
  OWN -->|yes| DATA["Allowed rental data"]
  OWN -->|no| DENY["Deny access"]
  AI["AI tool"] --> API
```

## Rules

- Ownership and authorization are database/server concerns, not prompt instructions.
- AI tools receive only the data the current user is authorized to access.
- Two-user negative tests must prove cross-broker and cross-user isolation.
