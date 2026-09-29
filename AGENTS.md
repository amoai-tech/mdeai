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

## Skill routing

Use the narrowest owner directly. When ownership is ambiguous, use `using-mde-skills` to choose exactly one canonical execution owner and then stop routing:

Known domain beats generic workflow.

If the request clearly names or belongs to a canonical domain skill, route directly to that domain even when the request contains words such as bug, broken, failing, error, debug, or troubleshoot.

Use `systematic-debugging` only when the responsible domain/root cause is genuinely unknown.

- Simple domain/stack work → relevant specialist skill.
- Reuse-before-build and the source receipt, for any task that would write code → `ponytail` (runs *before* implementation ownership; it does not replace the domain owner).
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

## Ponytail — reuse before build

Canonical owner: `ponytail`. This section is the obligation; load the skill for the ladder in full,
the worked example, and `references/source-map.md` — the authoritative source to check per area.

**Every task opens with one written line** answering *is there a faster, smaller, or better-supported
way to do this than building it?* Name the rung you stopped at:

1. Does this need to be built at all?
2. Does the repo already have it? Reuse the helper, util, or pattern.
3. Does the standard library do it?
4. Does a native platform feature cover it?
5. Does an already-installed dependency solve it?
6. Can it be one line?
7. Only then: write the minimum that works.

Climb **after** understanding the problem: read the task and the code it touches, trace the real flow,
then pick a rung. A small diff in the wrong place is a second bug, not efficiency. Prefer the
dashboard, the CLI, and prebuilt modules to authoring equivalents — check the platform's own
primitives and `package.json` before writing anything new.

**Not lazy about:** understanding the problem first, input validation at trust boundaries, error
handling that prevents data loss, security, accessibility, and anything explicitly requested. Never
trade these for a smaller diff.

**Root cause, not symptom.** A report names a symptom. Grep every caller of the function you touch
and fix the shared function once; patching only the path in the ticket leaves sibling callers broken.

**Non-trivial logic leaves one runnable check behind** — the smallest thing that fails if the logic
breaks. Trivial one-liners need none. Mark a deliberate ceiling with a `ponytail:` comment naming the
ceiling and its upgrade path.

### Source receipts — every external reference has an implementation step

Reading a doc is not reusing it. Every external source you consult **and act on** produces one row,
in the PR body or the task evidence. A source with no row did not influence the work and must not be
cited as its justification.

| Field | Required |
| -- | -- |
| **URL** | The full URL — not a domain, not "the docs" |
| **Source** | The exact file, section, symbol, or example inside it |
| **Disposition** | `COPY` · `ADAPT` · `MODEL` · `REFERENCE ONLY` |
| **Destination** | The exact path in this repo where it lands (`—` for `REFERENCE ONLY`) |
| **Verification** | The exact command or test that proves the result |

`COPY` = verbatim, keeps its attribution, takes no local edits. `ADAPT` = same approach in our
conventions; say what changed. `MODEL` = follow the shape, write our own; say what diverged.
`REFERENCE ONLY` = ships nothing, so it **requires a stated reason and the alternative you
rejected** — left unexplained, it is the escape hatch that makes this whole rule decorative.

Prefer the installed version (`node_modules/`), the library's own repository, examples, and official
docs over tutorials and recall, and cite the primary source rather than the blog that led you to it.

### Verify what the decision depends on

Confirm every claim the decision rests on — versions, API shapes, config keys, security behavior,
production impact — against a primary source: official docs, the library's own source, or the live
system. Never assert these from memory, and never round an unverified claim up to a fact. State what
you checked and what you could not. "Verified" means confirmed against that source, at that version,
on that date — not that the change is guaranteed defect-free.

## Shared invariants

Do not duplicate detailed operating rules here when a canonical skill owns them. Load the relevant skill and follow its current instructions.

- Git/worktree safety and execution sequencing → `tasks`.
- Reuse-before-build ladder, source receipts, root-cause discipline → `ponytail`.
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
- PR title/body standard (real-world description, diagrams, pre/post-merge evidence, per-URL instructions) → `tasks`.
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

## CI checks

`floor` is the only required status check on `main`, so it is the only check that gates a merge. It runs on every pull request regardless of base branch, because a stacked PR based on another feature branch is still a PR that needs the same proof.

