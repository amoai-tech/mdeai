---
name: opendots
description: >-
  Use when implementing OpenDots-style user-reviewed AI proposals in MDE:
  editable drafts in existing forms, Accept/Edit/Ignore, exact-draft binding,
  source evidence, safe authenticated saves, version conflicts, idempotent
  retries, or persisted receipts after refresh. Do not install OpenDots.
---

# OpenDots — review and genuinely save AI suggestions

## Owner and boundaries

Own **AI proposal → user edit/review → confirmed canonical write → durable
receipt**, not a separate editor/store/approval engine. Shared schema owner:
SAN-1548 (src/platform/contracts/review-proposal.ts); domain services own
writes. Use [copilotkit](../copilotkit/SKILL.md) for installed v2 tool/interrupt
compatibility, [mastra](../mastra/SKILL.md) for agent tools, and
[supabase](../supabase/SKILL.md) for transactions and tenant RLS.

Accept/Edit/Ignore is user control over AI suggestions, **not** a prelaunch
business approval or property/photo/publishing eligibility gate. Manual form
submission remains available. Ignore/Cancel writes nothing.

## Implementation procedure

1. **Trace one real action.** Identify signed-in actor, target, existing form,
   allowed fields, API/RPC, transaction and readback. Check actual PR base:
   signup suggestion UI on #403/#404 may not exist on main. Load the matching
   pinned [source map](references/source-map.md).
2. **Model the source accurately.** Upstream OpenDots PageReviewCard.tsx
   provides approve/save, decline and receipt/conflict recovery; **it has
   no Edit button**. Implement editing through existing MDE owner forms and
   bind the *edited final draft*, not the original AI text.
3. **Bind and revalidate before writing.** Reuse proposalId, target,
   baseVersion and draftHash from SAN-1548; include tool-call and source
   identity only if needed. Server must recompute draft binding and authorize
   each write. A prior upstream receipt missing reviewDraft is a **legacy
   compatibility exception**, not a safe default for new MDE saves. Changed
   drafts or stale target revisions reject without overwriting edits.
4. **Require committed readback.** A schema-valid receipt with status "saved"
   does not alone prove a database commit. Derive the outcome from the
   canonical write and authorized readback (real ID/version when available).
   If a response is lost after commit, recover the identical saved result;
   don't issue another irreversible write. Cancel/Ignore/deny: zero writes.
5. **Use existing domain write owner.** Partner profiles reuse SAN-814's
   merged partner_profile_patch RPC; events reuse existing publishing
   transactions; rentals reuse existing lead/viewing RPCs. Never copy
   OpenDots SQLite or add an alternative review database. Migrations belong
   only to verified domain schema gaps.
6. **Prove actual behavior.** Exercise Accept/Edit/Ignore, altered same-ID
   draft, version conflict, two authorized concurrent edits, partner A/B
   isolation, missing evidence, double-click, response loss and refresh.
   Inspect actual persisted records, not just toast or HTTP 200. Run
   focused Vitest/pgTAP/Playwright and exact-head checks.

## Example

A café owner edits AI-suggested description and confirms. A reload displays
the *edited* Supabase value; Ignore writes nothing and a duplicate retry
returns the same persisted outcome.

- [Source-to-destination map](references/source-map.md).
- [Behavior probes](evals/evals.json) and
  [Trigger/near-miss probes](evals/trigger-evals.json).
- Skill routing is not proof of a real database save.
