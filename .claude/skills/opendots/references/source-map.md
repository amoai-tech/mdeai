# OpenDots → reviewed MDE actions (SAN-1555 / SAN-1548)

**Pinned, reviewed reference:** https://github.com/CopilotKit/OpenDots/commit/ab39f2508f3fd23a949837622456f3d61a108e9a
Recorded by https://github.com/amoai-tech/mdeai/pull/426 .
Review patterns only; OpenDots app, SQLite and workspace pages are NOT MDE.

## Source → behavior → owner → proof

1. **REFERENCE ONLY** https://github.com/CopilotKit/OpenDots and
   https://www.copilotkit.ai/opendots → locate source and compare marketing
   with actual pinned code. Destination this map; verify commit, no copied
   database, agent, separate review service or app.
2. **MODEL approval/receipt UI (not Edit itself)**:
   https://github.com/CopilotKit/OpenDots/blob/ab39f2508f3fd23a949837622456f3d61a108e9a/src/client/PageReviewCard.tsx
   → Approve & save, Decline, restoring a result, error/conflict display.
   The file contains NO Edit button. Destination:
   src/components/host/event-publish-approval-panel.tsx and existing partner
   form/review components; #403/#404 components are branch-only until merged.
   Editing belongs to the domain form. Verify edited fields (not original
   suggestion) are what the server stores; Ignore/Cancel zero writes.
3. **ADAPT exact draft + restore**:
   https://github.com/CopilotKit/OpenDots/blob/ab39f2508f3fd23a949837622456f3d61a108e9a/src/client/page-review-decision.ts
   → previous save may commit before its HTTP response; recover by
   thread/toolCall identity and compare stored draft. Upstream permits absent
   reviewDraft for *legacy* receipts; never copy that permissive fallback for
   new MDE actions. Destination src/platform/contracts/review-proposal.ts,
   src/lib/events/review-proposal.ts and canonical partner service.
   Test exact same draft retry, modified same-ID draft conflict, lost response.
4. **MODEL CAS and atomicity; never COPY SQLite**:
   https://github.com/CopilotKit/OpenDots/blob/ab39f2508f3fd23a949837622456f3d61a108e9a/src/server/pages.ts
   → revision precondition, atomic update and conflict response.
   Destination existing Supabase domain RPC/server action, specifically
   supabase/migrations/20261021080000_san814_partner_profile_patch.sql
   for partner partial edits (already merged via #402), event publishing
   transaction, or rental leads/viewing RPC as required by owner.
   Verify tenant denial, concurrent field merges and readback from real row.
5. **MDE contract hardening, not upstream duplication**:
   src/platform/contracts/review-proposal.ts currently permits status saved
   without a persisted savedId/savedAt. Never treat that alone as commit proof.
   Destination src/__tests__/review-proposal.test.ts and domain readback.
   Verify authenticated saved record/receipt persisted across refresh and
   timeout/replay; unknown persisted state never displays "Saved".
6. **REFERENCE ONLY until installed-version proof**:
   https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop
   → compare current @copilotkit/react-core 1.75.0 exports/types and existing
   tools; only ADAPT into the current review UI if it avoids duplicate review
   logic. Verify cancel/no-write, pause/reconnect, keyboard/390px.

AI review is optional user control, NOT a development partner/owner/listing
approval requirement. No second SQLite store, payment/publishing engine, or
third-party credentials in the browser.
