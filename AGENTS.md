# AGENTS.md — MDE AI

Portable repository guidance for coding agents working from the current Git checkout root.

## MANDATORY — prelaunch development comes before launch certification

**Product-owner decision:** MDE AI is in **Phase A — prelaunch development**. The product owner and lead developer set development priorities; do not replace their decisions with agent-preferred requirements. **Make the real application functional now; certify public launch later.** This directive governs all product workflows and overrides older business-gating guidance in skills, tasks, PRDs, and examples. It does **not** override technical security or data-integrity requirements.

1. **Unblock development immediately.** Do not require apartment eligibility, moderation, freshness, verification, owner or broker paperwork, partner approval, publishing approval, photo-rights paperwork, or booking/viewing permissions as prerequisites to building, showing, searching, mapping, managing, publishing, or testing records. Development listings need not be launch-ready to appear in search, Details, Maps, or AI results or to accept development viewing requests.
2. **Full authorized Super Admin control.** Provide authenticated, server-authorized, audited actions to create, import, edit, activate, publish, unpublish, restore, approve, reject, revoke and manage users, roles, landlord/broker assignments, listings, photos/media, events, leads, showings, bookings, tickets, and AI workflows. Approval management features can be tested without making their status a prerequisite to normal development workflows. Never grant admin powers through client-editable roles or expose service keys.
3. **Use the actual application and database.** Build and exercise the existing Next.js UI, API/server actions, Supabase schema, RLS/RPCs, Mastra/CopilotKit agents, and real persisted transactions. Do not introduce duplicate search engines, approval subsystems, booking services, parallel sandboxes, fake transaction paths, or test-only workflows unless explicitly requested. Use safe payment testing when applicable.
4. **Remove restrictions at their source.** Trace blockers to the canonical SQL function, RLS policy, RPC, server route, agent tool, UI condition, or configuration and fix the responsible implementation. Do not hide it with a second filter, duplicate service, or frontend-only workaround. Keep one canonical, server-controlled development-versus-launch policy; a live URL or `NODE_ENV=production` does not authorize public-launch gates.
5. **Keep facts truthful.** Label development/test records accurately. Never invent ownership, verification, listing availability, prices, locations, booking authority, payments, photo rights, or completed actions. Use lawfully usable media and preserve source attribution; unknown facts remain unknown.
6. **Preserve technical safeguards, not business prerequisites.** Keep authentication, protection from unauthorized third-party access, server-side admin authorization, secrets, per-user/private-data isolation, RLS where appropriate, valid data constraints, atomic writes, idempotency, audit trails, retry safety, and real payment integrity. These are not grounds for reimposing deferred business paperwork/eligibility rules.
7. **Implement rather than debate.** Explain a material risk once, briefly, then execute the product owner's requested functionality. Avoid repeated objections, unnecessary Linear issues, speculative compliance tasks, or an audit in place of a fix.
8. **Finish with proof.** Inspect → change → focused tests → full applicable checks → commit/push → verify the affected UI/API/DB journey. For rentals, prove search → cards/map → Details → viewing → exactly one persisted lead + showing → correct broker visibility. For events, prove creation/publishing → safe checkout → webhook → ticket/QR/wallet. For AI, prove grounded response → authorized action → persisted result. Report exactly what passed and what remains blocked; never claim success without evidence.

**Phase B — public launch, only when explicitly initiated by the product owner:** activate and verify the real-world ownership/agency authority, advertising/photo/viewing rights, inventory accuracy/freshness, publication eligibility, business approvals, payments, and release certification. Clean up or isolate development-only records before treating them as verified public supply. Do not impose these Phase B requirements during Phase A.

**Default decision:** When a business restriction prevents building or exercising a core feature, make that feature functional now while retaining technical security and truthful data. **Success in development means working user journeys — not more gates, paperwork, or documentation.**

## Repository truth