Codacy Static Code Analysis is **advisory, deliberately**. Its findings on this repository are dominated by heuristics that do not hold here: it reads the 64-character sha256 tree hashes in `upstream.yaml` as hard-coded credentials, rejects `#2-entry-in-rationalization-table`-style fragments that GitHub's own slug rules accept, reports every `path.join` in a test file as dynamic path construction, and flags deliberate absolutes in this file's own prose as "absolute rule without escape hatch". Making it required would block merges on those false positives rather than on defects. A `mergeStateStatus` of `UNSTABLE` caused by Codacy is therefore expected and is not a reason to hold a merge; a real Codacy finding is worth reading on its merits, and a `fail` from Codacy alone never blocks a merge — only `floor` does.

## Pull requests

A PR body is the durable record of a change, and it is written for a reviewer who has not read the task. State it so the body stands alone after the branch is deleted.

**Title** — real-world and plain. Say what changes for a person, not the internal mechanism.

- ✅ `Stop an unreviewed database migration from reaching production`
- 🚫 `SAN-1283: add preflight script, refactor helper`

**Body — required sections, in this order.** Keep each one short; a reviewer reads the "Important" box and the diagrams first.

| Section | What belongs in it |
| -- | -- |
| **What this changes** | Two or three sentences a non-author understands. Lead with the real-world consequence, not the implementation. |
| **Why now** | The incident, ticket, measurement, or review finding that motivated it. Link it: `SAN-xxxx`, issue, or PR. |
| **Workflows / user journey** | Who is affected — end user, operator, CI, or agent — and the journey before → after. Name the journey explicitly; "no user-visible change" is a valid answer when it is true. |
| **Diagrams** | Mermaid, and it must render. At minimum a `flowchart` of the journey. Add a `sequenceDiagram` when more than one party is involved and a `graph` when the change alters architecture or dependencies. |
| **Tech stack touched** | Languages, frameworks, services, and versions the change depends on, including anything pinned. |
| **Important** | The one to three things a reviewer must not miss. Separate "this is the point" from "this is the risk". If everything is important, nothing is. |
| **Pre-merge checklist** | Each check with its **exact command** and **current result**. Production-ready success criteria stated as observable facts, not adjectives. |
| **Post-merge actions** | What must happen or be run after merge — migrations, env vars, backfills, dashboards, follow-ups — each with the action that verifies it. Write "none" when there are none. |
| **Reference URLs** | Every source used, each with an instruction (format below). |
| **Skills / MCP used** | Which repository skills and MCP servers informed the work, so the reasoning can be reproduced. |

**Reference URLs are instructions, not a reading list.** One row per source, no bare links:

| URL | What to read there | What to do with it |
| -- | -- | -- |
| The full URL | The exact file, section, symbol, or example | `COPY` / `ADAPT` / `MODEL` / `REFERENCE ONLY` **plus the instruction** — "mirror this filename rule", "take this field-mask list", "follow this retry shape" |

Same disposition vocabulary as the source receipt above; a PR body is the natural place to keep it.

**Success criteria are observable or they are not criteria.** "Works correctly" and "tested" fail this. "`supabase db push --dry-run` on `main` lists exactly the one approved migration" passes it.

Never write a body that only restates the diff — the diff is already in the PR. The body is the part a machine cannot generate.

## Merge approval

`main` also requires one approving review. Treat that as a real gate rather than a formality: every other condition on the merge path is checked by a machine, so the approval is the only step that asks whether the change should exist at all.

An administrator merge can bypass it. When that happens, the bypass is part of the change's history and has to be written down, not left to be inferred from `mergeStateStatus`:

- **#140** and **#143**, both merged 2026-09-28 with an administrator override.
- **Why:** they were the upper layers of a stacked sequence, so the layer below blocked review of everything above it; every automated check that could run (`floor`, `deterministic chromium`, `review`, `Vercel`) was already green, and neither PR touched runtime application code — they changed skills, CI checks, and documentation.
- **What the reviewer would have been asked to check:** whether the skill and gate changes were worth landing at all, and whether the deferred finding in #140 (eval packs with no `expectations`, tracked as **SAN-1365**) should block the merge. The second question is still open, which is why that review thread was left unresolved rather than closed.

That is a recorded reason, not a precedent. A production PR — anything that changes application behavior, a database, or a deploy — should satisfy the approval requirement normally; a bypass is defensible only for a non-runtime change whose reason is written down here.

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
