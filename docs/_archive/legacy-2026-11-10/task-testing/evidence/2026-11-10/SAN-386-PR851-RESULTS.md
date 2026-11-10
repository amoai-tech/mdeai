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

## Browser-driven refinement correction
- A real guest 390px and 1440px browser test on the updated chat router proved that **both** messages now reached the genuine `/api/rentals/search` route (HTTP 200; no sign-in prompt), but the second search initially returned **4** in-budget cards rather than narrowing the original three to two: the fast path discarded the first search's semantic query text and rediscovered unrelated cheaper results.
- Read-only Supabase-backed API proof: searching at COP 2.5M with the *original* rental search query text returned exactly the **2 original, qualifying listings**; without that original query text, the API returned 4 broader qualifying listings. No price filtering or currency bug was present.
- Minimal correction in existing `use-rental-search-fast-path`: for an exact **same-currency monthly-budget-only refinement**, preserve the visible thread's original `searchMeta.params.queryText` while replacing the structured monthly price ceiling. Currency changes intentionally start a new semantic query; New Chat has no saved text to reuse. No new database/API engine or client-side fake filter.
- RED: 1 failing regression, 25 passing, showing missing original query text; GREEN: 293/293 focused tests (six suites, including guest 2-message and currency-switch negatives plus signed-in topic changes and rental Details).
- Local browser runs used the real Next.js optimized build with public Supabase credentials, not mocks. Guest read-only rental search worked; unrelated local env warnings (missing Map ID, private DATABASE_URL for thread API) mean map marker rendering and private persistence need staged/production verification rather than being claimed from this localhost run.

## Reviewer follow-up: newer authenticated rental context
- A later Autosana review found a separate stale-query risk: a signed-in AI rental query for **Envigado** can update the CoAgent memory while an older **Laureles** fast-path `searchMeta` remains visible. Applying the old Laureles semantic query to the new Envigado structured filters would rank the wrong candidates.
- Reproduced independently before the fix: one new regression **failed**, 26 other tests passed. The test performs a Laureles fast-path search, simulates a newer authenticated Envigado rental intent, then refines the budget.
- The existing hook now retains previous semantic text **only when the current CoAgent query and visible search agree on neighborhood, bedrooms, original monthly ceiling/currency, stay type and dates**. Mismatched/newer AI queries and currency changes start fresh; matching guest refinements continue to narrow the visible search.
- GREEN: **294/294 focused tests** across six suites, covering both review findings, guest budget search, saved thread and New Chat, currency changes, stale cross-topic/AI context, and existing rental Details behavior.
- The earlier exact-head `ace6de3a43` **local `npm run floor` passed** (5,654 tests passed, 49 skipped); browser at 390px and 1440px passed 3→2 COP results with two POSTs, zero sign-in or JS errors, and mobile map location count 2→1. Protected Vercel preview on that SHA passed version and four real API cases. These are **prior-head proof**; new-head floor, browser, preview and CI must be repeated before merge readiness.

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
