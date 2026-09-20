---
name: nextjs
description: >-
  Own MDE Next.js and Vercel application-platform work. Use this skill whenever a task changes or diagnoses Next.js App Router pages, layouts, route handlers, Server/Client Component boundaries, Async Request APIs, caching/revalidation, metadata, proxy/middleware behavior, RSC/streaming, bundle or Core Web Vitals performance, or Vercel preview/production deployment, environment, domain, rollback, or runtime configuration. For PR/diff review, root-cause debugging, test strategy, or final production-readiness proof, keep the workflow owner (`code-review`, `systematic-debugging`, `testing`, or `task-verifier`) and load the relevant Next.js reference from this skill.
---

# Next.js

Own the MDE application framework and its Vercel deployment surface. Resolve the exact installed Next.js version from `package.json`; do not rely on remembered versions.

## Load only what the task needs

| Intent | Read |
|---|---|
| App Router, request APIs, server/client boundaries | `references/app-router.md` |
| Caching, revalidation, user-scoped data | `references/caching.md` |
| React/Next.js performance, bundles, RSC, streaming | `references/performance.md` |
| Vercel preview/production, env, domains, rollback | `references/vercel.md` |
| Reviewing a Next.js/Vercel diff | `references/review.md` with `code-review` |

## Core workflow

1. Inspect `package.json`, the changed files, and the nearest working MDE pattern.
2. Classify the work and load only the matching reference above.
3. Verify version-sensitive behavior against current official Next.js/Vercel documentation when needed.
4. Make the smallest coherent change and use `testing` for the cheapest reliable proof.

## Boundaries

- Use `supabase` for authorization and database policy.
- Use `systematic-debugging` when the failing subsystem is unknown.
- Use `code-review` for an existing PR/diff; this skill supplies domain invariants, not the review workflow.
- Use `task-verifier` for exact-head merge safety or production Done proof.
