<!--
  mdeai PR template — keep PRs small, single-purpose, and reviewable.
  Lesson banked 2026-06-10: a 64-file PR that mixed UI + backend + docs hid 3 bugs
  and took longer to split than it would have to ship as 4 small PRs.
  One issue · one layer · one small PR.
-->

## What & why
<!-- One or two sentences. Plain English: what does this change do for a real user? -->

Closes SAN-___ · <SPEC-ID> — <full Linear title>

## Layer (pick ONE)
<!-- A PR should live in a single layer. Mixing them is what creates unreviewable PRs. -->
- [ ] **UI** — presentational component(s), mock/fixture data, no DB/agent
- [ ] **Data / DTO** — fetch/query + typed mapping, read-only
- [ ] **Backend / AI** — Mastra tool, core logic, DB write, edge fn (mocked-Supabase unit tests, no UI)
- [ ] **Wire** — connect an existing UI to an existing tool/action + e2e
- [ ] **Docs / chore** — no `src/**` runtime change

## Size budget
<!-- Soft budget. Over it? Either justify here or split the PR. -->
- [ ] ≤ ~400 net lines and ≤ ~15 files **— or** I've justified why below
- [ ] No unrelated files (docs trees, lockfile churn, other features) rode along
- [ ] Branch is **up to date with `main`** (rebased/merged) — not a stale base

<!-- If over budget, justify or note the follow-up split: -->

## Faster / smaller solution considered
<!--
  AGENTS.md § Ponytail. What existing/native/prebuilt option did you check first, and why did it not
  win? "Nothing existed" is a valid answer — but name what you looked at.
  - does not need to exist? · already in this repo? · standard library? · native platform or CLI?
  - installed dependency? · official template, example, or recipe? · only then custom code?
-->
- [ ] Checked the reuse ladder and stopped at the earliest rung that works
<!-- If the platform only offers a dashboard/console path: is it reproducible from Git? If not, it belongs in a migration or committed config. -->

## Source receipts
<!--
  AGENTS.md § Evidence rules. One row per external source that MATERIALLY affected the solution.
  Background reading gets no row — an inflated table buries the rows that mattered.
  REFERENCE ONLY must state why nothing was adopted and what alternative was rejected.
-->

| URL | Source (file/section/command) | Decision | Disposition | Destination | Implementation | Verification | Version/commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

- [ ] None needed — no external source materially affected this change

## Test plan & evidence
- [ ] `npm run floor` green (lint · typecheck · build · test · audit)
- [ ] Tests added/updated for the change (unit for logic, e2e for a user path)
- [ ] Evidence: `docs/06-testing/playwright/evidence/YYYY-MM-DD/<id>-RESULTS.md` (link below)
<!-- Paste the floor result / test counts / evidence path here. State honestly what was NOT run. -->
<!-- Source proof and implementation proof are different: a URL is not a test, and a passing test does not validate an unchecked assumption. -->


## Self-review
- [ ] No secrets / service-role keys added under `src/**` (F13 carve-outs only)
- [ ] New Supabase table → RLS + ≥1 policy · Places call → field mask · `<Map>` → `mapId`
- [ ] Every `SAN-NNN` in this PR is written as `SAN-NNN · SPEC-ID — full title`


## What changes for people
<!-- Use short, plain English. Keep earlier text above; these fields extend the existing description. -->
- **What this PR actually does:** 
- **Real-world example:** A [renter / attendee / host / admin] can [action] and sees [observable result].
- **Key features:** 
- **Type:** Product/runtime / Test-only / Docs-only / Infrastructure (choose the accurate type).
- **Do we need this?** Explain the actual problem solved, or why the existing path cannot already solve it.
- **Tech stack touched:** List only changed systems, such as Next.js, CopilotKit v2, Mastra, Supabase, Stripe, Maps, or Playwright.
- **Out of scope:** 

