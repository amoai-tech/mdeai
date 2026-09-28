# AGENTS.md — MDE AI

Portable repository guidance for coding agents working from the current Git checkout root.

## Repository truth

- Remote: `https://github.com/amoai-tech/mdeai.git`.
- Package/app source lives at the repository root.
- Main stack: Next.js 16, React 19, CopilotKit 1.55.2 v2 APIs, Mastra, Supabase, Gemini, Google Maps, Cloudinary, Playwright, and Vitest.
- `.claude/skills/` is the canonical project skill library. `.agents/skills/` mirrors every canonical entry (`SKILL.md`, `references/`, `scripts/`, `evals/`) as relative symlinks so other agents resolve the same files. Never copy skill content into `.agents/`; `npm run check:skills` fails when the two trees disagree.
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

## Skill routing

Use the narrowest owner directly. When ownership is ambiguous, use `using-mde-skills` to choose exactly one canonical execution owner and then stop routing:

Known domain beats generic workflow.

If the request clearly names or belongs to a canonical domain skill, route directly to that domain even when the request contains words such as bug, broken, failing, error, debug, or troubleshoot.

Use `systematic-debugging` only when the responsible domain/root cause is genuinely unknown.

- Simple domain/stack work → relevant specialist skill.
- Substantial or ambiguous implementation → `tasks`.
- Unknown failure/root cause → `systematic-debugging`.
- Test strategy, test-first implementation, and regression proof → `testing`.
- Existing diff/PR review → `code-review`.
- Research/evidence gathering → `research`.
- Done/merge/production claim → `task-verifier`.
- UI state/interaction design → `wireframe`.
- Architecture/state/dependency visualization → `mermaid-diagrams`.

`using-mde-skills` is the active lightweight ambiguity router. Do not restore retired lifecycle owners (`mde-task-lifecycle`, `lean-dev-flow`, or `mde-worktree-pr-flow`) or the old PR #45 routing machinery. Lifecycle/execution routes to `tasks`; independent Done/merge/production proof routes to `task-verifier`. S4 safety applies even when ownership is obvious and the router is bypassed. Treat payments/financial side effects, auth/RLS/tenant-boundary changes, secrets/security controls, destructive or irreversible production-data changes, and duplicate/retry-sensitive irreversible external side effects as S4; only those S4 requests require independent `task-verifier` verification before completion. Ordinary domain bugs and implementation work do not automatically become S4.

## Canonical skills

`.claude/skills/INDEX.md` is the authoritative list of active skills with its score and keep/consolidate decision. Read it instead of a list maintained here; a parallel catalogue drifts. `npm run check:skills` fails when `.claude/skills/` and the `.agents/skills/` mirror disagree.

Skills group into **stack** (framework and platform owners), **domain** (product-domain owners), and **workflow** (task lifecycle, verification, research, review, and reasoning owners). Ownership routing lives in the section above and in `Shared invariants` below.

## Graphify repo intelligence

Before broad repository searching on substantial code tasks:

1. Check whether `graphify-out/graph.json` exists and is current.
2. Prefer Graphify for exact symbols, dependency paths, affected-code discovery, and blast-radius analysis.
3. Use `npm run graphify:query -- "<question>"`, `npm run graphify:explain -- "<symbol>"`, and `npm run graphify:path -- "<A>" "<B>"` before broad raw-file search when they fit the question.
4. Fall back to normal search when the question is conceptual, Graphify has no useful match, runtime behavior needs verification, or direct source evidence is more appropriate.
5. Treat static graph results as navigation evidence rather than sufficient deletion proof; confirm risky conclusions against source, runtime behavior, and relevant tests.

## Ponytail engineering rule

Before writing custom code, prefer the earliest rung that safely satisfies the task: skip unnecessary work; reuse existing repository code; prefer the standard library or native platform; reuse an installed dependency; use a small direct change; only then add the minimum new implementation required. Preserve required validation, error handling, security, accessibility, data integrity, and tests rather than trading them away merely to reduce code size.

## Shared invariants

Do not duplicate detailed operating rules here when a canonical skill owns them. Load the relevant skill and follow its current instructions.

- Git/worktree safety and execution sequencing → `tasks`.
- Verification and anti-fake-Done requirements → `task-verifier`.
- Root-cause methodology → `systematic-debugging`.
- Test selection, TDD, and regression proof → `testing`.
- Supabase auth/RLS/service-role rules → `supabase`.
- CopilotKit/AG-UI integration rules → `copilotkit`.
- Mastra agent/tool/workflow rules → `mastra`.
- Google Maps/Places field masks and marker configuration → `maps`.
- Gemini model/provider details → `gemini`.
- Next.js App Router, RSC boundaries, caching, and Vercel deploy/config → `nextjs`.
- Payments, checkout, webhooks, Connect, and refunds → `stripe`.
- Cloudinary uploads, transformations, and media lifecycle → `cloudinary`.
- Event creation, publishing, tickets, and attendee flows → `events`.
- Rental/property discovery, listings, broker and host flows, viewings → `real-estate`.

## Boundaries

✅ **Always**

- New Supabase tables require RLS and an explicit authorization policy.
- Google Places requests must use intentional field masks; Maps markers require the correct map configuration, unless the owning Maps skill or the current task documents a specific supported exception.
- Prefer the fewest necessary independently reviewable PRs.
- Treat repository skills as trusted executable instructions: review skill changes before relying on them.
- Run the narrowest relevant proof before calling anything done.

⚠️ **Ask first**

- Production AI model/provider changes. Production uses Gemini; verify the current contract before changing model names.
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

## Verification

For skill/bootstrap changes, run the narrow checks first:

```bash
git diff --check
node --check .claude/hooks/session-start.mjs
node .claude/hooks/__tests__/session-start.test.mjs
```

Then validate changed-file links, skill metadata/frontmatter, eval JSON, and stale router dependencies. Run the full application Floor on the final landing stack or whenever runtime/source/config changes require it.

Structural eval definitions are specifications only until they are actually executed. Schema-validation tests may report the JSON/schema validation itself as passing, but do not report the behavioral eval as passing merely because its definition validates.

## Application context

Representative product surfaces include `/`, `/chat`, `/events`, `/rentals`, `/restaurants`, `/cafes`, `/nightlife`, `/trips`, `/host/*`, `/admin/event-bookings`, and `/api/copilotkit/[[...path]]`.

This bootstrap file does not define product behavior. Current source code, current tests, current Linear tasks, and the owning skills are authoritative.

## Response style

Lead with the answer. Keep explanations concise, concrete, and tied to MDE. Always pair task numbers with task names.
