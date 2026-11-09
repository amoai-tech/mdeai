---
name: copilotkit
description: >-
  Use when implementing or debugging MDE CopilotKit v2 setup, integration and troubleshooting. Use for /api/copilotkit runtime, React hooks, native Components/Surfaces, render_ui, A2UI fixed/dynamic schemas, standardUI catalogs, AG-UI/Mastra transport, frontend tools/actions, shared state, CLI verification, HITL, and CopilotKit-specific errors. Keeps browser-facing bridge failures with the CopilotKit domain owner; Mastra and product skills own their respective business/agent logic.
metadata:
  mde-version: "2.4.0"
  upstream-commit: "4f0e86deaebb9d6e6d4625cbed4087912aee6d0c"
  verified-package: "exact aligned pins in package.json (@copilotkit/react-core + @copilotkit/runtime)"
---

# CopilotKit — official upstream + MDE overlay

## Source order

1. Inspect the installed MDE CopilotKit packages and current runtime/provider code.
2. Read the pinned official CopilotKit core skill in `references/official/copilotkit/SKILL.md`.
3. For wiring/debugging, also read `references/official/copilotkit-cli/SKILL.md`. MDE is self-hosted OSS: start with `verify --expect-runtime oss --agent <id>`; add `--round-trip` only for an explicitly authorized live QA agent check, never merely to satisfy a hosted-Intelligence check.
4. For Channels or Intelligence work, load only the matching vendored official reference named under **Official feature routing** below.
5. For native React `render_ui`, typed catalogs, or page Surfaces, read `references/native-generative-ui.md`. For protocol A2UI operations or fixed/dynamic schemas, also read `references/a2ui-protocol.md`; never assume the two integration paths share setup, and load both when a single task mentions both.
6. For `standardUI`, built-in charts/maps/forms, or extending the 69-component standard catalog, read `references/standard-catalog.md` and expose only the approved vocabulary.
7. Use current official CopilotKit/AG-UI docs and version-matched source when the pinned skill directs you there.
8. Apply the MDE-specific invariants below.

Do not answer volatile CopilotKit API questions from memory. Do not silently replace installed-version behavior with latest-main examples.

### Documentation lookup when semantic search is unavailable

CopilotKit Docs MCP semantic search (`search_docs`, `search_code`, `search_ag_ui_docs`, `search_ag_ui_code`) is an optional convenience, **not** a prerequisite for debugging. If a search call returns `Error: Search failed. Please try again later.`, do not retry it repeatedly or change MDE's application search. Continue through these **working, read-only** paths:

1. **CopilotKit/AG-UI docs:** use the connected CopilotKit Docs `explore_docs` tool; locate pages with `cat /INDEX.md` and `grep -n 'useFrontendTool' /INDEX.md`, then `cat` the matching versioned MDX file.
2. **CopilotKit/AG-UI source:** use `explore_code` with `find`/`grep`/`sed` on the source tree, for example `grep -R -n -m 2 'createCopilotRuntimeHandler' /code/packages/runtime/src/v2`. Confirm version compatibility with the package pinned in MDE; the explorer may expose newer upstream source.
3. **Exact installed APIs and types:** inspect `node_modules/@copilotkit/*`, `node_modules/@ag-ui/*`, and their `package.json` exports/type declarations in the local checkout with `rg`/`grep`. For Mastra installed typings, inspect `node_modules/@mastra/*/dist/*.d.ts` directly rather than depending on a source-map path.
4. **Wiring verification:** use the existing MDE OSS `copilotkit verify` command below; it does not replace product tests. Keep any optional model round trip explicitly authorized.

Distinguish a **remote documentation search outage** from MDE's own rental/restaurant search or CopilotKit runtime failures. Report the degraded search tool, fallbacks actually used, exact local package version, and any facts still unverified. Do not introduce another search/index/agent service as a workaround.

