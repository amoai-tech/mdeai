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

`npm run floor` runs `check:skills → check:db-url-guard → check:release-gates → lint → typecheck → check:env:ci → build → test → check:mastra → audit:floor`.

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

Before implementation:

1. Trace the real user/runtime flow.
2. Ask: is there a faster, smaller, or better-supported solution?
3. Stop at the first valid rung:
   - it does not need to exist;
   - it already exists in this repo;
   - the standard library does it;
   - a native platform capability covers it;
   - an already-installed dependency solves it;
   - it is one direct line or change;
   - only then, the minimum custom implementation.
4. Fix the shared root cause rather than duplicating a patch per caller.
5. Leave one runnable verification proving the decision.

**Not lazy about:** input validation at trust boundaries, error handling that prevents data loss, security, accessibility, and anything explicitly requested. Never trade these for a smaller diff. Mark a deliberate ceiling with a `ponytail:` comment naming the ceiling and its upgrade path.

Detailed rules, examples, and the source map live in `.claude/skills/ponytail/SKILL.md`.

## Evidence rules

### Verify the current contract first

Determine the version or API shape this repository actually uses before copying any example. In order:

1. the installed package or pinned version (`node_modules/`, lockfile);
2. current source and types in this repo;
3. official documentation **for that version**;
4. official repository examples;
5. third-party examples, only when primary sources are insufficient.

Never adapt a current upstream example when this repo is pinned to an older API. This matters most for CopilotKit, Mastra, Next.js, the Supabase CLI, Google Maps, and Gemini.

### Two kinds of proof

Source verification and implementation verification are different, and neither substitutes for the other.

- **Source proof** confirms the API, behaviour, version, security property, or platform capability.
- **Implementation proof** confirms this repository actually uses it correctly.

A primary-source URL cannot replace a test. A passing test cannot prove an external API claim that was never verified. The Supabase CLI source confirms which migration filenames `db push` discovers; our guard's tests prove our code matches it. Doing one and claiming both is the failure this rule exists to prevent.

### Source receipts

Record a receipt **only** for an external source that materially affects the implementation or the decision. Background reading gets none — an inflated citation table is documentation noise, not evidence.

| Field | Requirement |
| -- | -- |
| **URL** | Exact full URL |
| **Source** | Exact file, section, API, symbol, or example |
| **Disposition** | `COPY` · `ADAPT` · `MODEL` · `REFERENCE ONLY` |
| **Destination** | Exact repository path, or `—` |
| **Verification** | Exact command or test proving the result |

`COPY` is verbatim with attribution and no local edits. `ADAPT` is the same approach in our conventions; say what changed. `MODEL` follows the shape; say what diverged. `REFERENCE ONLY` ships nothing and **must explain why nothing was adopted and what alternative was rejected** — otherwise it is the escape hatch that makes this rule decorative.

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

Every substantial PR explains, in plain English, to a reader who has not seen the task:

1. Task name and outcome.
2. The real-world problem it solves.
3. What changed.
4. Verification performed, with exact commands and their results.
5. Important risks and remaining work.
6. Source receipts for external material that affected the solution.

Add these only when they apply — never to satisfy a format:

- **Mermaid diagram** — architecture, workflow, state, or dependency changes.
- **User journey** — user-visible behaviour changes.
- **Database proof** — schema, RLS, or migration changes.
- **Post-merge steps** — deploy, migration, configuration, or operational work.

Titles are real-world: what changes for a person, not the internal mechanism. The body lives on **GitHub**, not in a local scratch file — create it with `gh pr create --body-file` and re-run `gh pr edit` whenever the change moves, because a body describing an earlier revision reads as current. A PR body that only restates the diff has added nothing.

## CI and merge approval

`floor` is the only required status check on `main`. It runs on every PR regardless of base branch, because a stacked PR still needs the same proof.

Advisory analyzers such as Codacy do not gate a merge. Review their findings on the merits: fix valid ones, document verified false positives, and never weaken production behaviour to silence a heuristic. A Codacy `fail` alone never blocks. Known false-positive classes are catalogued in `.claude/skills/code-review/references/ci-review.md`.

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
