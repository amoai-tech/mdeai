# MDE Rentals — Map & Neighborhood

**Purpose:** define how rental cards, map pins and location context stay synchronized.

## Map interaction

```mermaid
flowchart LR
  SEARCH["Eligible listings"] --> CARDS["Rental cards"]
  SEARCH --> PINS["Map pins"]
  CARDS -->|select listing ID| STATE["Shared selected listing"]
  PINS -->|select same listing ID| STATE
  STATE --> DETAIL["Property details"]
  BOUNDS["Map bounds"] --> SEARCH
```

## Rules

- Card and pin selection must resolve to the same canonical apartment ID.
- Map bounds may refine search, but cannot bypass hard eligibility rules.
- Location enrichment must not create a second source of listing truth.
