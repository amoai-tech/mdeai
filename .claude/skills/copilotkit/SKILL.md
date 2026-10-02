---
name: copilotkit
description: >-
  Use for any MDE request clearly involving CopilotKit, including implementation, configuration, /api/copilotkit, CopilotKit v2 React hooks, generative UI, frontend tools/actions, shared agent state, AG-UI transport, runtime wiring, CLI verification, HITL, CopilotKit-to-Mastra bridges, and CopilotKit-specific bugs/errors/failures. A known CopilotKit failure stays with this domain owner rather than generic systematic-debugging.
metadata:
  mde-version: "2.1.0"
  upstream-commit: "632b050da4a3ee5a8eb3e263316b9acd2fdfe6ff"
  verified-package: "exact aligned pins in package.json (@copilotkit/react-core + @copilotkit/runtime)"
---

# CopilotKit — official upstream + MDE overlay

## Source order

1. Inspect the installed MDE CopilotKit packages and current runtime/provider code.
2. Read the pinned official CopilotKit core skill in `references/official/copilotkit/SKILL.md`.
3. For wiring/debugging, also read `references/official/copilotkit-cli/SKILL.md`. MDE is self-hosted OSS, so prefer `verify --expect-runtime oss --round-trip --agent <id>` rather than hosted-Intelligence checks.
4. For Channels or Intelligence work, load only the matching vendored official reference named under **Official feature routing** below.
5. Use current official CopilotKit/AG-UI docs or source when the pinned skill directs you there.
6. Apply the MDE-specific invariants below.

Do not answer volatile CopilotKit API questions from memory. Do not silently replace installed-version behavior with latest-main examples.

## Ownership

Own the browser-facing agent bridge: provider/hooks, same-origin runtime, AG-UI events, frontend tool/action registration, shared state, generative UI, and CopilotKit-visible failures. `mastra` owns agents/tools/workflows/memory/storage/HITL semantics. Product-domain skills own business invariants.
## Current MDE invariants

- MDE uses CopilotKit v2 React APIs from `@copilotkit/react-core/v2`.
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
manual discovery, use the current CLI so its wiring knowledge is fresh:

```bash
npx copilotkit@latest verify \
  --expect-runtime oss \
  --round-trip \
  --agent conciergeAgent \
  --json
```

For a preview/production URL, also pass `--runtime-url <origin>/api/copilotkit` and the
required authenticated `--header '<name>: <value>'`. Never print session secrets.

Use `@latest` for manual upstream discovery. For CI or repeatable certification, keep the
reviewed CLI version pinned (currently `4.10.0`) until a separate review deliberately moves
that pin. A passing CLI check proves wiring and a basic round trip; it does not replace MDE's
exact-SHA browser, tool, streaming, auth/isolation, or production certification.

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
| "Verified against `@copilotkit/runtime@1.65.0`" and `@copilotkit/channels@0.6.0` (`setup-slack-channel` and its `troubleshooting.md`) | MDE pins `@copilotkit/runtime` and `@copilotkit/react-core` at `1.75.0`; `@copilotkit/channels` is **not installed** | Treat every API name, log line, status enum and error category as unverified until you confirm it in the installed `node_modules/@copilotkit/*` or the pinned `v1.75.0` source tag |
| `pnpm …` commands (the OpenTag starter's convention) | MDE uses npm: `npm run …`, `npx …` | Translate the command; never add pnpm or its lockfile to MDE |
| Channels / Intelligence setup steps | Neither product is enabled in MDE | Planning reference only, see above |

**Negative proof is mandatory for Channel work.** "The Channel is Online" or "the runtime
started" is not success. Use the Slack skill's *Done means three things* rule (app installed and
in the channel, Channel reports `online`, and a real human mention got a real reply); any one alone
is a false positive.

## Two kinds of human-in-the-loop

Pick by where the tool actually executes, not by which hook you saw first:

- **Frontend tool** → `useHumanInTheLoop`. The render callback owns the UI and calls
  `respond(...)`.
- **Backend tool** → mark the tool approval-gated and use `useInterrupt`. A backend
  write such as the listing publish RPC is *not* gated by `useHumanInTheLoop`; that
  hook would render an approval that never blocks the real mutation.

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

Approval records intent, never authorization. The backend path must still revalidate
the user, ownership, record version, and legal transition. `mastra` owns that half —
see its `references/human-in-the-loop.md`.

## Workflow

1. Classify the issue: wiring/runtime, React/provider, AG-UI/tool rendering, shared state, CLI verification, or Mastra bridge.
2. Use the official core/CLI skill as the default procedure and lookup guide.
3. Load only the matching MDE reference: `runtime-and-react.md`, `ag-ui-and-tools.md`, or `mastra-bridge.md`.
4. Reproduce before editing when debugging.
5. Keep the smallest safe contract change and hand Mastra-internal changes to `mastra`.
6. Prove the affected contract with targeted tests plus browser/stream evidence when user-visible behavior changed.

## Verification

At minimum verify the affected runtime URL, agent identity, version surface, tool/action mapping, auth/rate-limit behavior, AG-UI result/state handling, and rendered user path. A passing CopilotKit CLI wiring check does not prove tool execution, streaming order, state synchronization, or rendered generative UI; test those separately.

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
- https://docs.copilotkit.ai/
- https://github.com/CopilotKit/CopilotKit
