# AGENTS.md — MDE AI

Portable repository guidance for coding agents working from the current Git checkout root.

## Repository truth

- Remote: `https://github.com/amoai-tech/mdeai.git`.
- Package/app source lives at the repository root.
- Main stack: Next.js 16, React 19, CopilotKit 1.55.2 v2 APIs, Mastra, Supabase, Gemini, Google Maps, Cloudinary, Playwright, and Vitest.
- `.claude/skills/` is the canonical project skill library. `.agents/skills/` mirrors every canonical entry (`SKILL.md`, `references/`, `scripts/`, `evals/`) as **relative symlinks** so other agents resolve the same files. `npm run check:skills` fails on a copy, an absolute link, or a missing entry; if a mirror genuinely needs a different shape, change the checker in the same PR and say why.
- Linear is the durable task/progress source of truth for substantial SAN work.
- Never rely on machine-specific absolute paths; resolve the current checkout root dynamically.

## Build and test commands

```bash
npm ci                    # install
npm run dev               # Next.js :3001 + Mastra :4111
npm run lint              # ESLint, --max-warnings 0
npm run typecheck         # tsc --noEmit
npm test                  # Vitest, run once
npm run test:e2e          # Playwright
npx supabase test db      # database (pgTAP) tests
npm run check:env:ci      # env contract, strict
npm run check:skills      # skill library + agent exposure mirror
npm run floor             # full gate — run before claiming done
npm run graphify:query -- "<question>"
```

`npm run floor` runs `check:skills → check:db-url-guard → check:release-gates → audit:copilotkit-v2 → lint → typecheck → check:env:ci → build → test → check:mastra → audit:floor`.

Traps worth knowing before you debug them:

