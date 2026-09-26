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

GitHub's conversation resolution is a single boolean and **cannot** be scoped per author or per app. So *any* unresolved inline review thread blocks the merge: human, high-value bot, or advisory bot alike. Merge cost is therefore governed by **how many inline threads get opened**, not by how many review apps are installed.

### Who may open a blocking inline thread

| Source | Inline threads | Evidence |
| -- | -- | -- |
| Human reviewer | ✅ allowed | An unresolved human finding must keep blocking |
| CodeRabbit | ✅ allowed | 4 of 4 threads on PR #120 resolved into fixes |
| Sourcery | ✅ allowed | Real, security-relevant find on PR #122 (untrimmed `threadId` → 403 bypass) |
| Codacy | ✅ allowed | 3 of 4 threads on PR #120 became real fixes (`error.cause` fallback, `UND_ERR` prefix match, `BROKEN_REFERENCE` default) |
| PR-Agent (`review`) | ❌ summary only | Already summary-only and not a required check |
| Kilo Code Review | ❌ summary only | 3 of 5 findings on PR #120 were factually wrong, stated confidently |

Three of the four review apps have produced fixes that are in `main` today, so this is not "bots are noisy" — the noise is concentrated in one app. Re-derive this table from the next three pull requests; do not assume it still holds.

### Measured baseline

Pre-merge inline threads, read from the GitHub API rather than from memory:

| PR | Sourcery | Codacy | Kilo | CodeRabbit | Inline threads | Replies | Pushes → review waves |
| -- | -- | -- | -- | -- | -- | -- | -- |
| #120 | 2 | 4 | 6 | 4 | **16** | 20 | 3 |
| #122 | 1 | 2 | 0 | 0 | **3** | 3 | 1 |
| total | 3 | 6 | 6 | 4 | **19** | 23 | 4 |

Two corrections to the original audit, both worth keeping:

- PR #122 raised **3** inline threads, not 16.
- The three review passes on PR #120 were **push-triggered re-reviews** (4 commits at 22:42, 22:46, 22:49 and 23:06), not bots re-reviewing an unchanged head. Re-review after a push is correct behaviour, not waste. The real cost driver is ~1 hand-written reply-and-resolve per inline thread.

One Kilo thread on PR #120 arrived **10 seconds after the merge** (23:11:16Z against `mergedAt` 23:11:06Z). It is still unresolved and can never be satisfied by a code change, because its head is already in `main`. Post-merge inline threads are permanent residue.

### Non-decisions — do not "fix" these

- `required_conversation_resolution` **stays enabled**. Disabling it removes the guarantee that an unresolved *human* finding is addressed, and no bot setting can restore that.
- `floor` **stays the required status check**. It is a genuine universal gate, not an advisory one.
- CodeRabbit, Sourcery and Codacy inline findings **stay**. Silencing them would have lost the `error.cause` classification fix and the `threadId` trimming fix that are in this repository's history.

### Operating rules that follow

1. Only the four sources listed as allowed above may open inline threads. A newly installed review app stays summary-only until it has a measured record in this table.
2. An advisory bot finding is never a merge blocker on its own. When a bot finding is wrong, reply once with the disproof and resolve the thread; do not rewrite code to satisfy it.
3. A finding is actionable when it names a changed-code defect with a realistic failure path. A finding that can be neither reproduced nor disproved gets one reply recording that state, then a resolve.
4. Never merge to escape an unresolved thread. That converts an advisory finding into permanent post-merge residue (see the PR #120 case above).
