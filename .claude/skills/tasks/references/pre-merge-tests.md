# Pre-merge test matrix

Use the cheapest reliable proof first, but do not stop before the task's observable risk is covered.

## Canonical order

```text
exact Git diff / scope check
→ Graphify for substantial code changes with a current index; known docs-only files can be read directly
→ static/diff review
→ targeted Vitest/component/contract tests
→ typecheck
→ build when route/config/runtime behavior can change
→ localhost Playwright
→ preview Playwright when deployment/runtime integration matters
→ production smoke only when the task explicitly requires post-merge/live proof
```

Official guidance supports this split: Next.js recommends unit/component tests for synchronous code and E2E for async Server Components; Playwright recommends user-visible, isolated tests; GitHub requires status checks on the latest head/merge commit; Supabase recommends database/RLS tests with pgTAP/CLI.

## Always before merge for substantial code changes

- [ ] Exact diff and staged/untracked scope reviewed.
- [ ] Relevant targeted tests pass.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes when routes, Server Components, config, middleware, runtime adapters, or environment wiring changed.
- [ ] No required GitHub check is missing, stale, or green only on an older SHA.
- [ ] All actionable review threads are resolved with evidence.

## MDE path/risk matrix

| Change / risk | Cheapest required proof | Escalate when |
| -- | -- | -- |
| Pure helper / DTO / formatter | targeted Vitest | public behavior or route contract changes |
| React client component | component test + targeted Vitest | interaction/navigation/responsive behavior matters |
| Async Server Component / App Router page | server/static inspection + Playwright journey | auth/data/navigation is observable only in browser |
| Auth/session/navigation | auth unit/integration + unauthenticated/login/session E2E | cookie/session reuse or redirect behavior changed |
| Tenant/org authorization | targeted auth/DAL test + Org A/Org B E2E | RLS/RPC/database boundary changed |
| Supabase migration/RLS/RPC | SQL/pgTAP-style security fixture + fresh replay when migration history matters | live schema drift or production policy behavior is part of AC |
| CopilotKit/AG-UI runtime | runtime-family/route tests + `/info`/run contract | streaming, threads, interrupts, HITL, or browser chat changed |
| Mastra agent/tool/workflow | deterministic tool/workflow tests; inspect registered agent/workflow | real model behavior, suspend/resume, memory, or persistence is part of AC |
| Cloudinary signing/webhook | signature/config unit tests + RPC/state-machine fixture | real upload/delivery/webhook integration is required |
| UI migration / responsive | component/state tests + localhost Playwright desktop + 390px | deployment CSS/assets/runtime can differ in preview |
| Build/config/env/middleware | typecheck + production build | deployed environment bindings or preview behavior matter |

## Current MDE commands — verify before using

Consult `package.json` and CI **at the target commit**. The checked main supports:

```bash
npx vitest run <relevant-test-file...>   # focused logic and contract tests
npm run lint                             # existing ESLint script
npm run typecheck
npm run build                            # when build/runtime contracts change
npm run test:e2e -- <relevant-spec>      # UI/browser changes only
npm run test:e2e:deterministic           # targeted deterministic suite
npx supabase test db                     # SQL/RLS changes in local test DB
npm run floor                            # repository gate
```

There is no `npm run e2e` or `npm run e2e:production` script at this revision. Do not invent them or omit the existing lint command. For a documentation-only PR, use documentation/skill checks plus repository-required exact-head CI; application E2E is not a relevant local prerequisite.

## Browser proof ladder

1. **Localhost** — fastest proof for route, auth, interaction, responsive and negative states. Playwright uses `SMOKE_BASE_URL`; the `test:e2e` npm wrapper defaults to localhost `:3002` while other scripts use `:3001`. Verify the actual selected script/project/port.
2. **Preview** — use when deployment wiring, environment variables, middleware, edge/runtime behavior, asset delivery, or hosted integrations could differ from localhost. Use only the project's allowlisted preview host.
3. **Production smoke** — post-merge/live certification only unless the task explicitly authorizes otherwise. Never use production to manufacture fixture state.

Playwright tests should assert user-visible behavior, stay isolated, use resilient role/text locators and web-first assertions, and retain trace/screenshot evidence on failures.

