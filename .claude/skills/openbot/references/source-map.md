# OpenBot → optional MDE coworker (SAN-1324 / SAN-1325)

**Reference status:** OpenBot is an alpha application template, not an
MDE dependency or verified deployed broker. PR
[#426](https://github.com/amoai-tech/mdeai/pull/426) records *historical,
unverified* reference `v0.0.14` at
[`e01a7c2fe65f4828c1696ee32e9724eb2b327384`](https://github.com/CopilotKit/openbot/commit/e01a7c2fe65f4828c1696ee32e9724eb2b327384).
The official [v0.2.0 release](https://github.com/CopilotKit/OpenBot/releases/tag/v0.2.0)
(published 2026-10-12) is newer; **SAN-1324 must verify its actual
release tag/commit in isolation before any adoption**. Do not silently re-pin.

- **REFERENCE ONLY:** https://github.com/CopilotKit/openbot and
  https://www.copilotkit.ai/openbot → official repo/release and capabilities.
  Destination: this source map; verify actual release SHA and documented
  infra/auth requirements, not marketing assumptions.
- **MODEL:** https://github.com/CopilotKit/openbot/tree/e01a7c2fe65f4828c1696ee32e9724eb2b327384/agent-mastra and
  https://github.com/CopilotKit/openbot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/agent-mastra/src/mastra/index.ts
  → OpenBot's *agent example* explains Mastra API vs AG-UI transport boundary.
  Destination: `src/mastra/index.ts`, `src/mastra/agents/concierge.ts`,
  `src/app/api/copilotkit/[[...path]]/route.ts`. Verify wire protocol,
  auth and agent registration; do not mount a second MDE runtime.
- **MODEL:** https://github.com/CopilotKit/openbot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/server/src/computer/gateway.ts
  → resolve untrusted element ref to server snapshot, evaluate action policy,
  persist audit, then act. Destination: SAN-1324/SAN-1325 proof checklist,
  **not** a new MDE gateway. Test spoofed ref and pre-action audit.
- **MODEL:** https://github.com/CopilotKit/openbot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/server/src/computer/policy.ts
  → deny-over-allow and fail-closed technical permissions. Destination:
  SAN-1326/1327 security checklist, no Phase A business approval gate.
  Test unauthorized action and policy failures.
- **REFERENCE ONLY:** https://github.com/CopilotKit/openbot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/.claude/skills/openbot-data-access/SKILL.md
  → conventions for *OpenBot's app/src/* only. Do not replace MDE's Next.js
  API clients/TanStack architecture. Verify new skill doesn't demand that.
- **REFERENCE ONLY:** https://github.com/CopilotKit/openbot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/.claude/skills/openbot-screen-layout/SKILL.md
  → conventions for *OpenBot admin routes*, not MDE frontend.
  Ordinary MDE layout remains under `frontend-design` / `uiux`.

Only make the option real if native MDE tools cannot do the job, then prove
isolated version, tenant auth, audit, retries and off-switch. Native MDE rental
search and viewing must continue if the option is disabled.
