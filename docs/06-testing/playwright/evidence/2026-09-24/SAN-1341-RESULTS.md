# SAN-1341 · Playwright deterministic architecture — verification evidence

Date: 2026-09-24
PR: https://github.com/amoai-tech/mdeai/pull/109
Verified branch head before this evidence-only commit: `f6d1a719d03774b9aa0f1ffd1b240395694e2098`

## Official example baseline

Source: https://github.com/microsoft/playwright-examples

- cloned/reset the official repository unchanged at `4eb82aed...`
- installed from its lockfile with `npm ci`
- installed Chromium, Firefox, and WebKit
- unchanged relevant official subset: `CI=1 npx playwright test tests/api-mocking tests/clock --reporter=line`
- result: **21/21 PASS** across Chromium, Firefox, and WebKit
- the repository-wide example suite also contains unrelated samples that currently depend on the unresolvable external host `cloudtesting.contosotraders.com`; those samples were not used as the baseline for SAN-1341

## MDE regression and user-journey verification

- original Firefox Home → Chat failure reproduced before the fix
- exact failing Firefox journey after fix: **1/1 PASS**
- critical browser matrix: **9/9 PASS** across Chromium, Firefox, and WebKit
- anonymous/auth cross-browser suite in clean CI-style server mode: **30/30 PASS**
- focused Vitest contracts: **26/26 PASS**
- `npm run test:e2e:deterministic`: **3/3 PASS**
- live `https://www.mdeai.co` production synthetic: **1/1 PASS** (`4-query matrix + POST budget`)

## Full Floor

`npm run floor` with normal public Supabase build configuration and privileged database/service-role credentials explicitly unset:

- lint: **PASS**
- typecheck: **PASS**
- strict environment contract: **PASS**
- Next.js 16.3.5 production build: **PASS**
- Vitest: **267 files passed, 2 skipped; 1,540 tests passed, 12 skipped**
- Mastra gate: **PASS**
- Mastra schema contract: **PASS** (`@mastra/core@1.35.0`, `@mastra/pg@1.11.0`, 32 expected `public.mastra_*` tables)
- critical-level npm audit gate: **PASS**

## Issues found and resolved during verification

1. Firefox exposed a deterministic Home → Chat failure.
2. Trace evidence showed the root CopilotKit provider was still starting live transport in deterministic mode, creating repeated `/api/copilotkit` traffic and `429` responses.
3. Deterministic mode now bypasses the root live CopilotKit transport while leaving production behavior unchanged.
4. The homepage helper no longer requires a live CopilotKit handshake in deterministic mode; it uses the existing hydration signal.
5. The Home → Chat handoff uses Playwright's retrying URL assertion instead of a load-lifecycle wait.
6. Regression contracts protect these boundaries.

## Environment false positives ruled out

- An auth run launched with the auth-bypass flag was invalid by construction. It was discarded and rerun with `CI=1`, no bypass, and a fresh server: **30/30 PASS**.
- A Floor run using `https://example.supabase.co` caused two unrelated rental fallback timeouts. Re-running those tests with the repository's normal public Supabase configuration and no privileged credentials passed **3/3**; the complete Floor then passed.

## Known follow-up outside SAN-1341

`npm audit --audit-level=critical` exits successfully, but npm currently reports **47 lower-than-critical dependency findings**: 17 low, 18 moderate, and 12 high. Dependency remediation should be handled separately rather than expanding this Playwright architecture PR.
