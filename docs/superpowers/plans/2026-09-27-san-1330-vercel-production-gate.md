# SAN-1330 Vercel Production Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Certify the exact staged Vercel deployment before it can receive MDE production traffic.

**Architecture:** Vercel emits `vercel.deployment.ready`; GitHub validates the exact MDE project, deployment URL, and SHA before any secret-bearing request; a focused Playwright candidate journey runs against that origin; Vercel's official status action publishes `production-certification`; Vercel blocks alias/promotion until it passes. Existing deep smoke remains post-promotion/nightly.

**Tech Stack:** Vercel, GitHub Actions, Node 24, Next.js 16.3.5, Playwright, Supabase auth helpers.

**Spec:** Linear SAN-1330

## Global Constraints
- Reuse current MDE auth/runtime tests; no Supabase migration.
- Never interpolate dispatch payload values directly into shell commands.
- Never send Vercel bypass credentials to an unvalidated or cross-origin URL.
- Candidate must match Vercel project `mdeai`, project ID `prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB`, production environment, HTTPS `.vercel.app` deployment URL, and exact 40-hex SHA.
- Keep full four-query and two-user isolation tests outside the fast blocking lane.

## Review Focus
- Shell/URL injection from repository_dispatch payloads.
- Secret leakage through redirects or third-party requests.
- False-green status against the wrong deployment SHA.
- Candidate auth/runtime test silently skipping because credentials are absent.
- Production alias moving while certification is pending/failed.

### Task 1: Candidate event validator
- [ ] Write failing Node tests for valid payload and hostile URL/SHA/project/environment cases.
- [ ] Run RED.
- [ ] Implement `scripts/validate-vercel-deployment-event.mjs`.
- [ ] Run GREEN and full Node validator tests.

### Task 2: Pre-promotion GitHub workflow
- [ ] Add structural regression test for ready-event, permissions, pinned Vercel checkout/status actions, env-based payload handling, and stable `production-certification` context.
- [ ] Run RED.
- [ ] Create `.github/workflows/vercel-production-certification.yml`.
- [ ] Run GREEN.

### Task 3: Safe Vercel protection bypass
- [ ] Add fixture tests proving bypass is scoped to the validated candidate origin and fails loudly when setup fails.
- [ ] Run RED.
- [ ] Implement `e2e/fixtures/vercel-bypass.ts` and candidate-only Playwright wiring.
- [ ] Run GREEN.

### Task 4: Candidate Playwright journey
- [ ] Add focused candidate spec covering `/`, `/events`, unauthenticated CopilotKit 401/401, signed-in `/saved`, authenticated runtime info, and one minimal concierge turn.
- [ ] Verify test discovery/contract locally without production secrets.

### Task 5: Vercel required Deployment Check
- [ ] Configure a required `production-certification` check that blocks deployment alias/promotion using the GitHub status source.
- [ ] Verify it is listed by Vercel CLI as blocking.

### Task 6: TypeScript production enforcement
- [ ] Add regression test that `next.config.ts` cannot enable `ignoreBuildErrors: true`.
- [ ] Run RED, remove bypass, run GREEN.

### Task 7: Local/Floor verification
- [ ] Run targeted validator/workflow/fixture tests.
- [ ] Run lint, typecheck, build, full Vitest, and Floor.

### Task 8: Red deployment drill
- [ ] Deploy a staged production candidate with a deliberate test-only certification failure and no domain assignment.
- [ ] Prove production stays on the prior deployment; then revert the deliberate failure.

### Task 9: Green deployment drill
- [ ] Deploy corrected exact head as staged production candidate.
- [ ] Prove certification passes and exact candidate may promote; verify production alias exact SHA and post-promotion smoke.

### Task 10: Replacement PR
- [ ] Commit/push exact verified branch.
- [ ] Open replacement PR for SAN-1330 with evidence and rollback notes.
- [ ] Verify exact-head GitHub checks and update Linear progress.