## Failure-driven escalation

A failing test is evidence, not a reason to immediately broaden the suite. First identify the smallest failing boundary:

```text
failure
→ reproduce once
→ classify code / data / environment / flake / stale test
→ inspect trace/log/network only for that boundary
→ load owning domain skill/MCP
→ smallest fix
→ rerun failing test
→ rerun directly affected neighbors
→ then broader gate only if needed
```

Stop and update the task if the failure exposes a changed source of truth, new migration/RPC/service requirement, cross-tenant leak, nondeterministic shared test state, or a dependency/version mismatch.

## Flaky-test gate

Retries are diagnostic evidence, not permission to merge instability. For critical journeys, a test that fails and only passes on retry is a failure until the root cause is understood. Prefer Playwright `failOnFlakyTests: true` or `--fail-on-flaky-tests` for critical CI lanes. Record flaky/race findings separately from deterministic product failures.

For affected MDE features test Rentals discovery → viewing → lead/showing, Events publish → test-mode checkout → webhook → ticket, and AI Concierge grounded results → authorized action; include auth, cross-tenant/private fixture denial and retry when applicable. Do not globally enable a stricter flaky gate without first auditing the current suite and owning existing flakes; apply it to a dedicated critical lane first when necessary.

## Production-build and preview browser strategy

Use browser proof in three levels:

1. **Local dev E2E** — fastest proof for UI/route/auth/tenant behavior.
2. **Production-build local smoke** — `npm run build` + production server when Next.js build/RSC/config/middleware behavior is part of the risk.
3. **Preview E2E** — use an allowlisted MDE preview when deployed env, auth callbacks, middleware, Cloudinary delivery, hosted CopilotKit/Mastra routing, or runtime configuration could differ from localhost.

Do not run preview/browser certification for pure helpers or isolated server logic already proved by cheaper tests. Preview failures must be classified as code, deployment/config, secrets/env, external service, or flake before changing product code.

## Current pre-merge risk checks — reverify rather than quoting stale observations

1. **Scripts/ports:** Inspect current `package.json` and `playwright.config.ts`. Local `SMOKE_BASE_URL` and `PLAYWRIGHT_WEB_SERVER_COMMAND` may differ across scripts. Do not assume a fixed port.
2. **Agent/model:** Separate live-provider quota/network failures from deterministic Mastra/CopilotKit tool failures; do not demand a paid model for a docs-only PR.
3. **Flakes:** Retry-pass is diagnostic, not evidence of first-pass reliability. Keep meaningful critical assertions.
4. **SQL:** Targeted pgTAP/ACL on narrow changes; fresh migration replay if migration chain/running new database is affected.
5. **Phase A:** No business permission/landlord verification/publication gates before official launch. Keep authentication, private-fixture isolation, transaction integrity and independent S4 review.
6. **Docs-only:** No unnecessary Graphify scan, Playwright, production writes or ticket checkout; use structural tests and skill evals if actually executable.

## Agent prompt

```text
Choose the smallest pre-merge test set that proves the risks introduced by this change. Start with exact Git diff/scope. For substantial code inspection use Graphify when its index is current; for narrow known docs files inspect those files directly. Map changed behavior to the test matrix, run targeted unit/component/SQL/integration tests first, then typecheck/build, then localhost browser proof, production-build smoke, preview E2E, or live-provider tests only when the risk requires them. For auth/tenant changes include negative and Org A/Org B proof; for critical Playwright journeys treat retry-pass as flaky until understood. Before citing any "current MDE pre-merge gap" from this file, re-verify it against package.json/CI directly rather than assuming it is still true. Record each command, result, environment, tested SHA, and any skipped/N/A gate with reason. Stop merge readiness on unexplained P0/P1 failures or flakes.
```

## User-journey gate

For user-facing or AI-native workflows, apply [user-journey-testing.md](user-journey-testing.md). Test the affected MDE outcome across UI, services, data, authorization and persistence; no Phase A business approval prerequisites. Preserve user confirmation and independent S4 technical review when actually applicable. For AI-native journeys, Playwright alone is insufficient: add AI quality and guardrail evidence when applicable.
