# Next.js review invariants

Use this with `code-review` when a diff touches Next.js or Vercel application behavior.

## Source of truth

1. Changed code and tests.
2. Trusted `package.json` for the exact installed Next.js version.
3. Existing MDE App Router patterns and repository contracts.
4. Current official Next.js/Vercel docs for version-sensitive claims.

## Invariants

- Never infer the installed version from remembered prose.
- For Next.js 16.x, Async Request APIs are async-only: await `cookies()`, `headers()`, and `draftMode()` before use; follow the installed async contract for `params` and `searchParams`.
- Flag `const store = cookies(); store.get(...)`; the compatible shape is `const store = await cookies()`.
- Keep server-only secrets and privileged clients out of Client Components.
- Authenticate and authorize before privileged reads or writes.
- For Next.js 16.x, `src/proxy.ts` with an exported `proxy` function is the current MDE request-boundary convention; do not call it deprecated without contradictory exact-version evidence.
- Never cache or revalidate user-scoped data across users.
- Check server/client boundaries for unintended remounts or state loss.
- Treat an API/version mismatch as merge-blocking only when the diff or trusted exact-version evidence proves it.

For a proven mismatch, name the installed-version contract, point to the incompatible line, give the smallest fix, and require `npm run typecheck` plus the narrowest relevant test/build proof.