- Remote: `https://github.com/amoai-tech/mdeai.git`.
- Package/app source lives at the repository root.
- Main stack: Next.js 16, React 19, CopilotKit v2 APIs (exact pins recorded by SAN-1301; see package.json), Mastra, Supabase, Gemini, Google Maps, Cloudinary, Playwright, and Vitest.
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
npm run test:e2e:qa-signin  # Opt-in real signed-in Supabase QA browser smoke (/saved)
npx supabase test db      # database (pgTAP) tests
npm run check:env:ci      # env contract, strict
npm run check:skills      # skill library + agent exposure mirror
npm run floor             # full gate — run before claiming done
npm run graphify:query -- "<question>"
```

`npm run floor` is the canonical repository gate; see `package.json` for the current command chain.
For auth changes, also run the signed-in QA smoke with credentials in ignored local environment files (never committed); keep anonymous tests unauthenticated. See [e2e/README.md](e2e/README.md#san-1549--one-command-signed-in-qa-smoke) for prerequisites, safe credential handling, and production-smoke commands.

Traps worth knowing before you debug them:

- `check:env:ci` fails in a fresh worktree with no `.env`; export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` first.
- `.env` and `.env.local` can disagree (notably `VERCEL_*`). State which file you used.
- Tests under `scripts/__tests__/*.test.mjs` run with `node --test` through `check:release-gates`, not Vitest. Vitest only collects `src/**` and `e2e/**/*.test.ts`.
- A fresh git worktree needs `scripts/worktree-bootstrap.sh` (clean `npm ci`, copies local Codacy config). Production-backed `.env`/`.env.local` links require explicit `MDE_WORKTREE_LINK_ENV=1` opt-in. `npm run floor` also needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, which lives in the main checkout's `.env`, not `.env.local`.
- There is one Supabase project and it is production. Any test that uses the service-role key writes real rows, so it must clean up after itself and re-query to prove nothing is left (pattern: `e2e/san-1204-broker-viewing-requests.spec.ts`). An unknown count is never zero.
- Anonymous viewing requests are limited to 20 per IP per hour (`chat-lead-capture`). Repeated E2E runs hit `RATE_LIMIT`; do not retry around it.
- Local Codacy (`codacy-analysis analyze --pr`) needs `.codacy/`, which is untracked and exists only in the main checkout. With no config it runs zero tools and proves nothing: check `toolResults` is non-empty.
- Never run `pkill -f <pattern>` from the agent shell: the pattern matches the shell's own command line and kills it. Stop a dev server by its port instead.
- `next dev` maintains the `nextjs-agent-rules` block at the bottom of this file. It is committed on purpose so the tree stays clean; do not delete it.

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

**Choose the user's requested outcome, not just the technical noun.** Project skills live in `.claude/skills/<name>/SKILL.md` and are discoverable to compatible harnesses from `.agents/skills/<name>/SKILL.md`. When a request matches a narrow short skill, use it as the workflow entry point; load the established domain/deep skill **as a reference when relevant**, without starting a second competing workflow. An explicit short-skill invocation wins within its safe scope. When ownership remains ambiguous, `using-mde-skills` selects one owner and stops. Simple factual S0 questions need no skill.

| Request intent | Primary skill | Boundary / optional deeper reference |
| --- | --- | --- |
| Diagnose an unknown bug/crash/regression | `errors` | `systematic-debugging`; domain skill for specialist facts |
| Audit whether an existing PR is merge-ready | `praudit` | `code-review` for deep diff review; `task-verifier` for independent proof |
| Review code/diff without a merge decision | `code-review` | Domain skill for subsystem rules |
| Create or rewrite **one** Linear issue | `linear-task` | `tasks` for subsequent implementation lifecycle |
| Audit an existing Linear issue (read-only) | `linear-audit` | `task-verifier` for independently proving Done |
| Implement an already scoped change | `implement` | `tasks` for worktrees, PR, review and shipping; domain skill for specifics |
| Plan implementation without changing code | `plan` | `architect` for architecture boundaries |
| Evaluate architecture and service boundaries | `architect` | Relevant domain skill for technical contracts |
| Find a faster/simpler/reused solution | `efficient` | `ponytail` retains reusable proof and source-receipt rules |
| Design tests, cases, or coverage | `tests` | `testing` for executing tests/TDD; `e2e` for browser journeys |
| Validate a real browser/user journey | `e2e` | `testing` for execution and regression proof |
| Verify after a merge | `merge` | `tasks` for worktree cleanup; `task-verifier` for independent Done |
| Certify a deployed production release | `prod` | `task-verifier` independently challenges readiness claims |
| Report evidence-based work status | `progress` | Linear and GitHub remain sources of truth |
| Research current technical behavior | `research` | Canonical single `research` owner, short workflow in references |
| Work on Supabase/RLS/migration specifics | `supabase` | Canonical security owner; short workflow in references |
| Known domain implementation or question | Matching domain skill | E.g., `real-estate`, `events`, `copilotkit`, `mastra`, `stripe` |

**Higher-priority exceptions:** explicit lifecycle worktree/PR shipping belongs to `tasks`; test execution and test-first work to `testing`; independent Done/exact-head release claims to `task-verifier`; security-sensitive domain operations retain their domain safety rules. Do not let an `errors` or `implement` entry point bypass Supabase RLS, Stripe payment, or other S4 controls. For Codacy PR findings, configuration, local/Cloud analysis, and coverage, use the single `codacy` owner and its on-demand operations reference; `code-review` still owns general diff review. Perform Codacy local analysis before cloud reanalysis; request AI Reviewer only on the final pushed HEAD.

