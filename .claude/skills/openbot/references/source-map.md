# OpenBot → optional MDE external computer (SAN-1324–1329)

**Existing historical baseline:** v0.0.14, reviewed unverified commit
https://github.com/CopilotKit/OpenBot/commit/e01a7c2fe65f4828c1696ee32e9724eb2b327384
recorded by https://github.com/amoai-tech/mdeai/pull/426 .
**Candidate official release, NOT adopted:** v0.2.0, release/tag
https://github.com/CopilotKit/OpenBot/releases/tag/v0.2.0 ;
verified candidate commit 9f3290b93085a4840884f0eb65bdc7ca9ea6b0d8 .
Current upstream main and release are not MDE runtime proof. SAN-1324 owns
the actual isolated install/compatibility and ADOPT/DEFER decision.

## Source → instruction → destination → proof

1. **REFERENCE ONLY** https://github.com/CopilotKit/openbot and
   https://www.copilotkit.ai/openbot → repo/release/capability claims.
   Destination this version map and SAN-1324 decision. Verify genuine
   broker browser-only need after checking native API/MCP/Mastra tools;
   otherwise DEFER without installing.
2. **REFERENCE ONLY** https://github.com/CopilotKit/OpenBot/releases/tag/v0.2.0
   → migration 0052_shared_brokered_accounts copies Composio connections,
   downgrade to 0.1.2 hides accounts added after upgrade, and older signed
   handoffs may be refused during the documented transition.
   Destination SAN-1324 isolated install/migrate/rollback runbook.
   Verify before/after connection visibility, handoff requests, clean
   startup/shutdown and no MDE production data touched.
3. **MODEL protocol boundary**:
   https://github.com/CopilotKit/OpenBot/blob/9f3290b93085a4840884f0eb65bdc7ca9ea6b0d8/agent-mastra/src/mastra/index.ts
   → Mastra HTTP server + @ag-ui/mastra bridge; AG-UI and CopilotKit Runtime
   protocol are not interchangeable. Destinations for compatibility
   inspection: src/mastra/index.ts,
   src/app/api/copilotkit/[[...path]]/route.ts; conditional SAN-1325 adapter.
   Verify authenticated protocol round trip, no alternate runtime mount or
   missing-method wire-format failure.
4. **MODEL trusted target and audit-before-action**:
   https://github.com/CopilotKit/OpenBot/blob/9f3290b93085a4840884f0eb65bdc7ca9ea6b0d8/server/src/computer/gateway.ts
   → trusted server snapshot resolution → policy → persisted audit → action.
   Destination SAN-1325 adapter contract + SAN-1327 adversarial tests,
   **not** copy of gateway or new MDE service. Verify forged element ID,
   spoofed target label, hostile page instructions, audit failure and retry.
5. **MODEL deny-over-allow policy**:
   https://github.com/CopilotKit/OpenBot/blob/9f3290b93085a4840884f0eb65bdc7ca9ea6b0d8/server/src/computer/policy.ts
   → deny unknown/broken rules and unauthorized actors; destination
   SAN-1326 broker-isolation/SAN-1327 technical action checks.
   Verify partner B denial, internal network targeting rejected, no client
   service token exposed and no business approval paperwork gate.
6. **REFERENCE ONLY (historical upstream app-specific skills)**:
   https://github.com/CopilotKit/OpenBot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/.claude/skills/openbot-data-access/SKILL.md
   and
   https://github.com/CopilotKit/OpenBot/blob/e01a7c2fe65f4828c1696ee32e9724eb2b327384/.claude/skills/openbot-screen-layout/SKILL.md
   → vendor frontend TanStack/admin layout conventions only; never COPY
   into MDE's Next.js UI/queries. Verify existing MDE chat/agent remains sole
   user entry point.

**External retry invariant:** requested → running → submitted → confirmed /
failed / unknown. Stop/timeout after external Submit does not reverse it;
unknown must be reconciled, NEVER blindly retried. Test kill switch keeps
ordinary MDE rental chat, leads and viewings working before any enablement.
