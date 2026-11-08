# SAN-368 — Wi-Fi follow-up must stay unknown (2026-11-08)

Production `9c5a7e0c`: after Google café results, “Which café has reliable Wi-Fi?” produced inferred
claims (“Café Euge … suggests it is prepared for laptop work”; “Café Primavera has no notable
connectivity mention”). The grounded rows carry no Wi-Fi/power/seating fields.

## Fix

- New deterministic guard `src/lib/grounded-amenity-guard.ts`.
- If rows exist, the question asks about Wi-Fi/outlets/laptop/seating, and no row has a structured
  amenity field, the Concierge answers:
  “I don't have verified Wi-Fi, power-outlet or seating details for these places … I won't guess.”
- New searches (“find cafés with Wi-Fi”) still go to the provider.

Tests: guard 3 + handler regression; 33 handler tests pass.
