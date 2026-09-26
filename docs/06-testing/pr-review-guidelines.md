# MDE PR Review Guidelines

Use AGENTS.md as the repository-wide engineering contract. Exact-head deterministic CI and human review remain authoritative; PR-Agent is advisory.

## Universal review order

1. Outcome — verify the requested user/business result.
2. Truth — use current code/runtime/config evidence, not stale PR prose.
3. Reuse — prefer proven repository/platform/SDK capabilities.
4. Architecture — verify responsibility and source-of-truth ownership.
5. Security — auth, authorization, RLS, tenancy, secrets, privileges.
6. Data integrity — duplicates, races, replay, partial writes, stale state.
7. Failure modes — invalid input, timeout, retry, cancellation, dependency/partial failure.
8. Integration — packages, env names, APIs, RPCs, schemas, webhooks, events.
9. Real workflow — trace the affected end-to-end user/system journey.
10. Proof — verify tests/build/E2E/pgTAP actually exercise the changed behavior.

Inspect surrounding repository contracts when needed, while keeping findings scoped to defects introduced or exposed by the PR. Before `safe_to_merge`, try to falsify the PR's claims through silent skips, false-green tests, wrong exit codes, stale assumptions, missing negative tests, and retry/replay/concurrency failures.

A green test is evidence only if it exercises the changed failure path. For security/RLS/payments/migrations/deployment gates, missing deterministic negative proof is material.

## Stack checks

- CopilotKit: verify MDE's installed runtime/React APIs, same-origin /api/copilotkit, AG-UI transport, registered agent identity, thread/run isolation, and Mastra bridge behavior.
- Mastra: verify installed APIs plus RequestContext, tool authority, memory/thread isolation, workflows, HITL, persistence, retries, cancellation, replay safety, and model/provider compatibility.
- Supabase: verify schema, migrations, RLS, grants/revokes, RPC authorization, SECURITY DEFINER/search_path, service-role boundaries, generated types, and User A vs User B denial proof.
- Google Maps / Places: verify key boundaries, current Places behavior represented in trusted context, required field masks, mapId requirements, grounded provider data, caching, and avoidable billable calls.
- Stripe: when payment code changes, verify server-authoritative state, webhook signatures, idempotency, duplicate delivery/replay, secret boundaries, and test/live separation.
- Next.js: resolve the installed version from trusted package.json; verify server/client boundaries, route/runtime assumptions, auth before privileged reads, user-scoped caching/revalidation, and client secret exposure.
- CI: verify immutable action/container references, least privilege, secret boundaries, trigger/path coverage, shell failure propagation, and exact-head status behavior.

## Finding bar

Publish only a changed-code defect with evidence and a realistic failure path. Every finding must give severity, problem, impact, root cause, evidence, failure scenario, smallest safe fix, decisive test, expected result, and status. Do not publish style-only or generic "check the docs" comments.

## Merge gates

`main` is protected by **one** required status check — `floor` (`.github/workflows/floor.yml`: migration-timestamp uniqueness plus `npm run floor`; no path filters, so it runs on every pull request to `main`) — plus **required conversation resolution**. That pair is deliberate, and its consequence is easy to misread:

```text
required_status_checks.contexts = ["floor"]     one gate, owned by deterministic CI
required_conversation_resolution = enabled      every unresolved review thread also gates
```

GitHub's conversation resolution is a single boolean and **cannot** be scoped per author or per app. So *any* unresolved inline review thread blocks the merge: human, high-value bot, or advisory bot alike. Merge cost is therefore governed by **how many inline threads get opened**, not by how many review apps are installed. A required status check, by contrast, *is* scoped to one app — so a check and a conversation thread are not interchangeable gates, and the difference is the lever this policy uses.

### Which apps earn an inline thread

| Source | Verdict | Measured evidence |
| -- | -- | -- |
| Human reviewer | inline | An unresolved human finding must keep blocking |
| CodeRabbit | inline | 4 of 4 threads on PR #120 resolved into fixes |
| Sourcery | inline | Real, security-relevant find on PR #122 (untrimmed `threadId` → 403 bypass) |
| Codacy | inline | 3 of 4 threads on PR #120 became real fixes (`error.cause` fallback, `UND_ERR` prefix match, `BROKEN_REFERENCE` default) |
| PR-Agent (`review`) | summary only | Already summary-only and not a required check |
| Kilo Code Review | advisory | 3 of 5 **unique** findings on PR #120 were factually wrong (6 threads; one duplicate), stated confidently |

Three of the four review apps produced fixes that are in `main` today, so this is not "bots are noisy" — the noise is concentrated in one app. Re-derive this table from the next three pull requests; do not assume it still holds.

### What can actually be configured

Verified against vendor documentation, not assumed:

