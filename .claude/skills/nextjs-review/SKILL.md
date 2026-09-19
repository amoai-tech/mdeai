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

- Never infer the installed Next.js version from remembered or hardcoded prose; resolve it from `package.json`.
- Server-only secrets and privileged clients never cross into client components.
- Authentication/authorization happens before privileged reads or writes.
- Route handlers and proxy/middleware behavior match the installed framework contract represented in trusted context.
- User-scoped data is not cached or revalidated across users.
- Client/server boundaries do not create unintended remounts or state loss.
- Version/API incompatibility is merge-blocking only when the diff or trusted context proves it; otherwise request deterministic verification.
