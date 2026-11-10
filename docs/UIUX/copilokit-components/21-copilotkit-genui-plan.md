# 21 · CopilotKit Generative UI — verified plan and next steps

**Scope:** MDE AI prelaunch development (Phase A). Auth, RLS, grounding and idempotency stay; business gates stay out.
**Verified against:** `origin/main` `4d51af18e8`, `@copilotkit/react-core`/`runtime` 1.84.1, `@ag-ui/mastra` 2.0.2, `@mastra/core` 1.81.0.

## 1. Read this before auditing anything

The checkout `docs/copilotkit-mastra-progress-20261106` (`aa9bdfa3a1`) is **636 commits behind `main`**. Three tasks look "missing" there but ship on main: SAN-1630 (A2UI catalog), SAN-1041 (rental comparison), SAN-1631 (AI page filters). Always start from a worktree of current `origin/main`, or you will rebuild shipped work.

## 2. What already exists (do not rebuild)

| Capability | Where |
| --- | --- |
| One shared catalog, id `mde/discovery@1` | `src/components/copilot/a2ui/mde-ui-catalog.tsx` |
| Grounded cards (ID-only, re-resolved from authorized tool results) | same file: `findRentalRow`, `findEventRow` |
| Catalog wired to the agent | `copilot-kit-provider.tsx`, `chat-provider.tsx` |
| Runtime injects `render_ui` + one guide entry per run | `@copilotkit/runtime` `agent-utils.mjs:70-74` |
| Tool reaches Mastra as a client tool | `@ag-ui/mastra` `buildClientTools(input.tools)` |
| Server-owned guide, presence flag only | `src/mastra/lib/generative-ui-context.ts` |
| Chat cards from tool results | `search-tool-renders.tsx`, `search-tool-result-cards.tsx` |

## 3. Architecture (verified)

```
Browser                          Server                        Mastra
CopilotKitProvider  --catalog-->  runtime -> GenerativeUI        conciergeAgent
  generativeUI={{ui:mdeUI}}                 Middleware  --clientTools-->  render_ui
  GenerativeUISurface(id=...)  <--ACTIVITY--  validates ops        static guide
  RentalCard -> authorized tool results      adds guide entry      (presence flag)
```

Ownership: thread = CopilotKit runtime; catalog = `mde-ui-catalog.tsx`; `render_ui` = the agent; page targets = mounted `GenerativeUISurface`s (the tool's target enum); writes = existing authenticated RPCs.

Security rule that must not change: the browser-supplied **Generative UI guide entry** is presence-checked only; its text is never used as instructions. Separate bounded rental/event ID hints are untrusted input to the agent and each displayed card revalidates its ID against retained authorized results (see [21b](21b-genui-audit-defects.md)).

## 4. Implemented in PR #839

- Catalog extends the official Standard Catalog with a deliberately small, **documented** vocabulary: 14 layout/label components (Box, Column, Row, Grid, GridItem, Card, Spacer, Divider, Title, Text, Caption, Label, Badge, FollowUp) plus the grounded `RentalCard`/`EventCard`. 55 standard components are omitted — see "PR #839 review round 1" in [21b](21b-genui-audit-defects.md) for the rule.
- First named Surface `rental-recommendations` on `/rentals`: allowlist `RentalCard, Column, Row, Divider, Title` (one heading, 8 words max), `fallback={null}`, `autoScroll={false}`. It stores and fetches nothing.
- Guide takes the target from the tool's target enum, prefers the panel on Rentals, documents every exposed prop, and ships a working multi-card example (`children: ["card-1","card-2"]`).
- Test proving the concierge history trim keeps `render_ui` and the guide context.

## 5. Order of work

```
1653 — prove existing render_ui transport and signed-in journey
  ├─ 1654 — Standard Catalog ── 1655 — state/actions ── 1658 — editable form ── 1663 / 785 / 1555
  │                         └─ 1660 — App Home
  └─ 1656 — named Rentals Surface ── 1039 / 1666
                            └─ 1667 — read-only Trip preview
1654 + 1656 ── 1659 — read-only dashboard insights ── 1661 / 1662 / 1664 / 1665
```

**Formal Linear blockers:** SAN-1659 is blocked by SAN-1654 and SAN-1656; SAN-1667 is blocked by SAN-1656. SAN-1655 is *related*, not a formal blocker for either read-only Surface. For a **writable** insight or reviewed Trip save, the real State & Actions and authorized domain write paths must additionally work (SAN-1655 and the existing SAN-279 Trip action). The Trip Map remains SAN-280's responsibility.

**Parallel-work limit:** after SAN-1653, SAN-1654 (catalog) and SAN-1656 (read-only page target) can be developed as separate work streams; they still share the agent/runtime integration and PR #839 combines changes to the server guide. The fact they landed in one PR does **not** prove file-level independence. Test the integrated result. SAN-1655 does not block a read-only SAN-1656; do not invent blockers.

## 6. Smallest next steps

1. **Merge #839** (all required gates green). Reviewer action; no bypass.
2. **One live proof** — signed-in renter on `/rentals`: ask for matching apartments; capture a real `render_ui` operation with target `rental-recommendations` (a chat-only card is not sufficient). Within that named page Surface, verify a rendered `RentalCard` has `data-listing-id` matching a native grid card; click the Surface card and verify Details opens the same listing ID. Attach the trace, matching IDs and screen evidence to SAN-1653/1656.
3. **SAN-1655** — one AI-writable filter chip; a user edit must survive the next agent turn.
4. **SAN-1658** — one editable form that really saves (viewing request or partner profile): committed readback, retry-safe, no double write.
5. **SAN-1659** — extract the panel; then 1661/1662/1664/1665 run in parallel.
6. **Copy the panel** for 1666 (restaurants), 1039 (rentals parity), 1667 (trips).

## 7. Success criteria

1. One catalog, one provider, one renderer; no second agent or runtime.
2. `render_ui` proven in a real signed-in run, not only by unit tests.
3. One page Surface with allowlist + native fallback, exercised live.
4. Forged IDs or IDs **absent from the retained authorized thread/fast-path rental results** render an unavailable state, never invented data. IDs absent only from the latest search **may still render** from retained earlier authorized results; preserve historical cards across searches and thread replay.
5. User edits survive a second turn; writes go through authenticated RPCs with idempotency.
6. `floor` and `mastra-schema-init` green on each PR's exact head.

## 8. Not claimed

No live UI render, no visual theming proof, no prompt-cost measurement, no `floor` claim inside this document (CI owns that). No production readiness: this is Phase A.

Companions: [21a task tracker](21a-genui-task-tracker.md) · [21b audit and defects](21b-genui-audit-defects.md).
