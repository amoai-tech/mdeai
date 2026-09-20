# MDE Rentals — Production Support

**Purpose:** provide a simple diagnosis and recovery path when the rental journey fails in production.

## Incident flow

```mermaid
flowchart TD
  ALERT["Rental issue reported"] --> SCOPE["Identify affected journey step"]
  SCOPE --> DATA{"Data/API healthy?"}
  DATA -->|no| DB["Check Supabase/API/auth"]
  DATA -->|yes| AI{"AI/ranking issue?"}
  AI -->|yes| FALLBACK["Use deterministic safe path"]
  AI -->|no| UI["Check UI/map/viewing flow"]
  DB --> FIX["Apply bounded fix or safe recovery"]
  FALLBACK --> VERIFY["Run smoke journey"]
  UI --> FIX
  FIX --> VERIFY
  VERIFY --> CLOSE["Close only after production proof"]
```

## Production rules

- Never substitute mock inventory for live data without an explicit demo label.
- Consequential writes fail closed when authorization or transaction proof is unavailable.
- Recovery ends with a renter + broker smoke test.
