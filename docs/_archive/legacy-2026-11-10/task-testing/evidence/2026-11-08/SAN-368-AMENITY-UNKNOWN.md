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

## Review fixes on PR #826 (six requested comments)

- **Agent-route bypass:** the shared \`sendConciergeUserMessage\` pipeline invokes the current-results amenity guard before router classification, so general/agent route does not skip it.
- **Contextual vs new search:** accent-normalized English/Spanish classifier recognizes “which of these … recommend … near” while “Find/Show/Are there cafés with Wi-Fi?” still searches, and rental/apartment questions keep their own route.
- **Stale results:** compare co-agent café IDs against the existing fast-path panel or the current Mastra-rendered café cards; the existing rich-card context records current IDs and clears them on replacement/new chat.
- **Structured facts:** typed Wi-Fi/outlets/seating (including explicit false) survive the grounded result schema, parser, fast-path memory and Mastra working-memory schema. Current Google Places Text Search has not established those amenities. A Wi-Fi presence boolean never establishes reliability.
- **Truthful copy:** unknown response no longer claims summaries are absent.
- **Regression proof:** six focused review suites 150/150, expanded renderer suite 171/171, full Vitest 5,389 passed / 49 skipped, full ESLint pass, TypeScript pass; no SQL migration or new provider.
- **Local Floor caveat:** the release-gates stage ran 809/815 Node test cases successfully, but \`pr-agent-pinned-loader.test.mjs\` failed because the pinned Docker image runs as UID 65534 and cannot traverse this user-owned hidden worktree mount (\`/github/workspace/... Permission denied\`). This is an environment/mount permission limitation, not a proved application regression. Use the normal PR GitHub CI workspace to establish the full Floor gate; do not weaken it.
- **Not claimed:** PR approved/merged, browser production proof or deployment.
