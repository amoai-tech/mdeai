# Kilo Review Instructions

Repository: `amoai-tech/mdeai` — Next.js 16 / React 19 / CopilotKit / Mastra / Supabase.

Review **only** defects introduced or exposed by this pull request. Verify claims against the
checked-out repository and the dependency versions actually installed; never review from memory.

## Evidence bar for an inline comment

Post an inline comment only when **all four** are true:

1. You name the changed line and the concrete defect in it.
2. You give the smallest realistic trigger sequence.
3. You can cite repository evidence — code, test, config, a real workflow run, or the vendor's
   official documentation — that proves the claim for the version resolved in this repository.
4. The failure would actually affect a user, a security or tenancy boundary, data integrity, cost,
   or CI correctness.

If (3) fails, do not post the finding. Staying silent is correct. An unverified assertion costs a
maintainer a hand-written refutation, and an inline thread blocks the merge until it is resolved.

## Do not post

- Style, formatting, naming, or preference comments.
- "Consider adding a test" without naming the specific failing path that is currently unproven.
- Restatements of what the diff already does.
- Speculation about runtime behaviour the diff does not exercise.
- Claims about framework, library, GitHub Actions, or provider semantics recalled from memory.
- Duplicate findings already raised on an earlier revision of this pull request.

## Platform and CI claims need a citation

GitHub Actions semantics, workflow `if:` expressions and status-check functions, branch-protection
behaviour, and provider API contracts are frequently miscited. Before asserting any such behaviour,
cite either this repository's own workflow files plus a real run, or the vendor's official
documentation. If you cannot cite one, keep the point out of your findings entirely.

## Repository invariants you must respect

- Supabase: new tables require RLS plus an explicit authorization policy. A user-scoped client must
  not be replaced by the service-role client outside a documented boundary.
- Never treat a browser-supplied user, tenant, thread, run, payment, place, or resource identifier
  as authorization on its own.
- CopilotKit stays on the v2 API surface; do not mix bare v1 imports with `/v2` imports.
- Production AI uses Gemini. Do not propose model or provider changes.
- Secrets and service-role credentials never reach client code.

## Fix proposals

Propose the smallest change that fixes the defect you proved. Do not bundle unrelated refactors,
dependency bumps, or renames. State the deterministic test that would prove the fix.

Review policy, including which review apps may open blocking inline threads in this repository,
lives in `docs/06-testing/pr-review-guidelines.md`.
