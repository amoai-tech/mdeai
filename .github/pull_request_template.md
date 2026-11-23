<!--
  MDE AI PR template: one independently testable outcome, across layers when needed.
  Keep descriptions concise and evidence-based. Remove irrelevant optional rows.
  Never overwrite an existing PR body to apply a new template.
-->

## Summary
<!-- One short summary; use plain English. Only link a verified Linear issue/title. -->
- **Outcome:** [Who can do what, and what changes?]
- **Real-world example:** [Renter/attendee/host/admin] → [action] → [visible and persisted result].
- **Why needed / reuse:** [What was broken/missing? Which existing UI/API/RPC/tool did you reuse?]
- **Key features:** [1–3 meaningful capabilities, not a diff summary.]
- **Change type:** Product/runtime / Test-only / Docs-only / Infrastructure (choose one).
- **Tech stack touched:** [Only changed systems, e.g. Next.js, CopilotKit, Mastra, Supabase, Stripe, Maps, Playwright.]
- **Out of scope:** [Explicit non-goals or N/A.]
- **Linear:** [Choose `Closes SAN-#### · SPEC-ID — Exact Linear Task Title` only when this PR fully finishes that verified issue; `Part of SAN-#### · SPEC-ID — Exact Linear Task Title` when it is partial; `N/A — no linked task` otherwise. Do not auto-close incomplete work.]

## Scope, changed files and reviewer fast path
<!-- One independently testable outcome per PR. A small complete journey may span UI/API/DB.
     Soft size budget: ~400 net lines and ~15 files; explain justified exceptions.
     Avoid unrelated changes and stale bases. Do not add business eligibility/approval gates in Phase A. -->
- **Changed files and purpose:** [Short list of paths → why each matters.]
- **Review these first:** [3–5 highest-risk files, or fewer for a small PR, and what to inspect.]
- **Reproduce:** [Exact UI path/action or test; URL/environment if applicable.]
- **Risk / failure mode:** [What might break? Security, tenant isolation, duplicates, recovery, data, or N/A.]
- **Size / scope exceptions:** [N/A, or why the smallest working change needs multiple layers/files.]

## User journey and architecture (only if useful)
<!-- For a nontrivial cross-system/stateful journey, show actor → UI → canonical owner →
     persisted result and a failure/retry branch. Use one verified Mermaid diagram.
     GitHub syntax:
     ~~~mermaid
     flowchart LR
       A[User action] --> B[Existing UI or API]
       B --> C[Canonical service]
       C --> D[Verified result]
     ~~~
     For docs-only, test-only or simple changes: N/A — reason.
     Never present an illustrative diagram as evidence of implementation. -->
- **Journey / Mermaid:** [Verified diagram or N/A — reason.]

## Success criteria — observable outcomes
<!-- Replace examples below with 1–4 task-specific, falsifiable criteria.
     Each checked item needs evidence linked in the verification table.
     For test-only work, specify the regression the new test catches; for docs-only,
     specify the documentation behavior confirmed. Do not tick ahead of proof. -->
- [ ] [User action produces expected UI/API/persisted result — evidence.]
- [ ] [Failure/retry does not create duplicate side effects — when applicable.]
- [ ] [Auth/tenant isolation, truthful data and 390px mobile confirmed — when affected.]

## Reuse and material source receipts (only when relevant)
<!-- Describe the first working rung: existing app → platform/native API → installed dependency
     → official recipe → minimal new code. Material external sources must follow
     AGENTS.md Source receipts: URL, exact source, decision, disposition
     (COPY / ADAPT / MODEL / REFERENCE ONLY), destination, implementation,
     verification, and version/commit when relevant. Do not add generic links for padding. -->
- **Faster/smaller solution considered:** [Existing code/native method reused; rejected alternative and reason.]
- **Material sources and how used:** [Receipt(s) per AGENTS.md, or N/A — none materially affected the change.]

