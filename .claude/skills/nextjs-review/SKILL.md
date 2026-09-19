---
name: nextjs-review
description: Review MDE Next.js App Router changes for server/client, auth, caching, route/runtime, and secret-boundary defects.
---

# Next.js Review

## Source of truth

1. Changed MDE code and tests.
2. Trusted `package.json` for the exact installed Next.js version.
3. Existing MDE App Router patterns and repository contracts.

## Review invariants

- Never infer the installed Next.js version from remembered prose; resolve it from `package.json`.
- When trusted `package.json` shows Next.js 16.x, Async Request APIs are async-only: `cookies()`, `headers()`, and `draftMode()` must be awaited before use, and route/page request APIs such as `params` or `searchParams` must follow the installed async contract. Flag patterns such as `const store = cookies(); store.get(...)`; the compatible form is `const store = await cookies()`.
- Server-only secrets and privileged clients never cross into client components.
- Authentication/authorization happens before privileged reads or writes.
- Route handlers and proxy/middleware behavior match the installed framework contract represented in trusted context. For Next.js 16.x, `src/proxy.ts` with an exported `proxy` function is the current request-boundary convention; do not flag that convention as deprecated middleware without contradictory exact-version evidence.
- User-scoped data is not cached or revalidated across users.
- Client/server boundaries do not create unintended remounts or state loss.
- Version/API incompatibility is merge-blocking only when the diff or trusted context proves it; otherwise request deterministic verification.

For a proven Next.js API mismatch, name the installed-version contract, point to the incompatible line, give the smallest fix, and require `npm run typecheck` plus the narrowest relevant test/build proof.
