# Caching and revalidation

Use when work changes fetch caching, React cache behavior, ISR/revalidation, route rendering mode, or user-scoped data freshness.

- Treat caching as observable behavior: define what may be reused, for whom, and for how long.
- Never reuse user- or tenant-scoped data across identities.
- Verify invalidation/revalidation paths with a targeted test or deterministic runtime proof.
- Prefer explicit cache boundaries over forcing an entire route dynamic without evidence.
- When behavior is version-sensitive, resolve it from the installed Next.js version and current official docs.