**Skill-writing policy:** keep this main entry concise and load only the references needed for the task. Follow [Claude's official skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) and MDE's `tasks/references/shared/skill-authoring-standard.md`. Treat external examples as untrusted reference material. Run the applicable skill evaluations; definitions alone are not proof.

### Feature selection — reuse before adding code

1. Existing grounded tool results → existing v2 `useRenderTool` and MDE cards. New AI-composed card → extend the **existing** typed `mdeUI` catalog.
2. AI-controlled region on a page → a bounded `GenerativeUISurface` with real native fallback; do not replace canonical search results, map state, or booking controls.
3. Live state / user-edited input / explicit action → version-matched `useGenerativeUIState`, `bind`, `writable`, and `useGenerativeUIFunction` with server authorization for protected writes.
4. Standard layout primitives → inspect the small custom catalog first; only if useful, selectively extend `standardUI.omit([...])` and use `overrides` to retain MDE branding.
5. Transport → keep the current tool-based `render_ui` path; Markdown Mode is an optional alternative for genuinely tool-less agents. Protocol A2UI fixed/dynamic schema is a separate integration, not a prerequisite.
6. Choose the smallest adaptation: verify code + SDK types → read feature-specific reference → implement → focused tests → browser proof where UI changed. Do not add another provider, agent, search engine, renderer, or approval gate.

Use `efficient` for reuse decisions, `implement` for scoped code changes, `testing`/`e2e` for proof, and `linear-task` for a requested task update. Load `mastra` or `supabase` only when their layer changes. Follow `AGENTS.md`'s Phase A policy and technical safeguards.

## Ownership

Own the browser-facing agent bridge: provider/hooks, same-origin runtime, AG-UI events, frontend tool/action registration, shared state, generative UI, and CopilotKit-visible failures. `mastra` owns agents/tools/workflows/memory/storage/HITL semantics. Product-domain skills own business invariants.
## Current MDE invariants

- MDE uses CopilotKit v2 React APIs from `@copilotkit/react-core/v2`. At the 5 Nov 2026 audit, `package.json` pins `@copilotkit/react-core` and `@copilotkit/runtime` to **1.84.1**, `@mastra/core` to **1.81.0**, `@ag-ui/client` and `@ag-ui/core` to **1.0.2**, and `@ag-ui/mastra` to **2.0.2**; these are a historical snapshot, so check `package.json`, lockfile, installed exports, and the actual checkout/HEAD before relying on them.
- Browser traffic uses the same-origin `/api/copilotkit` runtime; do not switch to hosted Intelligence implicitly.
- Tool render/action names must match the Mastra tool-map key, not a `createTool()` id.
- Preserve auth, distributed rate limits, request context, telemetry, and agent allowlists on the runtime route.
- Treat AG-UI messages/events as the frontend-agent transport contract; do not create parallel ad-hoc chat state.
- Keep provider props stable across renders.

## v1 vs v2 imports — the mistake this skill exists to prevent

Both surfaces ship in one install, so a v1 import will compile, run, and still be
wrong. MDE targets the v2 API surface. Temporary compatibility `<CopilotKit>` boundaries
may remain only while the tracked SAN-1378 Stage D migration is incomplete; do not add
new v1 consumers.

| Need | v2 (use this) | v1 (do not use) |
|---|---|---|
| React hooks | `@copilotkit/react-core/v2` | `@copilotkit/react-core` |
| Runtime | `@copilotkit/runtime/v2` | `@copilotkit/runtime` |
| Route handler | `createCopilotRuntimeHandler` | `copilotRuntimeNextJSAppRouterEndpoint` |

## OSS verification

MDE runs a self-hosted, same-origin runtime rather than hosted CopilotKit Intelligence. For
manual discovery, use the current CLI so its wiring knowledge is fresh. Start with a
wiring-only check (no model request):

```bash
npx copilotkit@latest verify \
  --expect-runtime oss \
  --runtime-url http://localhost:3001/api/copilotkit \
  --agent conciergeAgent \
  --json
```

When a QA round trip is deliberately authorized, add `--round-trip` to the same
command and target the intended QA runtime with `--runtime-url`.

For a preview/production URL, also pass `--runtime-url <origin>/api/copilotkit` and the
required authenticated `--header '<name>: <value>'`. Never print session secrets.

**`--round-trip` is an opt-in live operation:** it sends a real prompt through the selected runtime, consumes model credits, and creates a conversation thread. Use an explicitly authorized QA environment and test identity, check the target URL/agent and credential scope, and clean up test data using the existing QA process when appropriate. Do not run it against production by default. For read-only wiring discovery, omit `--round-trip`; re-run with it only when a real agent invocation is intended. A completed CLI round trip does not prove correct business output or tool side effects.

Use `@latest` for manual upstream discovery. For CI or repeatable certification, keep the
reviewed CLI version pinned (currently `4.10.0`) until a separate review deliberately moves
that pin. A wiring-only CLI check verifies the reported configuration and reachable runtime checks;
`--round-trip` separately proves one agent response. Neither replaces MDE's exact-SHA
browser, tool, streaming, auth/isolation, or production certification.

## Official feature routing

Keep one MDE domain owner (`copilotkit`). The vendored upstream feature skills are references,
not independent MDE routing owners:

| Need | Read |
|---|---|
| Core runtime/UI/debugging | `references/official/copilotkit/SKILL.md` |
| CLI verification/onboarding | `references/official/copilotkit-cli/SKILL.md` |
| First managed Channel setup | `references/official/channels-setup/SKILL.md` |
| Managed Channels implementation | `references/official/copilotkit-channels/SKILL.md` |
| OpenTag/example-style Slack provider setup | `references/official/setup-slack-channel/SKILL.md` |
| Upstream CopilotKit Intelligence docs maintenance only | `references/official/intelligence-docs/SKILL.md` |
| Official CopilotKit Intelligence terminology reference (not an MDE copywriting owner) | `references/official/intelligence-vocabulary/SKILL.md` |

Vendoring Channels/Intelligence guidance does **not** enable those products in MDE. Managed
Channels require their own supported deployment shape (including a long-running host); never
move that lifecycle into the existing serverless Next.js request route just because the
reference is available. `intelligence-docs` and `intelligence-vocabulary` are scoped to
CopilotKit upstream/customer-facing documentation; do not route ordinary MDE product docs or
copy through them. `setup-slack-channel` assumes OpenTag/example conventions; for a future first
MDE managed Channel, start with `channels-setup` and the current CLI onboarding graph.

## Reading vendored references against MDE

The files under `references/official/` are upstream verbatim (read-only, hash-pinned in
`upstream.yaml`); do not edit them to fit MDE. Their version and tooling statements describe
upstream's own test bed, so translate before acting:

| A vendored reference says | MDE reality | Do this |
|---|---|---|
| "Verified against `@copilotkit/runtime@1.65.0`" and `@copilotkit/channels@0.6.0` (`setup-slack-channel` and its `troubleshooting.md`) | At the 5 Nov 2026 audit, MDE pins React + Runtime at **1.84.1**; `@copilotkit/channels` is **not installed** | Treat the vendored reference versions as upstream history, not current MDE truth. Confirm each volatile API against the **current installed package** and matching official release tag (for the audited pin: [`v1.84.1` exports](https://github.com/CopilotKit/CopilotKit/blob/v1.84.1/packages/react-core/src/v2/generative-ui/index.ts)). Never silently revert to 1.75.0. |
| `pnpm …` commands (the OpenTag starter's convention) | MDE uses npm: `npm run …`, `npx …` | Translate the command; never add pnpm or its lockfile to MDE |
| Channels / Intelligence setup steps | Neither product is enabled in MDE | Planning reference only, see above |

For the vendored `setup-slack-channel` reference, these MDE overlay rules take precedence when its files disagree with each other:

- **Preserve existing runtime configuration.** If `.env` already exists, do not run the vendored `cp .env.example .env` step. Only seed from the example when the file is absent (for example, `test -e .env || cp .env.example .env`). This is especially important when Phase 0 supplied a ready-made config: preserve it and verify required variables by presence only.
- **Approved browser automation may create the dedicated Slack app.** After the developer gives the setup authorization described by the parent `setup-slack-channel/SKILL.md`, browser automation may create the new dedicated app from the wizard-generated manifest. The developer must still enter every credential or secret themselves; never type, copy, expose, or persist those values on their behalf. This browser-automation rule overrides the narrower `slack-workspace-and-app.md` prohibition on creating the app for the developer.

**Negative proof is mandatory for Channel work.** "The Channel is Online" or "the runtime
started" is not success. Use the Slack skill's *Done means three things* rule (app installed and
in the channel, Channel reports `online`, and a real human mention got a real reply); any one alone
is a false positive.

## Native generative UI and A2UI — prove the bridge first

**Implementation truth (recheck checkout):** MDE already has `src/components/copilot/a2ui/mde-ui-catalog.tsx` and wires `generativeUI={{ ui: mdeUI, agentIds: ["conciergeAgent"] }}` into the discovery/chat route-owner providers. The catalog currently registers grounded rental/event cards. Preserve the existing `useRenderTool` fallback. Source presence and TypeScript success are **not** proof of a live model → Mastra → AG-UI → browser `render_ui` journey. Verify that separately.

**Load the implementation map:** `references/native-generative-ui.md` (full version/route checklist, catalog, Surfaces, existing UI, actions and tests). Also read `references/a2ui-protocol.md` for legacy/fixed/dynamic protocol A2UI, and `references/standard-catalog.md` for the approved component vocabulary. Do not mix native and legacy middleware or add a second agent, renderer, provider, search, or checkout system.

**Required order:**
1. Check installed versions, existing same-origin runtime, both route-owner providers, existing `mdeUI`, and auth/thread contracts. Confirm the **actual** run advertises `render_ui`; never test a catalog-free run and blame Mastra. Only use a temporary inert QA component inside the existing catalog if that helps isolate a failure. Trace the tool/guide through `src/mastra/copilotkit/logging-mastra-agent.ts`, `@ag-ui/mastra`, AG-UI events and a real browser render. Fix only the evidenced boundary.
2. **Extend the existing** strict-Zod, ID-only MDE domain catalog that hydrates real authorized results, retains working cards/pins and `useRenderTool` fallback, and adds bounded Rentals/Events Surfaces only when their user journey needs them. Never trust model-supplied prices, coordinates, availability or ticket limits. No direct AI checkout/viewing write; user gestures and existing authenticated/idempotent server APIs own actions and the signed Stripe TEST webhook owns payment success. Phase A development has no landlord/partner/business eligibility approval gates.
3. Prove invalid/stale IDs, unrecognized components, overlapping A→B searches, Stop/Retry, refresh, guests/other-user isolation and 390px/keyboard UI with focused tests and real browser traces. Run `npm run check:skills` and the applicable repository `npm run floor`; docs-only checks do **not** prove the future live `render_ui` journey.

## Human-in-the-loop with Mastra

**Phase A development policy:** HITL is optional user confirmation for a specific consequential action when the user needs to review or choose (for example, confirming a ticket purchase). It is **not** permission from a landlord, partner, moderator, or platform operator and must not impose rental eligibility, verified ownership, photo-rights paperwork, event-publication approval, viewing, or booking gates during prelaunch development. Continue to enforce authenticated server authorization, private-data isolation, and atomic/idempotent writes. Do not introduce additional approval steps just because the framework supports them.

For MDE's current installed Mastra + CopilotKit integration, use the tool-based CopilotKit
v2 `useHumanInTheLoop` flow for the approval UI. The current MDE integration is not
verified to emit the supported AG-UI interrupt events consumed by CopilotKit `useInterrupt`,
so `useInterrupt` is not the MDE Mastra approval path unless that capability is explicitly
verified after an adapter or version change.

- **Mastra + CopilotKit approval UI** → register the frontend approval tool with
  `useHumanInTheLoop`; its render callback shows the review UI and calls `respond(...)`.
- **Approved UI response** → records user intent only. It does not authorize a write.
- **Protected action** → call the normal authenticated backend/RPC, which independently
  authenticates the actor and revalidates ownership/role, record version/current state,
  allowed transition, and idempotency before committing.
- **`useInterrupt`** → use only with an integration that is verified to emit the supported
  AG-UI interrupt events. Do not select it merely because a tool executes on the backend.
- **Before changing MDE's proven HITL path** → follow the official Mastra skill: verify the
  exact installed `@mastra/*` and `@ag-ui/mastra` APIs/source. Do not infer CopilotKit
  interrupt compatibility from Mastra `suspend()` support alone.
- **Additional Mastra-native approval gates** → do not assume they automatically compose
  with the CopilotKit approval UI. Add a second gate only after end-to-end proof on MDE's
  exact installed versions shows approve, reject, reload/resume, retry, and exactly-once
  execution work without double prompts or stuck runs.

```tsx
import { useHumanInTheLoop } from "@copilotkit/react-core/v2";

useHumanInTheLoop({
  name: "approvalRequired", // must match the Mastra tool-map key, not a createTool() id
  description: "Request user approval for an operation",
  parameters: z.object({ operation: z.string() }),
  render: ({ args, respond, status }) => {
    if (status !== "executing") return null;
    return (
      <>
        <button onClick={() => respond?.("approved")}>Approve</button>
        <button onClick={() => respond?.("rejected")}>Reject</button>
      </>
    );
  },
});
```

Canonical protected-write flow:

```text
useHumanInTheLoop review UI
→ approved intent
→ authenticated backend/RPC
→ revalidate authorization + ownership + version + state
→ idempotent/atomic write
→ committed result
```

Approval records intent, never authorization. `mastra` owns the agent/tool/workflow half;
the authenticated backend/database remains authoritative for protected writes.

Official Mastra-specific CopilotKit guidance:

- https://docs.copilotkit.ai/mastra/human-in-the-loop/tool-based
- https://docs.copilotkit.ai/mastra/human-in-the-loop/interrupt-flow
## Workflow

1. Classify the issue: wiring/runtime, React/provider, AG-UI/tool rendering, shared state, CLI verification, or Mastra bridge.
2. Use the official core/CLI skill as the default procedure and lookup guide.
3. Load only the matching MDE references: `runtime-and-react.md` (provider/route), `ag-ui-and-tools.md` + `mastra-bridge.md` (missing cards/tool results/streaming), `native-generative-ui.md` (native Components/Surfaces), `a2ui-protocol.md` (protocol operations; load **both** for mixed A2UI tasks), or `standard-catalog.md` (built-ins and catalog cost). Follow the failure-isolation table and Inspector evidence before changing agent/search code.
4. Reproduce before editing when debugging.
5. Keep the smallest safe contract change and hand Mastra-internal changes to `mastra`.
6. Prove the affected contract with targeted tests plus browser/stream evidence when user-visible behavior changed.

## Verification

At minimum verify the affected runtime URL, agent identity, version surface, tool/action mapping, auth/rate-limit behavior, AG-UI result/state handling, and rendered user path. For missing cards, distinguish **input args** from **completed tool results**; partial AG-UI argument deltas are never authorization to act. A passing CopilotKit CLI wiring check does not prove tool execution, streaming order, state synchronization, or rendered generative UI; test those separately.

For changes to this skill, run `npm run check:skills` and `node --test scripts/__tests__/copilotkit-skill-contract.test.cjs scripts/__tests__/skill-evals-conformance.test.mjs scripts/__tests__/skill-behavior-runner.test.mjs`, then the repo-required final-head CI. These checks validate structure/grader behavior, **not agent instruction-following**. Use the existing `scripts/run-skill-behavior-eval.py` only for compatible DSH-formatted skill cases; report which real model eval IDs actually ran and separately review their **content rubrics**. Never claim a modeled user journey or a behavioral pass solely from static checks.

## References

- `upstream.yaml` — immutable source provenance and update policy
- `references/official/copilotkit/SKILL.md` — official vendor core skill, pinned and read-only
- `references/official/copilotkit-cli/SKILL.md` — official CLI skill, pinned and read-only
- `references/official/channels-setup/` — official first-Channel setup skill
- `references/official/copilotkit-channels/` — official managed Channels implementation skill
- `references/official/setup-slack-channel/` — official Slack provider setup skill
- `references/official/intelligence-docs/` — official Intelligence docs skill
- `references/official/intelligence-vocabulary/` — official Intelligence terminology skill
- `references/runtime-and-react.md`
- `references/ag-ui-and-tools.md`
- `references/mastra-bridge.md`
- `references/native-generative-ui.md` — native React `render_ui` catalog / Surfaces and proof checklist
- `references/a2ui-protocol.md` — A2UI protocol v0.8/v0.9/v1.0, fixed/dynamic schema, alternative integration boundary
- `references/standard-catalog.md` — 69 built-ins, extends versus allowlist, existing MDE map/payment guardrails
- https://docs.copilotkit.ai/
- https://github.com/CopilotKit/CopilotKit
