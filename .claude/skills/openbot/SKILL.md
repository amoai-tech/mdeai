---
name: openbot
description: >-
  Use when assessing optional OpenBot external browser/computer actions for
  MDE brokers: API-or-MCP-first feasibility, pinned-version proof, AG-UI/Mastra
  transport, trusted targets, audited policies, tenant isolation, ambiguous
  external retries, rollback and kill-switch checks.
---

# OpenBot — optional external coworker behind one Concierge

## Owner and boundaries

OpenBot is **not installed** and is unnecessary for ordinary MDE rentals,
leads, viewings or chat. [real-estate](../real-estate/SKILL.md) owns rental
flows, [copilotkit](../copilotkit/SKILL.md) the runtime,
[mastra](../mastra/SKILL.md) tools, and
[supabase](../supabase/SKILL.md) private data/RLS. No second agent/search/
booking engine, client service keys, or external-browser review as a Phase A
business ownership/approval requirement.

## Adopt or defer — SAN-1324 first

1. **Find a real gap.** Name signed-in broker, third-party website and action.
   If an authorized MDE API, MCP or Mastra tool can do it, **DEFER OpenBot**.
   A broker's normal lead or viewing action is not justification.
2. **Verify the pinned candidate.** Compare historical v0.0.14 source to
   official candidate release v0.2.0; neither is deployed MDE proof.
   Inspect [source map](references/source-map.md); pin SHA, required
   dependencies, authentication, isolated computer, supervisor, signed
   handoffs, AG-UI/Mastra transport and infrastructure.
3. **Prove migration and rollback.** Release migration
   0052_shared_brokered_accounts changes Composio connections. Reverting to
   0.1.2 can hide accounts connected after upgrade. Older remote signed
   handoffs can be temporarily refused during transition. Test upgrade,
   downgraded account visibility, startup, isolation, recovery and real
   rollback in a separate authorized environment, without production data.
4. **Conditional adapter only.** SAN-1325 adds minimal optional delegation
   behind the existing Concierge only if SAN-1324 proves ADOPT. Propagate
   server-verified actor, tenant, run/thread ID and actual outcome, without
   mounting another CopilotKit runtime or copy of OpenBot's app.
5. **Authorize every external action.** Resolve target references on the
   server from trusted browser snapshots; apply deny-over-allow and deny on
   policy errors; record audit **before** acting. Reject forged references,
   injected page instructions, unauthorized brokers, private-network targets
   and client-provided service credentials (SAN-1326/1327).
6. **Never mistake Stop for rollback.** Distinguish requested, running,
   submitted, confirmed, failed and unknown external status. A chat Stop
   cannot undo Submit already sent to the website. A timeout after Submit
   is **outcome unknown**, not permission to re-submit; reconcile evidence.
   Test retry/idempotency, audit failure, tenant spoofing and off-switch.
7. **Keep native MDE working.** SAN-1328/1329 may surface broker results in
   the same Concierge only after adoption. With OpenBot disabled, rentals,
   viewing and chat work unchanged. Record exact version, logs/evidence and
   ADOPT/DEFER; do not invent external action success.

## Examples and references

"Show my leads" → existing MDE tool; not OpenBot.
"Update external listing portal without an API" → SAN-1324 isolated proof
→ conditional SAN-1325 adapter only if needed.

- [Source-to-destination map](references/source-map.md).
- [Behavior probes](evals/evals.json) and
  [Trigger/near-miss probes](evals/trigger-evals.json).
- No separate updater, scheduler, or vendor skill copied into MDE.
