# Next.js Skill Consolidation Design

## Goal

Consolidate `nextjs`, `nextjs-review`, and `mde-vercel` into one canonical `nextjs` domain skill while preserving workflow ownership in `code-review`, `systematic-debugging`, `testing`, and `task-verifier`.

## Why

The current skill graph has three overlapping owners for Next.js/Vercel work:

- `nextjs` owns App Router and framework behavior.
- `nextjs-review` duplicates Next.js-specific review invariants.
- `mde-vercel` mixes deployment operations with React/Next.js performance guidance.

This creates trigger competition and duplicates framework knowledge that should be loaded progressively from one domain owner.

## Target structure

```text
.claude/skills/nextjs/
├── SKILL.md
├── references/
│   ├── review.md
│   ├── vercel.md
│   ├── performance.md
│   ├── app-router.md
│   └── caching.md
└── evals/
    └── evals.json
```

## Ownership rules

| Intent | Canonical owner | Supporting reference / skill |
|---|---|---|
| Next.js feature or framework change | `nextjs` | relevant `nextjs/references/*` |
| App Router / server-client boundaries | `nextjs` | `references/app-router.md` |
| Caching / RSC / streaming / ISR | `nextjs` | `references/caching.md` or `performance.md` |
| Vercel deployment / env / domain / rollback | `nextjs` | `references/vercel.md` |
| Review an existing Next.js PR/diff | `code-review` | `nextjs/references/review.md` |
| Unknown Next.js failure | `systematic-debugging` | hand off to `nextjs` after isolation |
| Test strategy / regression proof | `testing` | Next.js references as needed |
| Done / merge / production proof | `task-verifier` | exact-head and deployment evidence |

## Content preservation

Move `nextjs-review/SKILL.md` review invariants into `nextjs/references/review.md`, preserving exact-version verification, async request APIs, `src/proxy.ts`, auth/secret boundaries, user-scoped cache safety, remount/state-loss checks, and deterministic proof requirements.

Move Vercel deployment guidance from `mde-vercel` into `nextjs/references/vercel.md`, preserving preview/production deploys, rollback, environment variables, domains, `vercel.json`, `.vercelignore`, and deployment troubleshooting.

Move React/Next.js performance guidance from `mde-vercel` into `nextjs/references/performance.md`, preserving Server Components, data-fetching patterns, bundle optimization, caching, ISR, streaming, and Core Web Vitals.

## Routing changes

Retire top-level owners `nextjs-review` and `mde-vercel`. Add both names to the retired-owner contract so they cannot silently return.

Canonical routing examples:

- `Deploy the Next.js app to Vercel` → `nextjs`
- `Fix Next.js cache behavior` → `nextjs`
- `Review this Next.js PR` → `code-review`
- `Why is the Next.js production build failing?` → `systematic-debugging`
- `Verify this Next.js deployment is production ready` → `task-verifier`

## Required repository updates

Update `.claude/skills/using-mde-skills` routing/evals, `.claude/skills/INDEX.md`, `index-skills.md`, session/bootstrap guidance, PR-Agent specialist selection/contracts, and `.agents/skills` compatibility links. Remove stale references to the retired owners.

## Verification

The implementation must prove:

1. `nextjs-review` and `mde-vercel` top-level skills no longer exist.
2. Their useful content exists under `nextjs/references/`.
3. Routing collision/retired-owner evals pass.
4. PR review still routes through `code-review` while loading Next.js review guidance when relevant.
5. Vercel deployment prompts route to `nextjs`.
6. `.agents/skills` contains only valid compatibility symlinks.
7. session-start, lint, typecheck, full Vitest, and `git diff --check` pass.

## Non-goals

- Do not change product runtime code, dependencies, Vercel configuration, or deployment behavior.
- Do not merge workflow skills (`code-review`, `systematic-debugging`, `testing`, `task-verifier`) into `nextjs`.
- Do not hardcode a remembered Next.js version; resolve it from current `package.json` when executing framework-sensitive guidance.
