# MDE AI — Open Pull Request Inventory & Value Audit

**Repo:** amoai-tech/mdeai · **Audited:** 2026-10-21 17:00 UTC · **Open PRs:** 43 (**6 draft**) · **Comparison base:** `origin/main` @ `5d1d76ddf6` (5d1d76ddf6c26ca8996c4e121a87b584c3a2971b)

Evidence method: `gh pr list/view/checks/diff`, `gh run view --log-failed`, `git show origin/main:<path>`, `git merge-base --is-ancestor`. The local working tree is a **reduced canary branch** and was not used as evidence of what ships. No PR state, comment, branch or commit was modified by this audit.

## Summary counts

| Metric | Count |
| --- | --- |
| Open PRs | 43 |
| Draft PRs | 6 (#452, #447, #364, #362, #244, #238) |
| Product feature | 22 |
| Infrastructure | 8 |
| Tests/QA | 8 |
| Security | 4 |
| Documentation | 1 |
| `CONFLICTING` / `DIRTY` | 8 (#256, #238, #248, #324, #362, #376, #447, #100) |
| ≥1 failing/non-passing check on head | 11 |
| Green checks, blocked **only** on the required review | 20 |
| Already satisfied by main / superseded | 5 (#256 main, #447 #445, #255 #456, #100 #214, #238 #396+#429) |
| Priority P1 (merge/merge-after-fix now) | 8 (#459, #456, #484, #394, #453, #483, #479, #476) |

Global blockers: (1) of the 26 non-draft PRs with no failing check, **20 are `MERGEABLE` + `BLOCKED / REVIEW_REQUIRED`** and 2 more (#403, #404) are `CLEAN` with no review at all — the queue is review-bound, not code-bound. (2) One shared flaky test (`e2e/chat-virtualization.spec.ts`, SAN-1357) reds `deterministic chromium` on four unrelated PRs. (3) `supabase-acl` is red with an identical 3-suite signature (2/14, 6/15, 7/25) on PRs *with* and *without* SQL, i.e. base-branch drift.

## Main table

| Priority | PR | Title / URL | Domain | Type | Status | Linear | Changes | User journey / purpose | Tests + CI | Dependencies / overlap | Value /100 | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | #459 | [Events: Publish once with safe retries and correct ticket amounts](https://github.com/amoai-tech/mdeai/pull/459) | Events/Ticketing · Payments | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · `review / review` FAILURE | SAN-1285, SAN-1548, SAN-582 | 20 files · +1497/-494 | Host publishes an event once; retry/reload returns the same event + tiers; COP 40,000 reaches Stripe as 4,000,000 minor units. | floor SUCCESS, supabase-acl SUCCESS, deterministic chromium SUCCESS, Codacy SUCCESS; `review / review` FAILURE (PR-Agent run 39424285473 aborted with 'Version evidence: NEEDS VERIFICATION / Evidence generation failed') → advisory reviewer infra failure, not a code finding. | Collides with merged #454 (supabase/functions/approval-commit/index.ts) and merged #475 (scripts/function-acl-baseline.json, san1304a/sb002 ACL tests); #456 shares two of those test files. Migrations 20261021033000/20261021043000 do not collide with main (030000 SAN-1548, 040000 SAN-1470, 050000 SAN-1556, 060000 SAN-1305, 070000 SAN-1502). | **87** | Fix (rebase on 5d1d76ddf6, re-run review check) → merge |
| P1 | #456 | [SAN-1562 · Stop Fake Ticket Refunds and Check-Ins](https://github.com/amoai-tech/mdeai/pull/456) | Events/Ticketing · Payments | Security | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | SAN-1562, SAN-1284, SAN-1357, SAN-757 | 4 files · +144/-3 | A signed-in user must not be able to fake a refund, consume someone else's QR, or call check-in RPCs directly; anon loses event write grants. | supabase-acl SUCCESS, floor SUCCESS, Codacy SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 `chat-virtualization.spec.ts` first-row flake (run 39410522833 → `✘ 30 … both ends of the conversation are reachable by real scrolling`), not this PR's SQL. | Migration version **20261021030000 collides with main's 20261021030000_san1548_event_approval_id.sql** → must renumber to ≥20261021090000 before merge. Duplicates/absorbs #255 (same `ticket_validate_consume` revoke). Shares san1284c + sb002 test files with #459, both already rewritten by merged #475 → rebase conflicts. | **81** | Fix (renumber migration + rebase) → merge |
| P1 | #484 | [Let renters request pending development apartments without exposing test fixtures](https://github.com/amoai-tech/mdeai/pull/484) | Rentals/Viewings | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · supabase-acl FAILURE | SAN-1502, SAN-1286, SAN-1206, SAN-1105, SAN-1349, SAN-1449 | 5 files · +1252/-14 | Renter opens a pending Phase-A development listing and the Request-viewing path works; active test fixtures and private listings stop being bookable. | floor SUCCESS, deterministic chromium SUCCESS, Codacy SUCCESS; `supabase-acl` FAILURE (run 39460687384: pgTAP 3 suites, 2/14 + 6/15 + 7/25 failing). The **identical three-suite signature** appears on #473 (run 39450246434), which contains no SQL at all → the failure is base-branch/live-schema drift, not proof this migration is wrong. Still not green. | Builds directly on merged #478 (SAN-1502 phase-A pending rental search, 20261021070000) and is the authority half of the same journey. Migration 20261021080000 is the next free slot after main's 070000. #364 is the sibling SAN-1502 publish-authority fix and must land next to it. | **80** | Fix (re-run supabase-acl once base is green) → merge |
| P1 | #394 | [Venue Inquiries: Save Each Lead Once and Keep Contact Details Private](https://github.com/amoai-tech/mdeai/pull/394) | Partners/Venue leads | Security | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-882 | 7 files · +568/-45 | A venue owner retries a dropped inquiry and gets the same saved reference — not a duplicate lead — and their email never reaches server logs. | floor, deterministic chromium, supabase-acl, Codacy, CodeRabbit, Kilo all SUCCESS; no failed check on this head. | No file overlap with any open PR. Body notes the advisory Codacy finding was not reviewed; production replay + log-privacy still need post-deploy proof. | **74** | Merge |
| P1 | #453 | [MDE Events — Show real ticket prices and only valid Buy actions](https://github.com/amoai-tech/mdeai/pull/453) | Events/Discovery | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1560, SAN-1285, SAN-178, SAN-974 | 4 files · +151/-16 | Visitor sees 'From $40,000 COP' from the real cheapest tier instead of 'Free', and no Buy button when no tier is purchasable. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | Base of the stack: #461 is based on this branch and must merge after it. Shares `list-published-events.ts` (+ its test) with #461. | **70** | Merge (then rebase #461) |
| P1 | #479 | [Rentals: Keep the same apartments visible during follow-up questions](https://github.com/amoai-tech/mdeai/pull/479) | AI Concierge/Rentals | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1421 | 5 files · +110/-5 | Renter asks 'any with a balcony?' after seeing rentals and the concierge answers from the shown rows (says 'not specified' when absent) instead of re-searching or inventing. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook all SUCCESS; no failed check. | Overlaps merged #445/#449 on the rental ask path and `src/mastra/agents/concierge.ts` with #324. Self-declared gap: needs a live three-turn replay (Laureles → under 3M → balcony) on this exact head's preview. | **65** | Fix (run the documented preview replay) → merge |
| P1 | #476 | [Chat: Show a Retry button when the first event search fails](https://github.com/amoai-tech/mdeai/pull/476) | AI Concierge/Chat | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1554 | 10 files · +165/-31 | Fresh chat + events API 503: the error and Try again appear even with an empty transcript, and Retry re-runs the event search. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook SUCCESS; Kilo left a COMMENTED review; no failed check. | Same SAN-1554 area as merged #457 and #464 (both already changed `concierge-run-feedback.tsx` / `concierge-transcript-tail.tsx` / `concierge-error-store.ts`) → rebase before merge. Shares `chat-center-panel.tsx` with #406, `concierge-transcript-tail.tsx` with #248. | **62** | Merge after rebase |
| P1 | #483 | [Chat Tests: Stop False Failures When Scrolling Through 500 Messages](https://github.com/amoai-tech/mdeai/pull/483) | Tests/QA · CI unblocker | Tests/QA | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1357 | 1 files · +15/-14 | No user-facing change: the 500-message virtualization regression stops failing CI for unrelated PRs while still proving both ends are reachable. | floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo all SUCCESS on this head — the only open PR that turns that flake green. | **Highest-leverage PR on the board:** the same `e2e/chat-virtualization.spec.ts` failure is the sole red check on #471, #474, #480 and #456. | **48** | Merge first (unblocks #456, #471, #474, #480) |
| P2 | #364 | [Rental Publishing: Block Unauthorized Brokers and Keep Original Publish Dates](https://github.com/amoai-tech/mdeai/pull/364) | Rentals/Publishing | Security | Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1502 | 2 files · +177/-0 | Broker B cannot publish Broker A's listing when the owner field is blank; a repeat publish keeps the original published_at. | floor, supabase-acl, deterministic chromium, Codacy, authenticated restaurant vote all SUCCESS; no failed check. | Same SAN-1502 epic as #484 (viewing authority vs publish authority — complementary, not duplicate). Migration 20261017020000 is old enough to need rebase past main's 070000/080000. | **66** | Fix (undraft + rebase) → merge after #484 |
| P2 | #404 | [Autofill a partner profile from their business website](https://github.com/amoai-tech/mdeai/pull/404) | Partners/Onboarding | Product feature | Open · MERGEABLE · CLEAN · REVIEW (none submitted) | SAN-1193, SAN-709 | 14 files · +713/-8 | Partner pastes their website, reviews extracted business facts with sources, and only accepted values are persisted. | floor, Codacy, Kilo, CodeRabbit, Vercel SUCCESS. Note: this PR's check list has **no** Playwright/supabase-acl entries (branch scoping), so browser proof is not on the check list. | Stack: #400 → #403 → #404 (base is `feat/san-709-ai-signup`). Must be retargeted to main only after #403 merges. #403 and #404 share `onboarding-ai-suggestion-card.tsx`, `partner-signup-assistant.tsx`, `partner-signup-wizard.tsx`, `ai-suggestion.ts`. | **65** | Merge in stack order after #400, #403 |
| P2 | #403 | [Let partners review AI signup suggestions before applying them](https://github.com/amoai-tech/mdeai/pull/403) | Partners/Onboarding | Product feature | Open · MERGEABLE · CLEAN · REVIEW (none submitted) | SAN-709, SAN-1193, SAN-705 | 12 files · +597/-9 | Partner sees AI-suggested signup fields as Accept/Edit/Ignore; nothing is written until the existing activation API runs. | floor, Codacy, Kilo, CodeRabbit, Vercel SUCCESS. | Stack base is #400 (`feat/san-705-partner-agent`); #404 stacks on this. Shares `partner-agent.ts` with #400 and the onboarding card/wizard files with #404. | **64** | Merge after #400 |
| P2 | #402 | [Let partners edit their own business profile](https://github.com/amoai-tech/mdeai/pull/402) | Partners/Profile | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-814 | 6 files · +460/-0 | A partner corrects business name/category/neighborhood/website/description instead of needing a database admin. | floor, deterministic chromium, Codacy, Kilo, CodeRabbit SUCCESS; Kilo COMMENTED. | Shares the partner `settings` JSONB with #403/#404 (no file overlap). No migration; relies on existing `partner_members` RLS. | **62** | Merge |
| P2 | #400 | [Give every partner one working assistant](https://github.com/amoai-tech/mdeai/pull/400) | Partners/Workspace | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-705, SAN-706 | 14 files · +291/-4 | A café/venue/host partner opens /partners/workspace and asks 'what do I do next?' in their own language. | floor, deterministic chromium, Codacy, Kilo, CodeRabbit SUCCESS; Kilo COMMENTED. | Stack base for #403 and #404. Shares `scripts/copilotkit-consumer-inventory.json` with #403 and `partner-agent.ts` with #403. No migration/new table. | **62** | Merge first (stack base) |
| P2 | #461 | [Events: Hide QA test events from public discovery and AI search](https://github.com/amoai-tech/mdeai/pull/461) | Events/Discovery | Product feature | Open · MERGEABLE · UNSTABLE (no review decision) · floor FAILURE | SAN-1561, SAN-1560, SAN-896 | 13 files · +146/-15 | Visitors stop seeing 'QA DEMO' cards on /, /events, public detail URLs and AI search, while QA records stay in Supabase for admins. | floor FAILURE (run 39415707247): `src/mastra/lib/__tests__/intelligence-event-search-errors.test.ts > throws when structured events query fails (not empty success)` — AssertionError expecting 'structured event query failed: permis…', got 'client.from(...).select(...).eq(...)'. This is inside this PR's own touched module (`intelligence-event-search.ts`) → real regression. | Stacked on #453 (base branch is #453's head) — must rebase and merge after #453. Shares `list-published-events.ts` + its test with #453, `search-events.ts` with #467. | **58** | Fix (own failing unit test + rebase on #453) → merge |
| P2 | #324 | [Write real rental prices and links into the WhatsApp reply](https://github.com/amoai-tech/mdeai/pull/324) | AI Concierge/WhatsApp | Product feature | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED | SAN-1444, SAN-1442 | 5 files · +402/-39 | WhatsApp renter asks for a furnished 2-bedroom under COP 3.5M/month and receives real titles, the listing's own monthly price, and a validated link instead of prose with no data. | floor, deterministic chromium, Codacy, CodeRabbit SUCCESS at head; four review-comment threads from kilo + coderabbit + owner. | Conflicts vs main. Shares `src/mastra/tools/search-rentals.ts` with #362 and #467, and `src/mastra/agents/concierge.ts` with #479 → merge #467/#479 first, then rebase this. | **55** | Fix (rebase conflicts) → merge |
| P2 | #482 | [Database Tests: Allow Development Rentals in Search While Protecting Private Records](https://github.com/amoai-tech/mdeai/pull/482) | Rentals/Discovery · DB tests | Tests/QA | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1291, SAN-1502, SAN-468 | 3 files · +35/-35 | No user-facing change: ordinary pending/inactive development rentals become findable while private and test-fixture records stay hidden and cross-broker writes stay denied. | supabase-acl, floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | Corrects three tests (`dev_discovery_excludes_test_fixtures_test.sql`, `dev_enrichment_follows_listing_visibility_test.sql`, `san468_apartment_public_exposure_rls_test.sql`) that contradict merged #478's Phase-A behavior. No migration. | **52** | Merge |
| P2 | #480 | [Restaurant Voting: Prevent a Second Vote While Checking an Existing Ballot](https://github.com/amoai-tech/mdeai/pull/480) | Restaurants/Contests | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | SAN-1357-adjacent (none parsed) | 2 files · +33/-2 | A returning signed-in voter cannot see an enabled Vote button before the saved-ballot check finishes (no second ballot). | floor, Codacy, CodeRabbit, Kilo, auth-redirect chromium SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 chat-virtualization flake (run 39445838084 `✘ 30 e2e/chat-virtualization.spec.ts`) — unrelated to this diff. | Fixable purely by merging #483 first and re-running. Touches only `restaurant-vote-panel.tsx` + one test — no overlap with other open PRs. | **51** | Fix (rebase after #483) → merge |
| P2 | #405 | [Rentals: Explain Why Apartments Match in Everyday Language](https://github.com/amoai-tech/mdeai/pull/405) | AI Concierge/Rentals | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1534 | 2 files · +41/-3 | 'Why these rentals' reads 'Limited to Laureles' instead of `hybrid_semantic: hybrid_search_listings RPC`. | floor, deterministic chromium, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | No file overlap. Copy-only translation of existing ranking reasons; ranking and inventory untouched. | **48** | Merge |
| P2 | #474 | [Mobile: Make the Open Map button usable only when it is ready](https://github.com/amoai-tech/mdeai/pull/474) | Mobile Maps/Chat | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | SAN-1564 | 2 files · +42/-0 | On a phone, a fast tap on Open map is either disabled or actually works — never a painted-but-dead button. | floor, deterministic Maps contracts, auth-redirect chromium, Codacy, Kilo, CodeRabbit SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 flake (run 39455299255). | Same epic as #473 (test for the historical appendChild crash) — complementary. Shares `package.json` with #473/#455/#248/#256; no overlap with #471's script. | **48** | Fix (rebase after #483) → merge |
| P2 | #481 | [Accessibility: Make Skip to Main Content Work on Contest and Login Pages](https://github.com/amoai-tech/mdeai/pull/481) | Accessibility/Shell | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | — | 5 files · +17/-6 | Keyboard-only visitor presses Skip to main content on contests, contest detail, restaurant voting detail or login and focus lands on the real content. | floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo SUCCESS; new `e2e/san-1524-contests.spec.ts` keyboard check included. | No Linear id in branch/title/body. No overlap with other open PRs. | **46** | Merge |
| P3 | #376 | [Rental Partners: Help Brokers Sign Up or Contact MDE](https://github.com/amoai-tech/mdeai/pull/376) | Partners/Marketing | Product feature | Open · CONFLICTING · DIRTY · no review decision | SAN-691, SAN-693 | 7 files · +187/-49 | A Medellín broker reaches a real /partners/rentals landing with 'Sign up as a rental broker' and a contact path instead of a coming-soon stub. | floor, Codacy, CodeRabbit, Kilo SUCCESS at head; branch is CONFLICTING against main. | Its declared dependency **#372 is already MERGED** (2026-10-18), so only the rebase remains. Verified on origin/main: `/partners/rentals` is still `PartnerLandingPlaceholder` with `robots: { index: false }`. | **50** | Fix (rebase on main) → merge |
| P3 | #248 | [Let buyers ask for new condos in chat and see verified project cards](https://github.com/amoai-tech/mdeai/pull/248) | AI Concierge/New projects | Product feature | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED | SAN-1380 | 33 files · +805/-51 | Buyer asks 'Show me new 2-bedroom projects' in /chat and gets grounded project cards with price/bedrooms/delivery/source, or an honest zero-match answer. | floor, deterministic chromium, supabase-acl, deterministic Maps contracts, Codacy, CodeRabbit SUCCESS at head; 15 days stale and CONFLICTING. | The search/compare engine shipped in merged #241, but `src/lib/new-projects/` does not exist on origin/main → the chat surface is genuinely missing. Shares `concierge-transcript-tail.tsx` with #476, `database.types.ts` with #244. | **50** | Fix (rebase; 33 files/805 lines needs a split) |
| P3 | #367 | [Rental Details: Remove Broken Buttons and Keep Mobile Viewing Accessible](https://github.com/amoai-tech/mdeai/pull/367) | Rentals/Details | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-479 | 3 files · +35/-23 | On a phone the misleading Ask-a-question/Save buttons disappear and Request viewing clears the home indicator. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | Shares `rental-detail-view.tsx` with deferred draft #362. Real phone inset + persisted viewing receipt still unverified. | **49** | Merge |
| P3 | #373 | [Stop Fake Clean Reviews From Hiding Security Problems](https://github.com/amoai-tech/mdeai/pull/373) | Review tooling/CI integrity | Infrastructure | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1332, SAN-1312 | 2 files · +55/-12 | A code block inside a PR review that says 'no issues' can no longer override a real high-severity finding in PR-Agent scoring. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | No overlap. Regression test reproduces the false-clean case, 66/66 focused tests per body. | **46** | Merge |
| P3 | #455 | [QA: Clean up broker accounts and rental drafts after onboarding tests](https://github.com/amoai-tech/mdeai/pull/455) | Tests/QA · E2E hygiene | Tests/QA | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-677, SAN-1092 | 6 files · +250/-53 | A developer runs broker onboarding E2E; passing or failing, it deletes only its own listings/profile/identity and fails loudly if cleanup fails. | floor, supabase-acl, deterministic chromium, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | No overlap. Explicitly not a claim that SAN-677's production journey is done. | **45** | Merge |
| P3 | #406 | [Chat: Suggest Monthly COP Rent Instead of Nightly USD](https://github.com/amoai-tech/mdeai/pull/406) | AI Concierge/Chat | Product feature | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1508, SAN-1059 | 3 files · +39/-3 | New renter's chat welcome example reads '1BR in Laureles under COP 3,000,000/month' instead of '$80/night'. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | Partial SAN-1508 on purpose (branch name omits the id so Linear will not auto-close). Shares `chat-center-panel.tsx` with #476. | **44** | Merge (do not mark SAN-1508 Done) |
| P3 | #473 | [Mobile Map Tests: Catch Crashes When Opening and Closing Google Maps](https://github.com/amoai-tech/mdeai/pull/473) | Tests/QA · Mobile Maps | Tests/QA | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · supabase-acl FAILURE | SAN-1564 | 4 files · +201/-0 | No production code change: a real-Google-Maps smoke suite reopens the mobile map repeatedly and fails if pins vanish or an appendChild error returns. | floor, deterministic chromium, deterministic Maps contracts, Codacy, Kilo, CodeRabbit, GitBook SUCCESS; `supabase-acl` FAILURE with the same 2/14 + 6/15 + 7/25 signature as #484. This PR contains **no SQL** → the red ACL suite is base-branch drift, not this diff. | Adds `npm run test:e2e:maps-lifecycle` and a release-checklist line; shares `package.json`/`playwright.config.ts` with #238/#248/#455. | **43** | Fix (ACL suite once base is green) → merge |
| P3 | #387 | [CI: Stop Routine Tests From Spending Gemini Credits](https://github.com/amoai-tech/mdeai/pull/387) | CI/Test infrastructure | Infrastructure | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1536 | 1 files · +18/-5 | A developer editing homepage copy no longer fails CI because the Gemini account has no prepaid balance. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | No overlap. Explicitly not proof that live Gemini works; the live capability suite stays opt-in via `MDE_RUN_LIVE_GEMINI_CAPABILITY_TESTS=1`. | **42** | Merge |
| P3 | #467 | [AI Search: Prevent Mastra startup loops across rentals, events, and restaurants](https://github.com/amoai-tech/mdeai/pull/467) | Mastra/Infrastructure | Infrastructure | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-583 | 3 files · +7/-4 | No user-facing change: `mastra dev` stops printing circular-dependency warnings for all three search domains. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | Shares `search-rentals.ts` with #324 and #362, `search-events.ts` with #461. Verified on origin/main: `src/mastra/tools/search-rentals.ts:14` still statically imports `intelligence-rental-search` → the cycle is real. | **39** | Merge |
| P3 | #420 | [Events Tests: Accept an Honest 'No Events Found' Result](https://github.com/amoai-tech/mdeai/pull/420) | Tests/QA · Prod journey | Tests/QA | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-546 | 1 files · +26/-7 | A correct empty-event answer stops failing the production J09 journey while the populated branch still asserts a card and Buy path. | floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo, Sourcery SUCCESS; no failed check. | Companion to merged #418 (J17). Verified on origin/main: J09 at `e2e/prod-journey-j05-j20.spec.ts:92-98` still waits 120s for `[data-testid="event-card"]` with no empty-state alternative → still needed. | **38** | Merge |
| P4 | #244 | [Let property owners and brokers save onboarding progress and resume later](https://github.com/amoai-tech/mdeai/pull/244) | Partners/Onboarding | Product feature | Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1391, SAN-1107 | 11 files · +1540/-0 | Owner/broker leaves mid-onboarding and resumes from a validated draft instead of losing answers. | floor, supabase-acl, deterministic chromium, Codacy, CodeRabbit, GitBook SUCCESS; body states exact-head CI + full floor still need verification after its 2026-10-16 rewrite. | Foundation only — the wizard is **not** wired to this draft system. Adds `20261006131205_san1391_add_landlord_partner_type.sql` (enum change) and `database.types.ts` (shares with #248). Draft since 2026-10-06. | **46** | Defer (draft, unwired, enum migration) |
| P4 | #234 | [chore: configure Infisical secret management](https://github.com/amoai-tech/mdeai/pull/234) | Secrets/Ops | Infrastructure | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · Kilo Code Review FAILURE | — | 2 files · +6/-0 | Developers get one pinned Infisical project config and `*.env` files cannot be committed by accident. | floor, deterministic chromium, Codacy, CodeRabbit, Sourcery SUCCESS; `Kilo Code Review` FAILURE (external kilo.ai review, advisory, not required). | Infisical is already referenced by `.claude/hooks/scan-secrets.mjs`, `guard-sensitive-paths.mjs`, `dist-leak-scan.mjs` and the supabase skill references; no `.infisical.json` ships on main. | **38** | Merge (advisory Kilo failure does not gate) |
| P4 | #389 | [AI Chat Tests: Restore Temporary Settings After Every Test](https://github.com/amoai-tech/mdeai/pull/389) | Tests/QA | Tests/QA | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1537 | 1 files · +5/-2 | No user-facing change: one chat test can no longer leak `COPILOTKIT_TELEMETRY_DISABLED` into the next test in the process. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | No overlap. Fixes one confirmed leak, not all intermittent test failures. | **36** | Merge |
| P4 | #214 | [ci: restore Codacy coverage reporting](https://github.com/amoai-tech/mdeai/pull/214) | CI/Coverage | Infrastructure | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | — | 3 files · +70/-12 | Developers see PR coverage again (JS + TS partial reports finalised per PR) without touching the required floor gate. | floor, Codacy Static, Codacy Diff Coverage, 'Report coverage to Codacy', deterministic chromium, CodeRabbit, Kilo SUCCESS — the only PR on the board with a passing coverage upload run. | Supersedes #100 (same workflow file, older branch). `.codacy.yml` already exists on origin/main, so only `.github/workflows/codacy-coverage.yml` + `.gitignore` are genuinely new. | **34** | Merge (supersedes #100) |
| P4 | #471 | [Releases: Check the live website version before reporting a deployment](https://github.com/amoai-tech/mdeai/pull/471) | Release/Ops tooling | Infrastructure | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | — | 3 files · +213/-0 | A teammate can prove whether 'Feature X is live' matches the commit production actually serves, and can flag a stale claim with exit 1. | floor, supabase-acl, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 flake (run 39434317221). | **Partly duplicates shipped tooling.** origin/main already has `.github/workflows/prod-deploy-freshness.yml` (SAN-1360, post-merge production freshness guard), `src/app/api/version/route.ts` and `scripts/vercel-release-control.mjs` from merged #416. Shares `package.json` with #473/#455/#248/#256. | **29** | Defer / combine with existing release tooling |
| P4 | #313 | [Record missing reviews for PR #310 and PR #312](https://github.com/amoai-tech/mdeai/pull/313) | Operations docs | Documentation | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | SAN-1486 | 1 files · +123/-6 | Auditors can see that #310 and #312 merged without an approving review, what GitHub proves, and what follow-up is required. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook SUCCESS; no failed check. | Docs-only, but main has moved: origin/main's `docs/07-operations/merge-approval-history.md` now carries #472/#460 entries that this branch does not, and `git show origin/main:… \| grep 310\|312` returns nothing → the #310/#312 records are still missing. Rebase needed. | **29** | Merge after rebase |
| P5 | #255 | [Stop anyone with a ticket's QR from marking it used before the door scan](https://github.com/amoai-tech/mdeai/pull/255) | Events/Ticketing · DB ACL | Security | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · floor FAILURE | SAN-1284, SAN-1289, SAN-1350, SAN-1427 | 3 files · +89/-5 | Only the door-scan service can mark a QR ticket used; a buyer (or someone who glimpsed the QR) can no longer consume it directly. | `floor` FAILURE on a **15-day-old head** (run 37488865535); supabase-acl, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS then. | **Subsumed by #456**, whose migration revokes `ticket_validate_consume(text)` from anon+authenticated and grants only `service_role` (verified in `gh pr diff 456`). Migration 20261008100000 would also need renumbering past main's 20261021070000. | **64** | Close (incorporated into #456) |
| P5 | #447 | [Rentals: Ask MDE on the listings page without losing the map](https://github.com/amoai-tech/mdeai/pull/447) | Rentals/Discovery | Product feature | Draft · CONFLICTING · DIRTY · REVIEW_REQUIRED | SAN-1421, SAN-386 | 3 files · +365/-20 | Renter asks 'Show furnished two-bedroom places' on /rentals and cards + pins update in place without leaving the map. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS at head; CONFLICTING/DIRTY. | **Superseded by merged #445** ('Ask MDE inside the apartment list, without leaving the search', merged 2026-10-20) which shipped the same journey through `rental-ask-composer.tsx` / `rental-browse-view.tsx`. This branch's `rental-inline-ask.tsx` does not exist on origin/main and now conflicts with the shipped implementation. | **24** | Close (superseded by merged #445) |
| P5 | #238 | [Certify the rental chat restart in production (finds a budget-persistence gap)](https://github.com/amoai-tech/mdeai/pull/238) | Tests/QA · Prod certification | Tests/QA | Draft · CONFLICTING · DIRTY · REVIEW_REQUIRED | SAN-548 | 2 files · +406/-0 | Two-phase opt-in production harness that proves a rental chat survives a real Vercel redeploy (writes to production data by design). | floor, deterministic chromium, Codacy, CodeRabbit SUCCESS at head; CONFLICTING. | Superseded in coverage terms by merged #396 (live renter viewing journey) and #429 (evidence capture on failure). Shares `playwright.config.ts` with #248/#473. | **23** | Close (disposition: draft; coverage now provided by merged #396/#429) |
| P5 | #362 | [Rental Listings: Show Original Advertisers and Source-Check Status (Deferred)](https://github.com/amoai-tech/mdeai/pull/362) | Rentals/Provenance | Product feature | Draft · CONFLICTING · DIRTY · REVIEW_REQUIRED | SAN-1235, SAN-1503 | 11 files · +213/-15 | Renter could see the original advertiser and 'Not yet checked' freshness on cards and Details (deferred by the owner). | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS at head; CONFLICTING/CONFLICTING-DIRTY. | Self-labelled **DRAFT · DEFERRED — NOT A CURRENT DEVELOPMENT PRIORITY**. Note `src/lib/rentals/provenance.ts` already exists on origin/main, so part of the surface shipped elsewhere. Shares `rental-detail-view.tsx` with #367, `search-rentals.ts` with #324/#467. | **21** | Close (owner-deferred draft) or keep parked off the merge queue |
| P5 | #256 | [Patch the critical shell-quote advisory so CI can pass](https://github.com/amoai-tech/mdeai/pull/256) | Dependency/CI | Infrastructure | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED · 15 days old | — | 2 files · +4/-4 | No user-facing change: pins `shell-quote` to 1.12.0 so the critical advisory stops failing `floor`. | All checks SUCCESS **on its 15-day-old head**, but the PR is CONFLICTING. | **Already satisfied on origin/main**: `git show origin/main:package.json` has `"shell-quote": ">=1.11.0"` and `git show origin/main:package-lock.json` resolves `node_modules/shell-quote` to **1.12.0**. main's floor is green at 5d1d76ddf6. | **18** | Close (already satisfied on main) |
| P5 | #100 | [Add Codacy coverage reporting to CI](https://github.com/amoai-tech/mdeai/pull/100) | CI/Coverage | Infrastructure | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED · 31 days old | — | 2 files · +52/-0 | Same outcome as #214: PR-level JS/TS coverage in Codacy without changing the floor gate. | floor, Codacy Diff Coverage, coverage, CodeRabbit SUCCESS at head; `Kilo Code Review` FAILURE; CONFLICTING for 31 days. | **Superseded by #214**, which adds the same `.github/workflows/codacy-coverage.yml` plus the `.codacy.yml` already shipped on main and has a green 'Report coverage to Codacy' run. | **15** | Close (superseded by #214) |
| P5 | #452 | [TEST ONLY: PR-Agent must detect reversed access check in isolated probe](https://github.com/amoai-tech/mdeai/pull/452) | Review tooling | Tests/QA | Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | — | 1 files · +5/-0 | None for users: an unreferenced TypeScript function with a deliberately reversed confidentiality check used to exercise PR-Agent. | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. | Body says **Never merge**. No callsite references the module. | **8** | Close (never intended to merge) |

Value rubric: user impact 30 · unlocks critical journey 25 · security/data correctness 20 · reuse/simplicity 10 · effort-vs-value 10 · dependency leverage 5.

## Notable PRs (concrete evidence)

Sections are ordered by value score, with the CI-unblocker #483 included because it gates four other PRs.

### 1. #459 — Events: Publish once with safe retries and correct ticket amounts (87/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/459
- **Domain / type:** Events/Ticketing · Payments · Product feature · **Linear:** SAN-1285, SAN-1548, SAN-582
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · `review / review` FAILURE
- **Change size:** 20 files · +1497/-494
- **User journey:** Host publishes an event once; retry/reload returns the same event + tiers; COP 40,000 reaches Stripe as 4,000,000 minor units.
- **Tests + CI (actual):** floor SUCCESS, supabase-acl SUCCESS, deterministic chromium SUCCESS, Codacy SUCCESS; `review / review` FAILURE (PR-Agent run 39424285473 aborted with 'Version evidence: NEEDS VERIFICATION / Evidence generation failed') → advisory reviewer infra failure, not a code finding.
- **Dependencies / overlap:** Collides with merged #454 (supabase/functions/approval-commit/index.ts) and merged #475 (scripts/function-acl-baseline.json, san1304a/sb002 ACL tests); #456 shares two of those test files. Migrations 20261021033000/20261021043000 do not collide with main (030000 SAN-1548, 040000 SAN-1470, 050000 SAN-1556, 060000 SAN-1305, 070000 SAN-1502).
- **Recommended action:** Fix (rebase on 5d1d76ddf6, re-run review check) → merge
- **Evidence / assessment:** Canonical SAN-1285 implementation; #458 is CLOSED so there is no competing publish path left. Touches `.github/workflows/supabase-acl.yml` (changes a required-security workflow — needs explicit approval per AGENTS.md § Ask first).

### 2. #456 — SAN-1562 · Stop Fake Ticket Refunds and Check-Ins (81/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/456
- **Domain / type:** Events/Ticketing · Payments · Security · **Linear:** SAN-1562, SAN-1284, SAN-1357, SAN-757
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE
- **Change size:** 4 files · +144/-3
- **User journey:** A signed-in user must not be able to fake a refund, consume someone else's QR, or call check-in RPCs directly; anon loses event write grants.
- **Tests + CI (actual):** supabase-acl SUCCESS, floor SUCCESS, Codacy SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 `chat-virtualization.spec.ts` first-row flake (run 39410522833 → `✘ 30 … both ends of the conversation are reachable by real scrolling`), not this PR's SQL.
- **Dependencies / overlap:** Migration version **20261021030000 collides with main's 20261021030000_san1548_event_approval_id.sql** → must renumber to ≥20261021090000 before merge. Duplicates/absorbs #255 (same `ticket_validate_consume` revoke). Shares san1284c + sb002 test files with #459, both already rewritten by merged #475 → rebase conflicts.
- **Recommended action:** Fix (renumber migration + rebase) → merge
- **Evidence / assessment:** `gh pr diff 456` shows `revoke execute … ticket_payment_refund_v2`, `ticket_validate_consume(text)`, `record_check_in`, plus anon INSERT/UPDATE/DELETE removal on `events`/`event_*`. This is a superset of #255's single-function fix.

### 3. #484 — Let renters request pending development apartments without exposing test fixtures (80/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/484
- **Domain / type:** Rentals/Viewings · Product feature · **Linear:** SAN-1502, SAN-1286, SAN-1206, SAN-1105, SAN-1349, SAN-1449
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · supabase-acl FAILURE
- **Change size:** 5 files · +1252/-14
- **User journey:** Renter opens a pending Phase-A development listing and the Request-viewing path works; active test fixtures and private listings stop being bookable.
- **Tests + CI (actual):** floor SUCCESS, deterministic chromium SUCCESS, Codacy SUCCESS; `supabase-acl` FAILURE (run 39460687384: pgTAP 3 suites, 2/14 + 6/15 + 7/25 failing). The **identical three-suite signature** appears on #473 (run 39450246434), which contains no SQL at all → the failure is base-branch/live-schema drift, not proof this migration is wrong. Still not green.
- **Dependencies / overlap:** Builds directly on merged #478 (SAN-1502 phase-A pending rental search, 20261021070000) and is the authority half of the same journey. Migration 20261021080000 is the next free slot after main's 070000. #364 is the sibling SAN-1502 publish-authority fix and must land next to it.
- **Recommended action:** Fix (re-run supabase-acl once base is green) → merge
- **Evidence / assessment:** `gh pr diff 484` redefines `rental_can_request_viewing` + `p1_schedule_tour_atomic`; per the body the old Phase-B-only fixture exclusion plus the `rental_development_active()` bypass meant an active fixture/private listing could be booked by any authenticated renter — a live data-exposure hole, not just a UX gap.

### 4. #394 — Venue Inquiries: Save Each Lead Once and Keep Contact Details Private (74/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/394
- **Domain / type:** Partners/Venue leads · Security · **Linear:** SAN-882
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 7 files · +568/-45
- **User journey:** A venue owner retries a dropped inquiry and gets the same saved reference — not a duplicate lead — and their email never reaches server logs.
- **Tests + CI (actual):** floor, deterministic chromium, supabase-acl, Codacy, CodeRabbit, Kilo all SUCCESS; no failed check on this head.
- **Dependencies / overlap:** No file overlap with any open PR. Body notes the advisory Codacy finding was not reviewed; production replay + log-privacy still need post-deploy proof.
- **Recommended action:** Merge
- **Evidence / assessment:** Body cites pre-PR code: insert with no request identity, no durable rate limit, and `console.log("[venue-lead] … email=" + data.email)`. The diff uses one request id across retries, conflict detection, per-IP limiter, and non-PII logs — all green on head.

### 5. #453 — MDE Events — Show real ticket prices and only valid Buy actions (70/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/453
- **Domain / type:** Events/Discovery · Product feature · **Linear:** SAN-1560, SAN-1285, SAN-178, SAN-974
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 4 files · +151/-16
- **User journey:** Visitor sees 'From $40,000 COP' from the real cheapest tier instead of 'Free', and no Buy button when no tier is purchasable.
- **Tests + CI (actual):** floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check.
- **Dependencies / overlap:** Base of the stack: #461 is based on this branch and must merge after it. Shares `list-published-events.ts` (+ its test) with #461.
- **Recommended action:** Merge (then rebase #461)
- **Evidence / assessment:** Body documents the concrete data defect (Reina de Antioquia: null summary price, USD currency, real 4,000,000-minor-unit COP tier). Query reuses the existing `event_tickets` FK embed with SQL `!inner` so pagination counts real tiers.

### 6. #364 — Rental Publishing: Block Unauthorized Brokers and Keep Original Publish Dates (66/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/364
- **Domain / type:** Rentals/Publishing · Security · **Linear:** SAN-1502
- **Status:** Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 2 files · +177/-0
- **User journey:** Broker B cannot publish Broker A's listing when the owner field is blank; a repeat publish keeps the original published_at.
- **Tests + CI (actual):** floor, supabase-acl, deterministic chromium, Codacy, authenticated restaurant vote all SUCCESS; no failed check.
- **Dependencies / overlap:** Same SAN-1502 epic as #484 (viewing authority vs publish authority — complementary, not duplicate). Migration 20261017020000 is old enough to need rebase past main's 070000/080000.
- **Recommended action:** Fix (undraft + rebase) → merge after #484
- **Evidence / assessment:** Null-sensitive authorization in an existing SECURITY DEFINER publish function. Draft status is the only thing stopping a 177-line, 2-file security fix that is fully green.

### 7. #479 — Rentals: Keep the same apartments visible during follow-up questions (65/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/479
- **Domain / type:** AI Concierge/Rentals · Product feature · **Linear:** SAN-1421
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 5 files · +110/-5
- **User journey:** Renter asks 'any with a balcony?' after seeing rentals and the concierge answers from the shown rows (says 'not specified' when absent) instead of re-searching or inventing.
- **Tests + CI (actual):** floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook all SUCCESS; no failed check.
- **Dependencies / overlap:** Overlaps merged #445/#449 on the rental ask path and `src/mastra/agents/concierge.ts` with #324. Self-declared gap: needs a live three-turn replay (Laureles → under 3M → balcony) on this exact head's preview.
- **Recommended action:** Fix (run the documented preview replay) → merge
- **Evidence / assessment:** Root cause is data flow, not prompt text: `lastRentalResults` stored only id/title/neighborhood/nightly_price. Diff adds verbatim amenities to working memory and makes both write paths share `payloadRows` so the tool-result and fallback paths cannot drift.

### 8. #404 — Autofill a partner profile from their business website (65/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/404
- **Domain / type:** Partners/Onboarding · Product feature · **Linear:** SAN-1193, SAN-709
- **Status:** Open · MERGEABLE · CLEAN · REVIEW (none submitted)
- **Change size:** 14 files · +713/-8
- **User journey:** Partner pastes their website, reviews extracted business facts with sources, and only accepted values are persisted.
- **Tests + CI (actual):** floor, Codacy, Kilo, CodeRabbit, Vercel SUCCESS. Note: this PR's check list has **no** Playwright/supabase-acl entries (branch scoping), so browser proof is not on the check list.
- **Dependencies / overlap:** Stack: #400 → #403 → #404 (base is `feat/san-709-ai-signup`). Must be retargeted to main only after #403 merges. #403 and #404 share `onboarding-ai-suggestion-card.tsx`, `partner-signup-assistant.tsx`, `partner-signup-wizard.tsx`, `ai-suggestion.ts`.
- **Recommended action:** Merge in stack order after #400, #403
- **Evidence / assessment:** SSRF guard is concrete: `business-url.ts` rejects localhost/private/link-local/credentials/non-standard ports before any provider call; route is auth + 10/user/hour fail-closed limiter with 400/429/422/502 taxonomy and no fake success.

### 9. #403 — Let partners review AI signup suggestions before applying them (64/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/403
- **Domain / type:** Partners/Onboarding · Product feature · **Linear:** SAN-709, SAN-1193, SAN-705
- **Status:** Open · MERGEABLE · CLEAN · REVIEW (none submitted)
- **Change size:** 12 files · +597/-9
- **User journey:** Partner sees AI-suggested signup fields as Accept/Edit/Ignore; nothing is written until the existing activation API runs.
- **Tests + CI (actual):** floor, Codacy, Kilo, CodeRabbit, Vercel SUCCESS.
- **Dependencies / overlap:** Stack base is #400 (`feat/san-705-partner-agent`); #404 stacks on this. Shares `partner-agent.ts` with #400 and the onboarding card/wizard files with #404.
- **Recommended action:** Merge after #400
- **Evidence / assessment:** Review-only design is enforced, not just claimed: one Zod contract rejects unknown/privileged keys, the frontend tool has no DB access, and edited values are re-validated before reaching the form.

### 10. #476 — Chat: Show a Retry button when the first event search fails (62/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/476
- **Domain / type:** AI Concierge/Chat · Product feature · **Linear:** SAN-1554
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 10 files · +165/-31
- **User journey:** Fresh chat + events API 503: the error and Try again appear even with an empty transcript, and Retry re-runs the event search.
- **Tests + CI (actual):** floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook SUCCESS; Kilo left a COMMENTED review; no failed check.
- **Dependencies / overlap:** Same SAN-1554 area as merged #457 and #464 (both already changed `concierge-run-feedback.tsx` / `concierge-transcript-tail.tsx` / `concierge-error-store.ts`) → rebase before merge. Shares `chat-center-panel.tsx` with #406, `concierge-transcript-tail.tsx` with #248.
- **Recommended action:** Merge after rebase
- **Evidence / assessment:** Verified against origin/main: `chat-center-panel.tsx` mounts only `<WorkflowProgressStrip />` (line 54) and `concierge-transcript-tail.tsx` still mounts `<ConciergeRunFeedback />` (line 64) — so the empty-transcript gap this PR fixes is **still present on main** after #457/#464. Not superseded.

### 11. #402 — Let partners edit their own business profile (62/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/402
- **Domain / type:** Partners/Profile · Product feature · **Linear:** SAN-814
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 6 files · +460/-0
- **User journey:** A partner corrects business name/category/neighborhood/website/description instead of needing a database admin.
- **Tests + CI (actual):** floor, deterministic chromium, Codacy, Kilo, CodeRabbit SUCCESS; Kilo COMMENTED.
- **Dependencies / overlap:** Shares the partner `settings` JSONB with #403/#404 (no file overlap). No migration; relies on existing `partner_members` RLS.
- **Recommended action:** Merge
- **Evidence / assessment:** Server page resolves the partner through `partner_members` RLS with no client-supplied partner id; PATCH is Zod-validated partial merge, 401 unauthenticated / 404 no membership.

### 12. #400 — Give every partner one working assistant (62/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/400
- **Domain / type:** Partners/Workspace · Product feature · **Linear:** SAN-705, SAN-706
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 14 files · +291/-4
- **User journey:** A café/venue/host partner opens /partners/workspace and asks 'what do I do next?' in their own language.
- **Tests + CI (actual):** floor, deterministic chromium, Codacy, Kilo, CodeRabbit SUCCESS; Kilo COMMENTED.
- **Dependencies / overlap:** Stack base for #403 and #404. Shares `scripts/copilotkit-consumer-inventory.json` with #403 and `partner-agent.ts` with #403. No migration/new table.
- **Recommended action:** Merge first (stack base)
- **Evidence / assessment:** One `partnerAgent` registered in the single Mastra registry, CopilotKit allowlist and client agent union; partner context is server-derived with the user-scoped client (RLS decides visibility), no client-supplied partner id.

### 13. #461 — Events: Hide QA test events from public discovery and AI search (58/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/461
- **Domain / type:** Events/Discovery · Product feature · **Linear:** SAN-1561, SAN-1560, SAN-896
- **Status:** Open · MERGEABLE · UNSTABLE (no review decision) · floor FAILURE
- **Change size:** 13 files · +146/-15
- **User journey:** Visitors stop seeing 'QA DEMO' cards on /, /events, public detail URLs and AI search, while QA records stay in Supabase for admins.
- **Tests + CI (actual):** floor FAILURE (run 39415707247): `src/mastra/lib/__tests__/intelligence-event-search-errors.test.ts > throws when structured events query fails (not empty success)` — AssertionError expecting 'structured event query failed: permis…', got 'client.from(...).select(...).eq(...)'. This is inside this PR's own touched module (`intelligence-event-search.ts`) → real regression.
- **Dependencies / overlap:** Stacked on #453 (base branch is #453's head) — must rebase and merge after #453. Shares `list-published-events.ts` + its test with #453, `search-events.ts` with #467.
- **Recommended action:** Fix (own failing unit test + rebase on #453) → merge
- **Evidence / assessment:** Single shared QA-marker rule across homepage, lists, detail and structured/AI search; no deletion of QA data and no new publishing gate.

### 14. #324 — Write real rental prices and links into the WhatsApp reply (55/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/324
- **Domain / type:** AI Concierge/WhatsApp · Product feature · **Linear:** SAN-1444, SAN-1442
- **Status:** Open · CONFLICTING · DIRTY · REVIEW_REQUIRED
- **Change size:** 5 files · +402/-39
- **User journey:** WhatsApp renter asks for a furnished 2-bedroom under COP 3.5M/month and receives real titles, the listing's own monthly price, and a validated link instead of prose with no data.
- **Tests + CI (actual):** floor, deterministic chromium, Codacy, CodeRabbit SUCCESS at head; four review-comment threads from kilo + coderabbit + owner.
- **Dependencies / overlap:** Conflicts vs main. Shares `src/mastra/tools/search-rentals.ts` with #362 and #467, and `src/mastra/agents/concierge.ts` with #479 → merge #467/#479 first, then rebase this.
- **Recommended action:** Fix (rebase conflicts) → merge
- **Evidence / assessment:** Channel-correct root cause: the agent is told not to repeat card fields (web renders cards) but WhatsApp has no cards. Formatter is deterministic from the same `searchRentalsTool` output, never converts currencies, and renders unknown price as 'price on request'.

### 15. #482 — Database Tests: Allow Development Rentals in Search While Protecting Private Records (52/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/482
- **Domain / type:** Rentals/Discovery · DB tests · Tests/QA · **Linear:** SAN-1291, SAN-1502, SAN-468
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 3 files · +35/-35
- **User journey:** No user-facing change: ordinary pending/inactive development rentals become findable while private and test-fixture records stay hidden and cross-broker writes stay denied.
- **Tests + CI (actual):** supabase-acl, floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check.
- **Dependencies / overlap:** Corrects three tests (`dev_discovery_excludes_test_fixtures_test.sql`, `dev_enrichment_follows_listing_visibility_test.sql`, `san468_apartment_public_exposure_rls_test.sql`) that contradict merged #478's Phase-A behavior. No migration.
- **Recommended action:** Merge
- **Evidence / assessment:** Test-only truth correction for the same security invariant #484 implements; without it the red DB tests keep masking the real ACL state.

### 16. #483 — Chat Tests: Stop False Failures When Scrolling Through 500 Messages (48/100, P1)

- **URL:** https://github.com/amoai-tech/mdeai/pull/483
- **Domain / type:** Tests/QA · CI unblocker · Tests/QA · **Linear:** SAN-1357
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 1 files · +15/-14
- **User journey:** No user-facing change: the 500-message virtualization regression stops failing CI for unrelated PRs while still proving both ends are reachable.
- **Tests + CI (actual):** floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo all SUCCESS on this head — the only open PR that turns that flake green.
- **Dependencies / overlap:** **Highest-leverage PR on the board:** the same `e2e/chat-virtualization.spec.ts` failure is the sole red check on #471, #474, #480 and #456.
- **Recommended action:** Merge first (unblocks #456, #471, #474, #480)
- **Evidence / assessment:** Evidence it is the shared flake: runs 39455299255 (#474), 39434317221 (#471), 39445838084 (#480) and 39410522833 (#456) all fail on the identical test id `SAN-1357 · CopilotChatView virtualizes a 500-message conversation › both ends of the conversation are reachable by real scrolling`. One 29-line test-only fix removes four red PRs.

### 17. #480 — Restaurant Voting: Prevent a Second Vote While Checking an Existing Ballot (51/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/480
- **Domain / type:** Restaurants/Contests · Product feature · **Linear:** SAN-1357-adjacent (none parsed)
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE
- **Change size:** 2 files · +33/-2
- **User journey:** A returning signed-in voter cannot see an enabled Vote button before the saved-ballot check finishes (no second ballot).
- **Tests + CI (actual):** floor, Codacy, CodeRabbit, Kilo, auth-redirect chromium SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 chat-virtualization flake (run 39445838084 `✘ 30 e2e/chat-virtualization.spec.ts`) — unrelated to this diff.
- **Dependencies / overlap:** Fixable purely by merging #483 first and re-running. Touches only `restaurant-vote-panel.tsx` + one test — no overlap with other open PRs.
- **Recommended action:** Fix (rebase after #483) → merge
- **Evidence / assessment:** Starts the panel in `checking` instead of `idle` and gates the CTA on hydration + saved-vote read; server-side duplicate protection is unchanged.

### 18. #474 — Mobile: Make the Open Map button usable only when it is ready (48/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/474
- **Domain / type:** Mobile Maps/Chat · Product feature · **Linear:** SAN-1564
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE
- **Change size:** 2 files · +42/-0
- **User journey:** On a phone, a fast tap on Open map is either disabled or actually works — never a painted-but-dead button.
- **Tests + CI (actual):** floor, deterministic Maps contracts, auth-redirect chromium, Codacy, Kilo, CodeRabbit SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 flake (run 39455299255).
- **Dependencies / overlap:** Same epic as #473 (test for the historical appendChild crash) — complementary. Shares `package.json` with #473/#455/#248/#256; no overlap with #471's script.
- **Recommended action:** Fix (rebase after #483) → merge
- **Evidence / assessment:** Uses `useSyncExternalStore` for a hydration flag so server HTML renders `disabled` and hydration enables it — no effect/set-state loop, 42 lines.

### 19. #405 — Rentals: Explain Why Apartments Match in Everyday Language (48/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/405
- **Domain / type:** AI Concierge/Rentals · Product feature · **Linear:** SAN-1534
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 2 files · +41/-3
- **User journey:** 'Why these rentals' reads 'Limited to Laureles' instead of `hybrid_semantic: hybrid_search_listings RPC`.
- **Tests + CI (actual):** floor, deterministic chromium, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; no failed check.
- **Dependencies / overlap:** No file overlap. Copy-only translation of existing ranking reasons; ranking and inventory untouched.
- **Recommended action:** Merge
- **Evidence / assessment:** Presentation-only change in `search-tool-result-cards.tsx` with a matching test; lowest-risk user-visible improvement still open.

### 20. #481 — Accessibility: Make Skip to Main Content Work on Contest and Login Pages (46/100, P2)

- **URL:** https://github.com/amoai-tech/mdeai/pull/481
- **Domain / type:** Accessibility/Shell · Product feature · **Linear:** —
- **Status:** Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED)
- **Change size:** 5 files · +17/-6
- **User journey:** Keyboard-only visitor presses Skip to main content on contests, contest detail, restaurant voting detail or login and focus lands on the real content.
- **Tests + CI (actual):** floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo SUCCESS; new `e2e/san-1524-contests.spec.ts` keyboard check included.
- **Dependencies / overlap:** No Linear id in branch/title/body. No overlap with other open PRs.
- **Recommended action:** Merge
- **Evidence / assessment:** Verified on origin/main: `src/app/contests/page.tsx:185` renders `<main … data-testid="contests-page">` with **no** `id="main-content"`, and `src/app/login/page.tsx:26` likewise — the root-layout skip link is genuinely broken on four routes. 17 lines fixes it.

## Collision map (files touched by ≥2 open PRs)

Computed from `gh pr diff --name-only` across all 43 heads.

| File | PRs |
| --- | --- |
| `package.json` | #248, #256, #455, #471, #473 |
| `.gitignore` | #100, #214, #234 |
| `playwright.config.ts` | #238, #248, #473 |
| `src/mastra/tools/search-rentals.ts` | #324, #362, #467 |
| `.github/workflows/codacy-coverage.yml` | #100, #214 |
| `scripts/copilotkit-consumer-inventory.json` | #400, #403 |
| `scripts/function-acl-baseline.json` | #255, #459 |
| `src/components/chat/chat-center-panel.tsx` | #406, #476 |
| `src/components/chat/concierge-transcript-tail.tsx` | #248, #476 |
| `src/components/onboarding/onboarding-ai-suggestion-card.tsx` | #403, #404 |
| `src/components/partners/partner-signup-assistant.tsx` | #403, #404 |
| `src/components/partners/partner-signup-wizard.tsx` | #403, #404 |
| `src/components/rentals/rental-detail-view.tsx` | #362, #367 |
| `src/lib/events/__tests__/list-published-events.test.ts` | #453, #461 |
| `src/lib/events/list-published-events.ts` | #453, #461 |
| `src/lib/onboarding/ai-suggestion.ts` | #403, #404 |
| `src/lib/supabase/database.types.ts` | #244, #248 |
| `src/mastra/agents/concierge.ts` | #324, #479 |
| `src/mastra/agents/partner-agent.ts` | #400, #403 |
| `src/mastra/tools/search-events.ts` | #461, #467 |
| `supabase/tests/database/san1284c_trigger_internal_function_acls_test.sql` | #456, #459 |
| `supabase/tests/database/sb002_live_only_recovery_test.sql` | #456, #459 |

Cross-PR collision with **already-merged** main commits (conflict risk not visible in `gh pr view` until rebase):

| PR | File shared with main | Merged source |
| --- | --- | --- |
| #459 | `supabase/functions/approval-commit/index.ts` | #454 (2026-10-20T10:49Z) |
| #459, #456 | `scripts/function-acl-baseline.json`, `supabase/tests/database/san1304a_*`, `sb002_live_only_recovery_test.sql` | #475 (2026-10-20T15:02Z) |
| #456 | migration version prefix `20261021030000` | #454 → `20261021030000_san1548_event_approval_id.sql` (**hard collision**) |
| #476 | `chat-center-panel.tsx`, `concierge-run-feedback.tsx`, `concierge-transcript-tail.tsx`, `concierge-error-store.ts` | #457, #464 |
| #461 | `list-published-events.ts` | #453 (stack base, open) |
| #471 | `scripts/vercel-release-control.mjs`, `.github/workflows/prod-deploy-freshness.yml` purpose | #416 (+ SAN-1330 tooling) |
| #313 | `docs/07-operations/merge-approval-history.md` | #466 (2026-10-20T13:58Z) |

## Superseded / duplicate / already-satisfied analysis vs `origin/main` 5d1d76ddf6

| PR | Disposition | Proof |
| --- | --- | --- |
| #256 shell-quote pin | **Already satisfied by main** — close | `git show origin/main:package.json` → `"shell-quote": ">=1.11.0"`; `git show origin/main:package-lock.json` → `node_modules/shell-quote` = `1.12.0`; floor green on main |
| #447 inline Ask MDE | **Superseded by merged #445** — close | #445 merged 2026-10-20T14:45:06Z with `rental-ask-composer.tsx` + `rental-browse-view.tsx`; `src/components/rentals/rental-inline-ask.tsx` is absent from origin/main and the draft now CONFLICTS |
| #255 ticket QR consume | **Subsumed by open #456** — close | `gh pr diff 456` revokes `ticket_validate_consume(text)` from anon+authenticated and grants `service_role`, plus `ticket_payment_refund_v2`, `record_check_in`, anon event-write grants |
| #100 Codacy coverage | **Superseded by open #214** — close | Both add `.github/workflows/codacy-coverage.yml`; origin/main already ships `.codacy.yml`; #214 has a green `Report coverage to Codacy` run, #100 is 31 days CONFLICTING |
| #238 rental restart cert | **Disposition: draft, coverage now via merged #396/#429** — close | Writes/deletes real production identities by design; CONFLICTING; merged #396 proves the live renter viewing journey and #429 keeps failure evidence |
| #362 provenance badges | **Owner-deferred draft** — close or park | Body: “DRAFT · DEFERRED — NOT A CURRENT DEVELOPMENT PRIORITY … do not merge this PR until the owner reprioritizes it.” |
| #452 PR-Agent probe | **Never intended to merge** — close | Body: “Never merge.” Unreferenced module, purpose served. |
| #471 freshness check | **Partial duplicate of shipped tooling** — defer/combine | origin/main already has `prod-deploy-freshness.yml` (SAN-1360), `src/app/api/version/route.ts` and `scripts/vercel-release-control.mjs` (#416). Only the `--claimed <sha>` check is new. |
| #476 first-search retry | **NOT superseded** — still needed | origin/main `chat-center-panel.tsx:54` mounts only `<WorkflowProgressStrip />`; `concierge-transcript-tail.tsx:64` still mounts `<ConciergeRunFeedback />`, i.e. the empty-transcript gap remains |

## Final shortlists

### Merge now (all checks green; review is the only remaining gate)
#394, #405, #481, #400, #402, #482, #367, #467, #455, #420, #406, #387, #373, #234, #389, #313*, #214*. (*#313 and #214 want a rebase first; #214 also retires #100.)

### Merge first — unification work (highest leverage)
1. **#483** — 29-line test-only fix that turns `deterministic chromium` green on #456, #471, #474, #480.
2. **#453** — only green PR that unblocks the #461 stack.
3. **#400 → #403 → #404** — partner stack, must land in that order (bases point at each other).

### Fix then merge
| PR | Required fix |
| --- | --- |
| **#456** | **Renumber migration** past main's `20261021030000` (SAN-1548) → `20261021090000`+; rebase over #475's ACL test/baseline changes |
| **#459** | Rebase over merged #454 (`approval-commit/index.ts`) and #475 (`function-acl-baseline.json`, `san1304a`, `sb002`); re-run the failing `review / review` check |
| **#484**, **#473** | Re-run `supabase-acl` once the base-branch drill is green (identical signature on a PR with no SQL proves it is not the diff) |
| **#461** | Fix its own `intelligence-event-search-errors.test.ts` assertion, then rebase on #453 |
| **#480**, **#474** | Rebase after #483 lands, re-run `deterministic chromium` |
| **#364** | Undraft + rebase; merge alongside #484 (same SAN-1502 epic, different authority) |
| **#479** | Run the documented three-turn preview replay (Laureles → under 3M → balcony) |

### Combine
- **#255 → #456**: one ACL migration for the ticket RPC family instead of two.
- **#100 → #214**: one coverage workflow.
- **#471 → existing release tooling** (`scripts/vercel-release-control.mjs` + `prod-deploy-freshness.yml`) rather than a second freshness probe.
- **#476** should be rebased onto the merged #457/#464 run-feedback code rather than re-introducing parallel feedback components.

### Defer / investigate
- **#244** — draft foundation, 1,540 lines, wizard not wired, includes a partner-type enum migration.
- **#248** — 33 files / 805 lines, 15 days CONFLICTING; the engine shipped in #241 but the chat surface is missing, so it is real work that needs a split, not a close.
- **#324** — real WhatsApp gap; blocked only by rebase conflicts against #467/#479 paths.
- **#376** — dependency #372 already merged; only a rebase against a moved `main` remains.

### Close
| PR | Reason |
| --- | --- |
| #256 | Already satisfied on main (shell-quote 1.12.0 resolved; override >=1.11.0) |
| #447 | Superseded by merged #445 |
| #255 | Subsumed by #456 |
| #100 | Superseded by #214 |
| #238 | Draft harness; product coverage delivered by merged #396/#429 |
| #362 | Owner-deferred draft |
| #452 | Never intended to merge |

### Dependency chain (do not merge out of order)
```text
#483 (test flake) ─┬─> #456 (renumber migration) ──> #459 (rebase)
                  ├─> #471 , #474 , #480
#400 ──> #403 ──> #404
#453 ──> #461
#467 , #479 ──> #324
#484 ──> #364   (same SAN-1502 epic)
```

## Per-PR sub-scores (machine-readable in `pr-data.json`)

| PR | User impact /30 | Unlocks journey /25 | Security /20 | Reuse /10 | Effort-value /10 | Dependency /5 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #459 | 28 | 25 | 19 | 6 | 5 | 4 | **87** |
| #456 | 20 | 22 | 20 | 8 | 8 | 3 | **81** |
| #484 | 22 | 22 | 18 | 8 | 6 | 4 | **80** |
| #394 | 20 | 18 | 19 | 8 | 6 | 3 | **74** |
| #453 | 22 | 20 | 8 | 8 | 8 | 4 | **70** |
| #479 | 20 | 18 | 8 | 8 | 7 | 4 | **65** |
| #476 | 20 | 18 | 8 | 7 | 6 | 3 | **62** |
| #483 | 6 | 18 | 0 | 9 | 10 | 5 | **48** |
| #364 | 18 | 16 | 16 | 7 | 6 | 3 | **66** |
| #404 | 18 | 15 | 14 | 7 | 6 | 5 | **65** |
| #403 | 18 | 15 | 14 | 7 | 6 | 4 | **64** |
| #402 | 18 | 14 | 12 | 8 | 7 | 3 | **62** |
| #400 | 18 | 15 | 10 | 7 | 7 | 5 | **62** |
| #461 | 20 | 15 | 8 | 6 | 5 | 4 | **58** |
| #324 | 20 | 16 | 6 | 6 | 5 | 2 | **55** |
| #482 | 6 | 14 | 12 | 8 | 9 | 3 | **52** |
| #480 | 16 | 14 | 4 | 7 | 8 | 2 | **51** |
| #405 | 16 | 12 | 2 | 8 | 9 | 1 | **48** |
| #474 | 14 | 12 | 2 | 8 | 10 | 2 | **48** |
| #481 | 14 | 12 | 2 | 7 | 10 | 1 | **46** |
| #376 | 16 | 12 | 6 | 7 | 6 | 3 | **50** |
| #248 | 18 | 14 | 8 | 5 | 3 | 2 | **50** |
| #367 | 16 | 12 | 4 | 7 | 8 | 2 | **49** |
| #373 | 8 | 6 | 14 | 8 | 8 | 2 | **46** |
| #455 | 8 | 12 | 8 | 7 | 7 | 3 | **45** |
| #406 | 14 | 10 | 2 | 8 | 9 | 1 | **44** |
| #473 | 8 | 12 | 6 | 6 | 7 | 4 | **43** |
| #387 | 8 | 10 | 4 | 8 | 9 | 3 | **42** |
| #467 | 8 | 10 | 2 | 8 | 9 | 2 | **39** |
| #420 | 6 | 14 | 2 | 6 | 8 | 2 | **38** |
| #244 | 14 | 10 | 10 | 6 | 4 | 2 | **46** |
| #234 | 4 | 4 | 12 | 8 | 9 | 1 | **38** |
| #389 | 4 | 8 | 4 | 8 | 10 | 2 | **36** |
| #214 | 6 | 6 | 6 | 7 | 8 | 1 | **34** |
| #471 | 8 | 6 | 2 | 6 | 5 | 2 | **29** |
| #313 | 6 | 2 | 6 | 7 | 7 | 1 | **29** |
| #255 | 16 | 18 | 18 | 6 | 4 | 2 | **64** |
| #447 | 8 | 6 | 2 | 4 | 3 | 1 | **24** |
| #238 | 4 | 6 | 2 | 5 | 5 | 1 | **23** |
| #362 | 6 | 2 | 2 | 4 | 6 | 1 | **21** |
| #256 | 2 | 2 | 4 | 3 | 6 | 1 | **18** |
| #100 | 2 | 2 | 2 | 3 | 5 | 1 | **15** |
| #452 | 2 | 1 | 0 | 2 | 3 | 0 | **8** |

## Not re-verified (stated honestly)

- Preview deployments, live Gemini/Stripe/Maps providers and signed-in browser flows were **not** re-run by this audit; PR bodies' own verification claims are reported as claims, not as audit proof.
- `Unknown` check state applies only where a check never ran on a head; every check cell above is copied from `gh pr checks <n>` output, not inferred.
- `supabase-acl` on #484/#473: the failing suite **names** are not printed by the workflow, so the exact three suites are unidentified; only the identical failure counts across a SQL-carrying and a SQL-free PR are cited.