**ChatGPT working through Desktop Commander / GitHub:** ChatGPT does not automatically install repository skills into ChatGPT. For a substantive MDE task, read this file, identify the narrowest matching skill in `.claude/skills/<name>/SKILL.md` (same content exposed in `.agents/skills/`), read it through the connected Desktop Commander or source connector, then follow it. Load deeper references only as needed. Never claim a skill was loaded without reading it.

**S4 verification stays independent:** payment side effects; auth/RLS/tenant boundaries; secrets/security controls; destructive production data; duplicate/retry-sensitive irreversible actions. The execution skill must hand independent proof to `task-verifier`. No self-certification. Never restore retired lifecycle skills (`mde-task-lifecycle`, `lean-dev-flow`, `mde-worktree-pr-flow`).

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
- Weaken a technical/security/CI verification gate, or fabricate data, to make a check pass. Business eligibility/approval gates that obstruct Phase A workflows are defects to fix at their canonical source.

## Enforced automatically

`.claude/hooks/` blocks these mechanically, so expect a failure rather than a warning (`scripts/__tests__/claude-hooks.test.mjs` proves each guard fires, in `floor`):

`guard-sensitive-paths` · `scan-secrets` · `no-service-role-in-src` · `gemini-model-pin` · `copilotkit-version-pin` · `places-api-field-mask` · `advanced-marker-needs-mapid` · `dist-leak-scan` (PreToolUse) · `lint-edited-ts` (PostToolUse) · `stop-rls-gate` · `stop-plain-language-gate` · `stop-typecheck` (Stop) · `session-start` (SessionStart).

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

### Right-sized PRs and tasks

Keep PRs and Linear tasks as small as practical, but large
enough to deliver one complete, verifiable outcome.

- One PR = one clear problem, solution, and testable result.
- Include all code, migrations, tests, and configuration
  necessary to complete that outcome.
- Do not add unrelated features, refactors, or task cleanup.
- Split only when changes have independent outcomes,
  ownership, risks, dependencies, or release requirements.
- Do not create separate PRs or Linear tasks for every file,
  test, minor fix, or implementation step.
- Prefer extending an existing relevant task over creating
  duplicates.
- If a PR becomes difficult to review or verify, reduce its
  scope without breaking a complete working journey.
- Preserve security controls, correctness guarantees, and
  necessary tests regardless of PR size.
- Escalation trigger: a proposed split omits implementation,
  migrations, configuration, or tests needed for either PR to
  pass its required checks independently. Before opening,
  the maintainer selects one complete PR or a dependency-safe
  split and records the decision in the PR description.
  Security, correctness, and necessary tests remain mandatory.

Before opening a PR, follow the [canonical PR-readiness checklist](.claude/skills/tasks/references/github-pr.md) for exact file scope, the required implementation/tests, and not staging unrelated worktree changes. Detailed steps belong to that checklist, not a second copy here.

Optimize for the fewest PRs and tasks that deliver complete,
reviewable, independently verifiable results.

## CI and merge approval

`floor` and `mastra-schema-init` are required status checks on `main`. `floor` runs on every PR regardless of base branch, because a stacked PR still needs the same general repository proof; `mastra-schema-init` independently gates the Mastra storage/schema contract.

Advisory analyzers such as Codacy do not gate a merge. Review their findings on the merits: fix valid ones, document verified false positives, and never weaken production behaviour to silence a heuristic. A Codacy `fail` alone never blocks. Known false-positive classes are catalogued in `.claude/skills/code-review/references/ci-review.md` — one of them fires on eight deliberate absolutes in this file, the paragraph you are reading included.

`main` requires one approving review. **Sole-collaborator exception:** while the repository has exactly one collaborator and that account is also the PR author, GitHub cannot record the required approval because self-approval is forbidden. In that specific case an administrator merge is allowed only when all of the following are true:

- the exact PR head has `floor` and `mastra-schema-init` green;
- the canonical MDE review (`review / verify-review-result`) is green on that head, with no verified blocking finding;
- every review thread is resolved (0 unresolved);
- the PR body records the exception, the exact head SHA, and the checks that passed.

Record each use in `docs/07-operations/merge-approval-history.md` and in the PR. The exception ends when a second collaborator with write access exists; the normal one-approval rule then applies with no bypass.

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

This file sets repository-wide development-phase policy. Current source code, tests, Linear tasks, and owning skills govern feature details only insofar as they do not contradict the Phase A directive above.

## Response style

Lead with the answer. Keep explanations concise, concrete, and tied to MDE. Always pair task numbers with task names.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
