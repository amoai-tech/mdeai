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
