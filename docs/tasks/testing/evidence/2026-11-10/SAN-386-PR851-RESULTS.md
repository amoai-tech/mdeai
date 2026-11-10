# SAN-386 — PR #851: guest rental budget follow-ups and signed-in topic isolation

## Outcome
After an existing guest rental search, a monthly COP/USD budget-only refinement should use the public rental API rather than require login. After a signed-in renter changes the conversation to coworking, restaurants, or events, a later budget-only question must not reactivate stale rental search context.

## Reproduction and correction
- PR #849's deployed 390px /chat guest browser flow reproduced the defect: COP 3M request returned 3 in-budget cards, but a COP 2.5M follow-up sent **no second rental API request**, displayed a sign-in prompt, and left the old COP 2.9M result visible.
- Original PR #851 changed the shared router to recognize visible rental-search context. Autosana's signed-in context review is independently confirmed: a new red test failed on `Boolean(visibleRentalSearch) || ...` when a signed-in user switched to coworking.
- The correction conditions **both** visible rental criteria and CoAgent rental memory on the latest conversation intent. Existing guest conversations with no authenticated CoAgent intent still refine via the real rental search. When another category becomes the latest intent, stale rental cards do not override it.
- Current main added a separate rental Details chat handler. The conflict was merged while preserving both Details functionality and the guest budget router. The hook reads `toolResult` and `searchMeta` from the same canonical provider; the tests retain the real rental provider and mock only Details display data.
- Added docstrings to touched functions; no new search, auth, RLS, or booking system.

## Focused tests (verified)
- Before correction: `npx vitest run src/lib/hooks/__tests__/use-concierge-send-handlers.test.tsx` — **RED**: 1 failed / 41 passed; `inRentalSearch` incorrectly `true` for signed-in coworking context.
- After correction, before base synchronization: **280/280** focused tests passed (6 suites), including signed-in coworking/event/restaurant topic switches, current rental and guest refinements.
- After merging current `origin/main` and preserving new rental Details behavior: **292/292** focused tests passed (6 suites), including Details cases.
- Tests use deterministic React hooks, real router/parsers and mocked network. They are not substitutes for browser proof.

## Remaining release gates
- Exact-head `npm run floor` (lint, typecheck, optimized production build, full Vitest, audits and Mastra) — pending.
- Desktop (1440px) and mobile (390px) real-browser two-turn guest journey, with two backend POSTs, result counts 3 → 2, correct currency and hard ceiling, map/card synchronization, and no sign-in prompt — pending.
- Signed-in chat topic-shift regression and saved/New Chat state isolation — covered by focused tests; browser confirmation pending.
- Protected Vercel deployment and merge must not be described as live production proof; verify merged SHA, staged deployment, promoted `/api/version`, and repeat the browser/API journey after owner-approved merge.

## Scope and checks
- Layer: Backend / AI chat routing, with a small React handler for wiring to existing search. No change to listing eligibility, rights, Supabase database or business gates.
- Scope: PR #851 only, under the verified `SAN-386 · Only Rank Rentals That Actually Match the Renter's Hard Requirements` Linear issue. No new issue.
- Source receipts: none needed. The implementation reuses the repository's current route classifier, rental parser, CoAgent context, and RentalFastPathProvider; no external source materially changed the code.
- Logs on authorized local machine: `/tmp/san386-pr851-red.log`, `/tmp/san386-pr851-focused-final.log`, `/tmp/san386-pr851-merged-focused2.log`. Do not mistake remote `/tmp` logs for user-downloadable files.