## User journey and architecture (when useful)
<!--
Describe actor → action → UI/API → persisted result, including retry/failure.
For cross-system changes, REPLACE this commented example with a real Mermaid block.
For docs/test-only PRs use "N/A — no user-facing journey or architecture change".
Example syntax (not evidence of implementation):

~~~mermaid
flowchart LR
  A[User action] --> B[Existing UI or API]
  B --> C[Authoritative service]
  C --> D[Verified result]
~~~

Do not invent architecture, database effects, or product behavior.
-->
- **Journey:** 
- **Mermaid:** N/A / diagram below with verified components.

## Success criteria
<!-- Observable, falsifiable criteria; leave unchecked until evidenced. Mark N/A with a reason. -->
- [ ] The requested outcome works through the real application (or N/A — docs/test-only).
- [ ] Data/actions are truthful; authorization, tenant isolation, atomic writes, idempotency, and cleanup are preserved where applicable.
- [ ] Failure/retry path and 390px mobile are verified where applicable.
- [ ] Every criterion has a test, browser, DB, or CI evidence link below.

## Pre-merge commands and results
<!-- Run only relevant checks. Never mark an unrun command as PASS. Match current package.json and test config. -->
| Check / command | Result (PASS / FAIL / NOT RUN / N/A) | Evidence / reason |
| --- | --- | --- |
| \`npm test -- <focused-test>\` (replace with actual test selector) | NOT RUN | |
| \`npm run lint\` and \`npm run typecheck\` | NOT RUN | |
| \`npm run floor\` (canonical full repo gate) | NOT RUN | |
| \`npx playwright test <relevant-spec> --project=chromium --workers=1\` | NOT RUN | |
| \`npx supabase test db\` (schema / RLS / RPC changes only) | N/A | No DB change unless stated |
| Exact-head required CI: \`floor\`, \`mastra-schema-init\`, review | NOT RUN | Current PR head SHA: |
<!-- Keep the earlier "Test plan & evidence" section; summarize proofs here, do not replace it. -->

## Pre-merge decision
- [ ] Actual changed files/diff and existing PR description reviewed; old narrative retained.
- [ ] No unrelated changes, invented facts, secrets, or accidental business approval gates added.
- [ ] All still-valid review findings resolved with evidence; skipped/stale findings explained.
- [ ] Applicable success criteria tested at the current PR head; checks required by branch protection green.
- [ ] Required human approval / documented narrow exception satisfied.
- **Merge decision:** Not ready / Ready with exact-head proof (explain).

## Post-merge and live verification
<!-- These are planned commands, not proof they have run. Docs-only changes need no runtime rollout. -->
1. Confirm PR merge SHA and required checks on \`main\`.
2. If runtime changed, confirm Vercel deployment serves the **merged commit** (deployment URL + environment + \`/api/version\` when available); do not equate a preview URL with the live site.
3. For runtime changes, run the relevant safe production smoke: \`npm run smoke:prod\`, \`npm run verify:production\`, or a named read-only Playwright production spec after checking prerequisites.
4. Verify the actual affected user journey at \`https://www.mdeai.co\` (desktop + 390px where applicable), console/network errors, and DB readback only for approved write tests.
5. Report live result **PASS / FAIL / NOT VERIFIED**, tested commit, URLs, exact commands, and any follow-up. A docs-only PR: verify files on merged \`main\` and that a *new* PR displays the template; runtime deploy smoke is N/A.

## Official references and implementation instructions
<!-- Include only links actually used; the Source receipts table above remains canonical for material decisions. -->
| Official URL | How it applies to this PR |
| --- | --- |
| https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository | When changing PR template behavior, verify the canonical filename and test the new-PR editor. |
| https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams | For a nontrivial journey, use a valid Mermaid diagram that matches current code. |
| https://playwright.dev/docs/running-tests | For browser changes, choose the smallest real journey/spec and report actual results. |
| https://vercel.com/docs/deployments/environments | For a runtime release, check preview vs production and the exact deployed commit. |
<!-- Delete irrelevant rows in an actual PR; add exact library/vendor docs when those APIs were changed. -->