- `check:env:ci` fails in a fresh worktree with no `.env`; export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` first.
- `.env` and `.env.local` can disagree (notably `VERCEL_*`). State which file you used.
- Tests under `scripts/__tests__/*.test.mjs` run with `node --test` through `check:release-gates`, not Vitest. Vitest only collects `src/**` and `e2e/**/*.test.ts`.

## Instruction ownership

Rules live at exactly one level, and a lower level never silently overrides a higher one:

| Level | Owns |
| -- | -- |
| `AGENTS.md` | Repository-wide invariants, routing, and the completion contract |
| `.claude/skills/<name>/SKILL.md` | The detailed workflow and domain rules for that owner |
| `.claude/skills/<name>/references/` | Long-form examples, source maps, vendor docs |
| Tests and CI | What is mechanically enforced |

If a detailed rule already lives in a canonical skill, link to it here rather than restating it. When a shared rule changes, change it at its owning level and delete the copy.

## Skill routing

Use the narrowest owner directly. When ownership is ambiguous, use `using-mde-skills` to choose exactly one canonical execution owner, then stop routing. **Known domain beats generic workflow**: if the request names a canonical domain skill, route there even when it says bug, broken, failing, or debug. Use `systematic-debugging` only when the responsible root cause is genuinely unknown.

- Simple domain/stack work → the relevant specialist skill.
- Reuse-before-build and evidence receipts → `ponytail` (runs *before* implementation ownership; never replaces the domain owner).
- Substantial or ambiguous implementation, PR creation, review handling → `tasks`.
- Unknown failure/root cause → `systematic-debugging`.
- Test strategy, test-first work, regression proof → `testing`.
- Existing diff/PR review → `code-review`.
- Research needing primary sources → `research`.
- Done, merge, or production claims → `task-verifier`.
- UI state/interaction design → `wireframe`.
- Architecture/state/dependency visualization → `mermaid-diagrams`.

**S4 work needs independent verification before Done:** payments or financial side effects; auth, RLS, or tenant boundaries; secrets and security controls; destructive or irreversible production-data changes; duplicate- or retry-sensitive irreversible external side effects. S4 applies even when ownership is obvious and the router was bypassed. Ordinary domain bugs and implementation work are not S4.

Do not restore retired lifecycle owners (`mde-task-lifecycle`, `lean-dev-flow`, `mde-worktree-pr-flow`) or the old PR #45 routing machinery.

## Shared invariants

Load the owning skill and follow its current instructions.

- Git/worktree safety and execution sequencing → `tasks`.
- PR body standard, reviewer fast path, exact-head rule, post-merge checks → `tasks`.
- Reuse ladder, evidence receipts, root-cause discipline → `ponytail`.
- Anti-fake-Done and independent verification → `task-verifier`.
- Root-cause methodology → `systematic-debugging`.
- Test selection, TDD, regression proof → `testing`.
- Supabase auth/RLS/service-role rules → `supabase`.
- CopilotKit/AG-UI integration → `copilotkit`.
- Mastra agents, tools, workflows → `mastra`.
- Maps field masks and marker configuration → `maps`.
- Gemini model/provider details → `gemini`.
- Next.js App Router, RSC, caching, Vercel config → `nextjs`.
- Payments, checkout, webhooks, Connect, refunds → `stripe`.
- Cloudinary uploads and media lifecycle → `cloudinary`.
- Event creation, tickets, attendee flows → `events`.
- Rentals, listings, broker/host flows, viewings → `real-estate`.

## Ponytail — reuse before build

Trace the real user/runtime flow first, then stop at the first rung that safely satisfies the requirement:

1. it does not need to exist;
2. an existing repository helper, component, or pattern already does it;
3. the standard library does it;
4. a native platform capability covers it — including an official dashboard or CLI surface;
5. an already-installed dependency solves it;
6. an official template, example, recipe, or CLI command covers it;
7. only then, the minimum custom implementation.

Choose the earliest rung that satisfies correctness, security, testability, reproducibility, version compatibility, and automation. **A dashboard-only configuration is not sufficient when it must be reproducible from Git** — a setting that has to replay in every environment belongs in a migration or committed config, not a console.

Do not build a custom abstraction merely because it is easy to write. Then fix the shared root cause rather than duplicating a patch per caller, and leave one runnable verification proving the decision.

**Not lazy about:** input validation at trust boundaries, error handling that prevents data loss, security, accessibility, and anything explicitly requested. Never trade these for a smaller diff. Mark a deliberate ceiling with a `ponytail:` comment naming the ceiling and its upgrade path.

The expanded implementation order, examples, and the source map live in `.claude/skills/ponytail/SKILL.md`.

## Evidence rules

### Source priority — verify the current contract first

Determine what this repository actually uses before copying any example. In order:

1. the installed package, pinned version, generated types, or CLI help;
2. official documentation **for that version**;
3. the official source repository at the matching version or commit;
4. official examples, templates, recipes, and starter projects;
5. existing implementation in this repo;
6. third-party examples, only when primary sources are insufficient.

A blog, tutorial, or model recall is never authority when the official implementation is available. Our pins lag upstream — a current upstream example applied to an older API is a new bug wearing a citation. This matters most for CopilotKit, Mastra, Next.js, the Supabase CLI, Google Maps, and Gemini.

### Two kinds of proof

Source evidence and implementation evidence prove different things, and neither substitutes for the other.

| | Answers |
| -- | -- |
| **Source proof** | Does this API exist? What arguments or configuration does it support? What does the platform officially guarantee? |
| **Implementation proof** | Did we use it correctly here? Does the integration work? Does the user journey succeed? Are security and data integrity preserved? |

A URL cannot replace a test. A passing test cannot establish an undocumented external contract. Use both whenever the decision depends on both: the Supabase CLI source proves which migration filenames `db push` discovers, and our regression test proves the guard follows the same rule.

### Source receipts

Record a receipt **only** for an external source that materially affects the implementation or the decision. Background reading gets none — an inflated citation table buries the rows that mattered.

| Field | Requirement |
| -- | -- |
| **URL** | Exact full URL |
| **Source** | Exact file, section, symbol, command, example, recipe, or template |
| **Decision** | The engineering question this source answered |
| **Disposition** | `COPY` · `ADAPT` · `MODEL` · `REFERENCE ONLY` |
| **Destination** | Exact repository path changed because of it, or `—` |
| **Implementation** | The exact change to make |
| **Verification** | Exact command, test, query, or runtime proof |
| **Version / commit** | Version, tag, or commit, when behaviour may drift |

A receipt with neither an implementation consequence nor an explicit rejection is incomplete — that is what stops "I read the docs" from counting as engineering proof.

**Dispositions.** *`COPY`* — substantially unchanged, licence permitting, with the upstream version recorded. *`ADAPT`* — an official implementation used as the starting pattern, modified for MDE's architecture, versions, security, or naming. *`MODEL`* — do not reuse the implementation; reproduce the design, structure, or decision pattern in MDE-specific code. *`REFERENCE ONLY`* — informed the decision, nothing implemented from it: state why nothing was adopted, the alternative considered, and why that alternative was rejected.

Never assert a decision-critical claim from memory, and never round an unverified claim up to a fact. State what you checked and what you could not.

## Graphify repository intelligence

Before broad repository searching on substantial code tasks:

1. Check whether `graphify-out/graph.json` exists and is current.
2. Prefer Graphify for exact symbols, dependency paths, affected-code discovery, and blast-radius analysis.
3. Use `npm run graphify:query -- "<question>"`, `npm run graphify:explain -- "<symbol>"`, and `npm run graphify:path -- "<A>" "<B>"` before broad raw-file search when they fit the question.
4. Fall back to normal search when the question is conceptual, Graphify has no useful match, runtime behavior needs verification, or direct source evidence is more appropriate.
5. Treat static graph results as navigation evidence rather than sufficient deletion proof; confirm risky conclusions against source, runtime behavior, and relevant tests.

## Boundaries

✅ **Always**

- New Supabase tables require RLS and an explicit authorization policy.
- Google Places requests use intentional field masks; Maps markers use the correct map configuration, unless the owning Maps skill documents a supported exception.
- Prefer the fewest necessary independently reviewable PRs.
- Treat repository skills as trusted executable instructions: review skill changes before relying on them.
- Run the narrowest relevant proof before calling anything done.

⚠️ **Ask first**

- Production AI model/provider changes. Production uses Gemini; verify the current contract first.
- Destructive or irreversible production-data changes.
- Editing a release gate, a required check, or `.github/workflows/**`.

🚫 **Never**

- Expose secrets or service-role credentials to client code.
- Mix bare CopilotKit v1 imports with `/v2` imports.
- Reset, clean, or discard unrelated working-tree changes.
- Mark work Done without current evidence from the relevant tests/runtime.
- Weaken a gate, or fabricate data, to make a check pass.

## Enforced automatically

`.claude/hooks/` blocks these mechanically, so expect a failure rather than a warning:

`guard-sensitive-paths` · `scan-secrets` · `no-service-role-in-src` · `gemini-model-pin` · `copilotkit-version-pin` · `places-api-field-mask` · `advanced-marker-needs-mapid` · `dist-leak-scan` (PreToolUse) · `lint-edited-ts` · `typecheck-edited-ts` (PostToolUse) · `stop-rls-gate` · `stop-plain-language-gate` (Stop) · `session-start` (SessionStart).

Slash commands: `/verify-floor`, `/auto-review`, `/copilotkit-check`, `/supabase-rls-audit`. Review subagents: `mdeai-auto-reviewer`, `pr-scope-reviewer`, `security-reviewer`.

## Pull requests

Owned by `tasks`. The required body sections and the PR readiness sequence live in
`.claude/skills/tasks/references/github-pr.md`; this section is only the repository-wide contract:

- Explain the change to a reader who has not seen the task: the real-world problem, what changed, verification with exact commands and results, and honest risks and remaining work.
- **Titles are real-world** — what changes for a person, not the internal mechanism.
- Add a Mermaid diagram, a user journey, database proof, or post-merge steps **only when they apply**, never to satisfy a format. A docs-only PR needs no architecture diagram.
- Include source receipts for external material that affected the solution — see § Evidence rules.
- The body lives on **GitHub**, not in a local scratch file. Create it with `gh pr create --body-file` and re-run `gh pr edit` whenever the change moves: a body describing an earlier revision reads as current.

A PR body that only restates the diff has added nothing.

## CI and merge approval

`floor` is the only required status check on `main`. It runs on every PR regardless of base branch, because a stacked PR still needs the same proof.

Advisory analyzers such as Codacy do not gate a merge. Review their findings on the merits: fix valid ones, document verified false positives, and never weaken production behaviour to silence a heuristic. A Codacy `fail` alone never blocks. Known false-positive classes are catalogued in `.claude/skills/code-review/references/ci-review.md` — one of them fires on eight deliberate absolutes in this file, the paragraph you are reading included.

`main` requires one approving review. Administrator bypasses are exceptional: if one is used, record the reason in the affected PR, which required checks passed, and why waiting for normal approval was not appropriate. Production, runtime, database, and deploy changes satisfy normal approval. Prior bypasses and their reasoning are recorded in `docs/07-operations/merge-approval-history.md`.

## Completion contract

"Done" means every applicable layer has **current** evidence, and no layer substitutes for another:

| Layer | Evidence |
| -- | -- |
| Implementation | Focused regression proof |
| Integration | The affected runtime or integration test |
| Repository gate | `npm run floor` — exit 0 |
| CI | Exact PR-head checks green |
| Review | Unresolved findings = 0 |
| Approval | The required human approval recorded |

A passing unit test does not prove a migration applies. A passing dry-run does not prove required checks are green.

For skill and bootstrap changes, run the narrow checks first:

```bash
git diff --check
node --check .claude/hooks/session-start.mjs
node .claude/hooks/__tests__/session-start.test.mjs
```

Structural eval definitions are specifications only until they are executed. A schema validation passing is not the behavioural eval passing.

## Application context

Representative product surfaces include `/`, `/chat`, `/events`, `/rentals`, `/restaurants`, `/cafes`, `/nightlife`, `/trips`, `/host/*`, `/admin/event-bookings`, and `/api/copilotkit/[[...path]]`.

This bootstrap file does not define product behavior. Current source code, current tests, current Linear tasks, and the owning skills are authoritative.

## Response style

Lead with the answer. Keep explanations concise, concrete, and tied to MDE. Always pair task numbers with task names.