## Pre-merge verification — actual commands and results
<!-- Risk-based: exact diff/scope → focused Vitest/contract/SQL → typecheck/build as needed
     → browser/preview when UI or deployed behavior changed. Follow
     .claude/skills/tasks/references/pre-merge-tests.md.
     Each independently run command/check gets its OWN row.
     In "Where / SHA" state environment AND source/head SHA for every PASS.
     Link logs, CI jobs, screenshots or DB readback. Use PASS / FAIL / NOT RUN / N/A;
     explain skipped tests. Do not report a green test from an older PR head as current.
     Existing Floor/PR Agent/Playwright CI already performs automation: do not duplicate. -->
| Check / exact command | Result | Where / tested SHA | Evidence / reason |
| --- | --- | --- | --- |
| `npm test -- <actual-test-path>` (focused, when relevant) | NOT RUN | | |
| `npm run lint` (if run separately) | NOT RUN | | |
| `npm run typecheck` (if run separately) | NOT RUN | | |
| `npm run floor` (full local gate, when run) | NOT RUN | | |
| Playwright/browser or preview URL (when relevant) | NOT RUN | | |
| `npx supabase test db` (schema/RLS/RPC changes only) | N/A | | No database change unless stated |
| GitHub CI: `floor` | NOT RUN | PR head: | |
| GitHub CI: `mastra-schema-init` | NOT RUN | PR head: | |
| GitHub CI: `review / verify-review-result` | NOT RUN | PR head: | |
<!-- For UI, provide preview URL and desktop/390px screenshot links where safe.
     For test/docs-only, use focused test/structural verification and N/A for
     unrelated runtime journeys; required repository CI still applies. -->

## Pre-merge decision and self-review
- [ ] Changed-file scope, source receipts, and review evidence reflect the current PR head.
- [ ] No secrets in client/runtime code; new Supabase tables have appropriate RLS + policies, if applicable.
- [ ] Preserve authorization, data integrity, idempotency, and truthful source attribution; no Phase A business certification prerequisites.
- [ ] Places field mask / Google Maps mapId checked if changed; Linear references use exact verified task title.
- [ ] All valid review findings addressed or explained; required exact-head checks passed and required approval/authorized exception satisfied.
- **Merge decision:** NOT READY / READY — [Current head SHA and supporting evidence; never infer from older runs.]

## Post-merge verification and recovery
<!-- These steps are PLAN only until actually executed. Record PASS / FAIL / NOT VERIFIED afterward. -->
1. **All PR types:** Confirm merge commit and intended changed files on `main`. Confirm no unintended changes.
2. **Docs-only:** Open a *new* PR editor to verify template rendering, if changed; runtime smoke N/A. **Test-only:** Verify the test/CI behavior, not an invented product feature.
3. **Runtime only:** Verify Vercel production deployment and `https://www.mdeai.co` serve the merged commit (and `/api/version` when applicable). Preview URL is not proof of production.
4. **Runtime only:** Check affected read-only user journey, network/console errors and 390px UI if applicable. Use a safe read-only probe by default; before any scripted smoke, inspect its current side effects. `npm run verify:production` exercises a real host-agent journey and persists a thread, so it is **NOT read-only**: run it or other production-writing tests only with explicit task-specific opt-in, private QA fixtures and verified cleanup.
5. **Report:** Tested SHA, environment, URLs, exact checks, PASS/FAIL/NOT VERIFIED, unresolved issues and links to evidence.
6. **Recovery:** [If regression: responsible owner, rollback/revert or safe forward-fix path; for database migrations, explain data-safe recovery. N/A + reason for docs-only.]

## Official documentation (only when materially used)
<!-- Record exact official URL + version, how applied, and proof under material source receipts above.
     GitHub PR templates: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository
     Mermaid: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
     Playwright: https://playwright.dev/docs/running-tests
     Vercel preview/production: https://vercel.com/docs/deployments/environments -->
- **References:** [Exact material URL → decision and implementation step, or N/A.]
