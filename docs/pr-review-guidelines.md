# MDE PR Review Guidelines

Use AGENTS.md as the repository-wide engineering contract. Exact-head deterministic CI and human review remain authoritative; PR-Agent is advisory.

## Stack checks

- CopilotKit: verify MDE's installed v2 runtime/React APIs, same-origin /api/copilotkit, AG-UI transport, registered agent identity, thread/run isolation, and Mastra bridge behavior.
- Mastra: verify installed APIs plus RequestContext, tool authority, memory/thread isolation, workflows, HITL, persistence, retries, cancellation, replay safety, and model/provider compatibility.
- Supabase: verify schema, migrations, RLS, grants/revokes, RPC authorization, SECURITY DEFINER/search_path, service-role boundaries, generated types, and User A vs User B denial proof.
- Google Maps / Places: verify key boundaries, current Places API behavior, required field masks, mapId requirements, grounded provider data, coordinates/place IDs, caching, and avoidable billable calls.
- Stripe: when payment code changes, verify server-authoritative state, webhook signatures, idempotency, duplicate delivery/replay, secret boundaries, and test/live separation.
- Next.js: verify server/client boundaries, route/runtime assumptions, auth before privileged reads, user-scoped caching/revalidation, and client secret exposure.

## Finding bar

Publish only a changed-code defect with evidence and a realistic failure path. Every finding must give severity, problem, impact, evidence, failure scenario, smallest safe fix, decisive verification, and expected result. Do not publish style-only or generic "check the docs" comments.
