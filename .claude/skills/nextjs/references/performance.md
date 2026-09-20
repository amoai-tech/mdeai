# React and Next.js performance

Use for RSC/streaming, data-fetching waterfalls, bundle size, ISR/revalidation performance, rendering performance, and Core Web Vitals work.

## Priority order

1. **Eliminate waterfalls** — start independent work early and await as late as practical; use parallel fetching where dependencies allow.
2. **Reduce bundle cost** — avoid broad barrel imports, use analyzable import paths, and dynamically load genuinely heavy client-only features.
3. **Protect server performance** — authenticate server actions, minimize data serialized to clients, deduplicate per-request work, and avoid mutable request state at module scope.
4. **Control client re-renders** — derive state instead of mirroring it, keep dependencies stable, and move interaction work into event handlers when appropriate.
5. **Improve rendering** — use Suspense/streaming where it improves progressive delivery; avoid hydration workarounds that hide real mismatches.

## Bundle Size Optimization

Treat bundle changes as measurable: capture the relevant build/analyzer evidence before and after. Prefer a narrow import or boundary fix over framework-wide configuration changes.

Do not apply a performance rule mechanically when it conflicts with correctness, authorization, accessibility, or the installed React/Next.js contract.
