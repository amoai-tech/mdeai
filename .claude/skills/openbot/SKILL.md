---
name: openbot
description: >-
  Use when evaluating or adapting optional OpenBot AI coworker integrations
  for MDE, particularly external-browser/computer actions, isolated version
  proof, Mastra/AG-UI connectivity, server-side action policies, auditing,
  rollback and disablement. Do not invoke for native rental search or MDE UI.
---

# Optional OpenBot coworker for MDE

## Ownership and limits

OpenBot is an **optional external computer-use service**, not MDE's agent
runtime. [real-estate](../real-estate/SKILL.md) owns normal rental search/leads,
[copilotkit](../copilotkit/SKILL.md) owns MDE's AG-UI/runtime,
[mastra](../mastra/SKILL.md) owns agents/tools, and
[supabase](../supabase/SKILL.md) owns RLS/DB security.

Do not install OpenBot, expose a single-user demo bypass, add a parallel
rental AI/search/booking engine, copy its app-specific TanStack data layer, or
treat upstream marketing as verified MDE capabilities. Phase A keeps *technical*
authorization, data isolation and audit; no business certification gates.

## Decision and procedure

1. Identify the **actual external task** and actor. Can an existing authorized
   MDE API/MCP/Mastra tool complete it? If yes, use that; stop OpenBot work.
2. For a browser-only gap, inspect the official upstream release/commit and
   [source map](references/source-map.md). Do not equate upstream `main`,
   an example harness, or a local smoke with a verified deployment.
3. Under SAN-1324, separately prove the official pinned release, required
   services, authentication, AG-UI-to-Mastra transport and a safe rollback.
   SAN-1325 owns connecting it to the existing MDE rental AI; do not
   implement that bridge while only writing this skill.
4. For external computer actions, resolve targets **on the server**, apply
   deny-over-allow policy to verified targets, record audit before action,
   maintain caller/tenant isolation and reject forged action references.
5. Keep optional service failure from disabling native search/viewing flows.
   Test unauthorized caller, target spoofing, retries, timeouts, kill switch
   and external-action result evidence before proposing any enablement.
6. Report exact release/SHA, observed proof and unresolved risks. Do not
   invent that an external form was submitted or that OpenBot is installed.

## Examples

"Broker must interact with a third-party portal that has no API" → native-tool
check → SAN-1324 isolated proof → SAN-1325 optional adapter only if justified.

"Search Medellín rentals and show map cards" → **not this skill**; use MDE's
existing rental/concierge path.

## References and checks

- [Source-to-destination map](references/source-map.md) for optional computer
  use, audit, Mastra example and upstream-only app implementation rules.
- [Behavior probes](evals/evals.json) and
  [Trigger / near-miss probes](evals/trigger-evals.json).
- SAN-1551 owns upstream watch/pins. This skill adds **no new scheduler**.
