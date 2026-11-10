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

Security rule that must not change: the browser's context entry is **only a feature flag**. Its text is client-controlled and never becomes system-prompt text.

## 4. Implemented in PR #839

- Catalog now `extends: [standardUI.omit([...])]` — official layout/text/table/input components; `RentalCard`/`EventCard` stay the grounded first choice.
- First named Surface `rental-recommendations` on `/rentals`: allowlist (RentalCard + layout), `fallback={null}`, `autoScroll={false}`. It stores and fetches nothing.
- Guide takes the target from the tool's target enum, prefers the panel on Rentals, forbids invented values.
- Test proving the concierge history trim keeps `render_ui` and the guide context.

## 5. Order of work

```
1653 prove transport
  |- 1654 standard catalog -- 1655 state/actions -- 1658 editable form -- 1663 / 785 / 1555
  `- 1656 named Surface ----- 1659 dashboard panel -- 1661 / 1662 / 1664 / 1665
         `- 1039 / 1666 / 1667
1654 -- 1660
```

1654 and 1656 are parallel after 1653 (proven: same PR, no shared file). 1655 does not block 1656. Do not invent dependencies.

## 6. Smallest next steps

1. **Merge #839** (all required gates green). Reviewer action; no bypass.
2. **One live proof** — signed-in renter on `/rentals`: ask for matching apartments, confirm a card renders with `data-listing-id` present in the grid, click it, confirm Details matches. Attach the trace to SAN-1653/1656.
3. **SAN-1655** — one AI-writable filter chip; a user edit must survive the next agent turn.
4. **SAN-1658** — one editable form that really saves (viewing request or partner profile): committed readback, retry-safe, no double write.
5. **SAN-1659** — extract the panel; then 1661/1662/1664/1665 run in parallel.
6. **Copy the panel** for 1666 (restaurants), 1039 (rentals parity), 1667 (trips).

## 7. Success criteria

1. One catalog, one provider, one renderer; no second agent or runtime.
2. `render_ui` proven in a real signed-in run, not only by unit tests.
3. One page Surface with allowlist + native fallback, exercised live.
4. Forged/stale IDs render "not in current results", never invented data.
5. User edits survive a second turn; writes go through authenticated RPCs with idempotency.
6. `floor` and `mastra-schema-init` green on each PR's exact head.

## 8. Not claimed

No live UI render, no visual theming proof, no prompt-cost measurement, no `floor` claim inside this document (CI owns that). No production readiness: this is Phase A.

Companions: [21a task tracker](21a-genui-task-tracker.md) · [21b audit and defects](21b-genui-audit-defects.md).
