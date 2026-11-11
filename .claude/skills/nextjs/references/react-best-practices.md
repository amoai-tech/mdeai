# React and Next.js best practices

Use for React/Next.js performance work: waterfalls, bundle size, server work, client data behavior, rerenders, rendering cost, and measured runtime regressions.

This is the curated high-impact subset of Vercel's React best-practices guidance. Keep low-impact micro-optimizations out unless profiling identifies them as relevant.

## Priority order

1. **Eliminate waterfalls** — start independent work early; await late; parallelize only genuinely independent operations.
2. **Control bundle cost** — prefer analyzable direct imports and dynamically load genuinely heavy client-only features. Measure before and after.
3. **Protect the server boundary** — authenticate server actions, minimize RSC serialization, deduplicate request work where appropriate, and avoid mutable request state at module scope.
4. **Avoid unnecessary client state** — derive values during render instead of mirroring them in effects; keep URL/server truth in its canonical owner.
5. **Reduce meaningful rerenders** — subscribe to the narrowest state needed, use functional updates where they stabilize callbacks, and keep interaction logic in event handlers instead of effects.
6. **Stream deliberately** — use Suspense when independent content can progressively render; do not use hydration suppression to hide real server/client mismatches.
7. **Keep non-urgent work non-blocking** — use transitions/deferred rendering only when they improve measured interaction responsiveness.

## Performance workflow

1. Reproduce or measure the problem before changing architecture.
2. Identify the highest-impact category above.
3. Apply the narrowest rule consistent with correctness, authorization, accessibility, and the installed React/Next.js contract.
4. Re-measure the same signal. Do not claim an improvement from code shape alone.

For MDE-specific bundle measurement and the established performance acceptance contract, also read `performance.md`.

## Avoid mechanical optimization

Do not add memoization, caches, providers, dynamic imports, transitions, or client data libraries solely because an upstream rule mentions them. Prefer the simplest implementation until evidence justifies the extra mechanism.

## Source provenance

Adapt/model only; do not copy wholesale:
- https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
- Local source reviewed during consolidation: `vercel-react-best-practices/rules/`