| App | In-repo lever | Effect on blocking | Not possible |
| -- | -- | -- | -- |
| Kilo | `REVIEW.md` at the repository root, read from the PR's **base** branch (requires the app's "Use REVIEW.md" toggle) | Shapes severity calibration, files to skip, and verification expectations. Cannot change output formatting or thread behavior. | **There is no summary-only mode and no inline/summary key.** The only dashboard levers are Review Style (`Lenient` = critical issues only) and disabling reviews for the repository. |
| CodeRabbit | `.coderabbit.yaml` → `reviews.profile: quiet` | "Quiet for only the most important feedback" — fewer inline comments | No key moves emitted nitpicks into the summary. `request_changes_workflow: false` (already set) is what stops CodeRabbit submitting a blocking change-request. |
| Sourcery | none documented | — | No `.sourcery.yaml` exists. Dashboard only: Review profile `Quiet` ("only bugs that should block a merge"), or disable "Enable AI review comments" for summary-only output. |
| Codacy | `.codacy.yml` → `exclude_paths`, `engines.*`, `engines.duplication.*`, `languages.*.enabled` | Path and language scoping only | Tools and patterns **cannot** be enabled or disabled from the file, and inline-vs-summary is a UI-only setting. |
| PR-Agent | `.pr_agent.toml` | Already summary-only | — |

The consequence matters: **"make the noisy bot post a summary instead" is not achievable by configuration for Kilo.** Since Kilo cannot be made summary-only, the honest options are to keep it advisory and raise its evidence bar through `REVIEW.md`, or to remove the app. This document uses `REVIEW.md`.

### Prefer required checks over conversation resolution

A required status check **is** scoped to one app; conversation resolution is not. So the durable way to keep security findings blocking while removing nitpick blocking is:

1. Require the check that fails only on real findings — `Sourcery review` fails only "when blocking security findings require changes", which makes it a scopable security gate.
2. Keep nitpick-heavy apps from opening inline threads, or accept the per-thread resolve cost.

The open risk of the first step is a required check that stops reporting (app removed or renamed) blocking every future merge. That is why `floor`, owned by this repository's own workflow, remains the primary gate.

### Measured baseline

Pre-merge inline threads, read from the GitHub API rather than from memory:

| PR | Sourcery | Codacy | Kilo | CodeRabbit | Inline threads | Replies | Pushes → review waves |
| -- | -- | -- | -- | -- | -- | -- | -- |
| #120 | 2 | 4 | 6 | 4 | **16** | 20 | 3 |
| #122 | 1 | 2 | 0 | 0 | **3** | 3 | 1 |
| total | 3 | 6 | 6 | 4 | **19** | 23 | 4 |

Two corrections to the original audit, both worth keeping:

- PR #122 raised **3** inline threads, not 16.
- The three review passes on PR #120 were **push-triggered re-reviews** (4 commits at 22:42, 22:46, 22:49 and 23:06), not bots re-reviewing an unchanged head. Re-review after a push is correct behavior, not waste. The real cost driver is ~1 hand-written reply-and-resolve per inline thread.

One Kilo thread on PR #120 arrived **10 seconds after the merge** (23:11:16Z against `mergedAt` 23:11:06Z). It is still unresolved and can never be satisfied by a code change, because its head is already in `main`. Post-merge inline threads are permanent residue.

### Non-decisions — do not "fix" these

- `required_conversation_resolution` **stays enabled**. Disabling it removes the guarantee that an unresolved *human* finding is addressed, and no bot setting can restore that.
- `floor` **stays the required status check**. It is a genuine universal gate, not an advisory one.
- CodeRabbit, Sourcery and Codacy inline findings **stay**. Silencing them would have lost the `error.cause` classification fix and the `threadId` trimming fix that are in this repository's history.
- `required_approving_review_count` is **1**, applied through the GitHub API — branch protection is not a repository file. Its real effect was **measured, not assumed** (PR #124), and the consequences are easier to read as a list:
  - **It is binding.** The pull request showed `reviewDecision: REVIEW_REQUIRED` and `mergeStateStatus: BLOCKED` before any review arrived.
  - **A bot approval satisfies it.** `sourcery-ai[bot]` submitted the `APPROVED` review that decided the merge. The only human collaborator is the author, who cannot approve their own pull request, so this does **not** guarantee that a human read the change.
  - **Disabling Sourcery's approvals would not strengthen it.** It removes the only approval an ordinary merge can obtain, leaving admin bypass as the sole route — and `enforce_admins: false` means the admin can bypass, so the gate degrades instead of blocking.
  - **`require_code_owner_reviews` would not strengthen it either.** GitHub's documentation applies it only to "code with a code owner", and this repository has no `CODEOWNERS` file, so it is a no-op here.
  - **A second human collaborator is the only configuration that produces a genuine human review gate.**

### Operating rules that follow

1. The sources listed as inline above are the ones allowed to open blocking inline threads. Kilo cannot currently be configured to stop opening them — its only in-repo lever is `REVIEW.md` — so treat a Kilo thread as advisory: answer it on the evidence, then resolve it. A newly installed review app starts summary-only until it has a measured record here.
2. An advisory bot finding is not an approval or status-check gate, but its unresolved inline thread still blocks an ordinary merge while conversation resolution is enabled. When a bot finding is wrong, reply once with the disproof and resolve the thread; do not rewrite code to satisfy it.
3. A finding is actionable when it names a changed-code defect with a realistic failure path. A finding that can be neither reproduced nor disproved gets one reply recording that state, then a resolve.
4. Never merge to escape an unresolved thread. That converts an advisory finding into permanent post-merge residue (see the PR #120 case above).
