# MDE Rentals — Broker Dashboard

**Purpose:** define what an authorized broker sees and does after a renter commits a viewing request.

## Broker journey

```mermaid
journey
  title Broker handles a rental lead
  section New request
    Open broker dashboard: 5: Broker
    See assigned rental lead: 5: Broker
  section Follow-up
    Review renter and viewing details: 5: Broker
    Contact renter: 4: Broker
    Update showing status: 4: Broker
  section Complete
    Mark viewing completed or cancelled: 5: Broker
```

## Responsibility flow

```mermaid
flowchart LR
  R["Committed renter request"] --> RLS["Ownership + RLS check"]
  RLS --> B["Authorized broker dashboard"]
  B --> F["Follow up"]
  F --> S["Update showing status"]
```

## Rules

- Broker A cannot see Broker B's private leads/showings.
- The dashboard reads committed data; it does not trust AI-generated authorization.
