---
name: nextjs
description: >-
  Use when MDE work touches Next.js App Router, route handlers, React Server/Client Components, layouts, caching/revalidation, async APIs, proxy/middleware, metadata, Vercel or Next.js-specific errors.

---

# Next.js

Own the MDE application framework and its Vercel deployment surface. Resolve the exact installed Next.js version from `package.json`; do not rely on remembered versions.

## Load only what the task needs

| Intent | Read |
|---|---|
| App Router, request APIs, server/client boundaries | `references/app-router.md` |
| Caching, revalidation, user-scoped data | `references/caching.md` |
| React component composition, variants, shared state ownership | `references/composition-patterns.md` |
| React/Next.js waterfalls, bundles, rerenders, rendering performance | `references/react-best-practices.md` + `references/performance.md` for MDE measurement/acceptance |
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
