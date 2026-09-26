# MDE Rentals — Finding a Home

**Purpose:** define how renters search for eligible homes and how MDE ranks the valid results.

## Search flow

```mermaid
flowchart LR
  U["Renter describes needs"] --> H["Hard requirements"]
  H --> SQL["Supabase filters eligible listings"]
  SQL --> GEO["Location fit"]
  GEO --> RANK["Best-match ranking"]
  RANK --> UI["Cards + map"]
  UI --> REFINE["Refine search"]
```

## Request sequence

```mermaid
sequenceDiagram
  autonumber
  actor Renter
  participant UI as Rental UI
  participant API as Search API
  participant Tool as search-rentals
  participant DB as Supabase
  participant Rank as Ranking layer
  Renter->>UI: Search requirements
  UI->>API: Structured search request
  API->>Tool: Validate and search
  Tool->>DB: Apply hard filters
  DB-->>Tool: Eligible listings
  Tool->>Rank: Rank eligible set
  Rank-->>UI: Ordered rental cards + map data
```

## Rules

- Price, bedrooms, active status, dates, ownership and authorization are deterministic constraints.
- AI may rank or explain eligible listings; it must not reintroduce ineligible listings.
- Production search must not silently present demo inventory as live inventory.
