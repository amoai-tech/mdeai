# MDE Rentals — Book a Viewing

**Purpose:** define the renter-to-broker viewing request path.

## Viewing request sequence

```mermaid
sequenceDiagram
  autonumber
  actor Renter
  participant UI as Rental UI
  participant API as Viewing API
  participant Auth as Authorization
  participant DB as Atomic viewing RPC
  participant Broker as Broker Dashboard
  Renter->>UI: Choose listing and time
  UI->>Renter: Confirm viewing request
  Renter->>UI: Confirm
  UI->>API: Submit request
  API->>Auth: Verify user + listing access
  Auth-->>API: Authorized
  API->>DB: Commit lead + showing atomically
  DB-->>API: Committed result
  API-->>UI: Truthful confirmation
  DB-->>Broker: Authorized lead/showing visible
```

## Viewing state

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Confirmed: renter approves
  Confirmed --> Committed: atomic DB commit
  Confirmed --> Failed: authorization/DB failure
  Committed --> BrokerFollowUp
  BrokerFollowUp --> Completed
  BrokerFollowUp --> Cancelled
  Failed --> Draft: retry
```

## Rules

- A success message appears only after the database commit succeeds.
- Duplicate/concurrent submissions must not create inconsistent records.
- Only the authorized broker/owner can see the committed request.
