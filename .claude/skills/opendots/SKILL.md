---
name: opendots
description: >-
  Use when adapting OpenDots-style editable AI proposals into MDE: human
  review cards, Accept/Edit/Ignore, exact-draft identity, stale-version
  conflicts, idempotent saves, persisted receipts, or retry/reload recovery.
  Guide the existing MDE review and write paths, not an OpenDots installation.
---

# OpenDots review patterns for MDE

## Ownership and limits

Own **how an AI suggestion is presented, reviewed, and confirmed as saved**.
Use [copilotkit](../copilotkit/SKILL.md) for v2 frontend tool/interrupt hooks,
[mastra](../mastra/SKILL.md) for backend tool lifecycle and
[supabase](../supabase/SKILL.md) for authorization/RLS/atomic writes.
The shared interaction owner is SAN-1548; domain actions stay in domain code.

A user's Accept/Edit/Ignore is **not** a prelaunch business approval,
property-ownership or publication gate. No duplicate page store, SQLite tables,
agent, approval engine or blind database writer. No "saved" message until
server confirmation and persisted readback. Ignore/Cancel writes nothing.

## Procedure

1. Identify the exact user action, target record, current MDE screen, server
   transaction and PR base. Differentiate *proposal received* from *saved*.
2. Read [OpenDots source map](references/source-map.md) for only the matching
   review/recovery pattern; confirm reviewed source commit before adaptation.
3. Reuse MDE's existing field schemas, proposal cards and server-side auth.
   Bind one draft to its proposal/tool-call ID, source evidence, target version
   and idempotency key where the shared contract supports it (SAN-1548).
4. Keep edits visible and editable. Review on the frontend; revalidate user
   and record access on the server at the actual write. Reject changed-draft
   retries and stale target versions without overwriting other edits.
5. Recover a previously committed receipt after timeout or reload; same-draft
   retries return the existing saved result, never a duplicate write.
6. Prove Accept/Edit/Ignore, cancel-no-write, missing source, tenant denial,
   conflict, retry, response loss and persisted readback in the real MDE path.
   This **skill PR** adds guidance/evals, not product schema or save endpoints.

## Example

"AI proposes a café name; owner edits then reloads" → inspect current signup
branch + profile save path; model OpenDots exact-draft review; confirm edited
value from persisted Supabase state instead of assuming a successful UI click.

"Add RLS for partner tables" → **not this skill**; use supabase.

## References and checks

- [Source-to-destination map](references/source-map.md), loaded only for a
  relevant proposal/receipt change.
- [Behavior probes](evals/evals.json) and
  [Trigger / near-miss probes](evals/trigger-evals.json).
- No business prerequisites during Phase A; preserve technical auth, audit and
  atomicity. Report known/unknown proof explicitly.
