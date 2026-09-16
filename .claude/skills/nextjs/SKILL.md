---
name: nextjs
description: >-
  Use when MDE work changes Next.js App Router pages, layouts, route handlers, server/client boundaries, caching, metadata, middleware, or Next.js build/runtime behavior.
---

# Next.js

Own Next.js framework behavior for the MDE application. Current installed version is Next.js 16.2.6.

## Source order

1. Inspect the installed version, existing app pattern, and relevant source file.
2. Use current official Next.js documentation for version-sensitive APIs.
3. Prefer established MDE patterns over introducing a second framework convention.

## MDE invariants

- Keep server-only secrets and privileged clients out of client components.
- Make `use client` boundaries intentional and as narrow as practical.
- Route handlers must authenticate/authorize before privileged writes.
- Treat caching/revalidation as observable behavior, not an implementation detail.
- Do not add middleware, rewrites, or dynamic rendering merely to work around an unrelated bug.

## Workflow

1. Classify the change: page/layout, route handler, rendering boundary, cache, build, or deployment behavior.
2. Inspect the nearest working pattern in `src/app`.
3. Verify version-sensitive framework behavior.
4. Make the smallest change and run targeted type/lint/test/build proof as appropriate.

## Handoff

Use domain skills for product behavior, `supabase` for data authorization, `mde-vercel` only for Vercel-specific deployment behavior, and `systematic-debugging` when root cause is unknown.
