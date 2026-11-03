# MDE AI — Evidence Appendix

**Part of the canonical plan:** [MDE AI — Product Roadmap, PR Value Review & Development Progress Tracker](02-master-plan-product-roadmap-pr-audit-progress-tracker.md)
**Audit date:** 2026-10-21 · **Baseline:** `origin/main` `5d1d76ddf6c26ca8996c4e121a87b584c3a2971b`

This appendix holds the detailed inventories the main plan summarises. It is evidence, not a second roadmap. Every table was generated from the live sources named in each section; tests were inventoried and CI results read, not re-executed.

---

## Appendix A — Full PR inventory (43)

Source: `gh pr list/view/checks/diff` against `amoai-tech/mdeai`, baseline `origin/main` `5d1d76ddf6`. Value rubric: user impact 30 · unlocks journey 25 · security/data correctness 20 · reuse/simplicity 10 · effort vs value 10 · dependency leverage 5. Sub-scores are in `_work/pr-data.json`; each row's sub-scores sum to its total.

### A.1 Inventory and value

Sub-scores: `data/pr-data.json`. Per-PR file paths and line counts: `data/pr-files.json`. Full narrative evidence: `_work/pr-inventory.md`. **None of these PRs is deployed:** production serves `main` HEAD, so every open PR is unshipped work.

| Priority | PR | Exact title | Domain | Type | Status | Linear | Value /100 | Action | Purpose (user outcome) |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| P1 | [#459](https://github.com/amoai-tech/mdeai/pull/459) | Events: Publish once with safe retries and correct ticket amounts | Events/Ticketing · Payments | Product feature | Checks failing | SAN-1285, SAN-1548, SAN-582 | **87** | Fix (rebase on 5d1d76ddf6, re-run review check) → merge | Host publishes an event once; retry/reload returns the same event + tiers; COP 40,000 reaches Stripe as 4,000,000 minor units. |
| P1 | [#456](https://github.com/amoai-tech/mdeai/pull/456) | SAN-1562 · Stop Fake Ticket Refunds and Check-Ins | Events/Ticketing · Payments | Security | Checks failing | SAN-1562, SAN-1284, SAN-1357, SAN-757 | **81** | Fix (renumber migration + rebase) → merge | A signed-in user must not be able to fake a refund, consume someone else's QR, or call check-in RPCs directly; anon loses event write grants. |
| P1 | [#484](https://github.com/amoai-tech/mdeai/pull/484) | Let renters request pending development apartments without exposing test fixtures | Rentals/Viewings | Product feature | Checks failing | SAN-1502, SAN-1286, SAN-1206, SAN-1105, SAN-1349, SAN-1449 | **80** | Fix (re-run supabase-acl once base is green) → merge | Renter opens a pending Phase-A development listing and the Request-viewing path works; active test fixtures and private listings stop being bookable. |
| P1 | [#394](https://github.com/amoai-tech/mdeai/pull/394) | Venue Inquiries: Save Each Lead Once and Keep Contact Details Private | Partners/Venue leads | Security | Review blocked | SAN-882 | **74** | Merge | A venue owner retries a dropped inquiry and gets the same saved reference — not a duplicate lead — and their email never reaches server logs. |
| P1 | [#453](https://github.com/amoai-tech/mdeai/pull/453) | MDE Events — Show real ticket prices and only valid Buy actions | Events/Discovery | Product feature | Review blocked | SAN-1560, SAN-1285, SAN-178, SAN-974 | **70** | Merge (then rebase #461) | Visitor sees 'From $40,000 COP' from the real cheapest tier instead of 'Free', and no Buy button when no tier is purchasable. |
| P1 | [#479](https://github.com/amoai-tech/mdeai/pull/479) | Rentals: Keep the same apartments visible during follow-up questions | AI Concierge/Rentals | Product feature | Review blocked | SAN-1421 | **65** | Fix (run the documented preview replay) → merge | Renter asks 'any with a balcony?' after seeing rentals and the concierge answers from the shown rows (says 'not specified' when absent) instead of re-searching or inventing. |
| P1 | [#476](https://github.com/amoai-tech/mdeai/pull/476) | Chat: Show a Retry button when the first event search fails | AI Concierge/Chat | Product feature | Review blocked | SAN-1554 | **62** | Merge after rebase | Fresh chat + events API 503: the error and Try again appear even with an empty transcript, and Retry re-runs the event search. |
| P1 | [#483](https://github.com/amoai-tech/mdeai/pull/483) | Chat Tests: Stop False Failures When Scrolling Through 500 Messages | Tests/QA · CI unblocker | Tests/QA | Review blocked | SAN-1357 | **48** | Merge first (unblocks #456, #471, #474, #480) | No user-facing change: the 500-message virtualization regression stops failing CI for unrelated PRs while still proving both ends are reachable. |
| P2 | [#364](https://github.com/amoai-tech/mdeai/pull/364) | Rental Publishing: Block Unauthorized Brokers and Keep Original Publish Dates | Rentals/Publishing | Security | Draft | SAN-1502 | **66** | Fix (undraft + rebase) → merge after #484 | Broker B cannot publish Broker A's listing when the owner field is blank; a repeat publish keeps the original published_at. |
| P2 | [#404](https://github.com/amoai-tech/mdeai/pull/404) | Autofill a partner profile from their business website | Partners/Onboarding | Product feature | Green | SAN-1193, SAN-709 | **65** | Merge in stack order after #400, #403 | Partner pastes their website, reviews extracted business facts with sources, and only accepted values are persisted. |
| P2 | [#403](https://github.com/amoai-tech/mdeai/pull/403) | Let partners review AI signup suggestions before applying them | Partners/Onboarding | Product feature | Green | SAN-709, SAN-1193, SAN-705 | **64** | Merge after #400 | Partner sees AI-suggested signup fields as Accept/Edit/Ignore; nothing is written until the existing activation API runs. |
| P2 | [#402](https://github.com/amoai-tech/mdeai/pull/402) | Let partners edit their own business profile | Partners/Profile | Product feature | Review blocked | SAN-814 | **62** | Merge | A partner corrects business name/category/neighborhood/website/description instead of needing a database admin. |
| P2 | [#400](https://github.com/amoai-tech/mdeai/pull/400) | Give every partner one working assistant | Partners/Workspace | Product feature | Review blocked | SAN-705, SAN-706 | **62** | Merge first (stack base) | A café/venue/host partner opens /partners/workspace and asks 'what do I do next?' in their own language. |
| P2 | [#461](https://github.com/amoai-tech/mdeai/pull/461) | Events: Hide QA test events from public discovery and AI search | Events/Discovery | Product feature | Checks failing | SAN-1561, SAN-1560, SAN-896 | **58** | Fix (own failing unit test + rebase on #453) → merge | Visitors stop seeing 'QA DEMO' cards on /, /events, public detail URLs and AI search, while QA records stay in Supabase for admins. |
| P2 | [#324](https://github.com/amoai-tech/mdeai/pull/324) | Write real rental prices and links into the WhatsApp reply | AI Concierge/WhatsApp | Product feature | Conflicting | SAN-1444, SAN-1442 | **55** | Fix (rebase conflicts) → merge | WhatsApp renter asks for a furnished 2-bedroom under COP 3.5M/month and receives real titles, the listing's own monthly price, and a validated link instead of prose with no data. |
| P2 | [#482](https://github.com/amoai-tech/mdeai/pull/482) | Database Tests: Allow Development Rentals in Search While Protecting Private Records | Rentals/Discovery · DB tests | Tests/QA | Review blocked | SAN-1291, SAN-1502, SAN-468 | **52** | Merge | No user-facing change: ordinary pending/inactive development rentals become findable while private and test-fixture records stay hidden and cross-broker writes stay denied. |
| P2 | [#480](https://github.com/amoai-tech/mdeai/pull/480) | Restaurant Voting: Prevent a Second Vote While Checking an Existing Ballot | Restaurants/Contests | Product feature | Checks failing | SAN-1357-adjacent (none parsed) | **51** | Fix (rebase after #483) → merge | A returning signed-in voter cannot see an enabled Vote button before the saved-ballot check finishes (no second ballot). |
| P2 | [#405](https://github.com/amoai-tech/mdeai/pull/405) | Rentals: Explain Why Apartments Match in Everyday Language | AI Concierge/Rentals | Product feature | Review blocked | SAN-1534 | **48** | Merge | 'Why these rentals' reads 'Limited to Laureles' instead of `hybrid_semantic: hybrid_search_listings RPC`. |
| P2 | [#474](https://github.com/amoai-tech/mdeai/pull/474) | Mobile: Make the Open Map button usable only when it is ready | Mobile Maps/Chat | Product feature | Checks failing | SAN-1564 | **48** | Fix (rebase after #483) → merge | On a phone, a fast tap on Open map is either disabled or actually works — never a painted-but-dead button. |
| P2 | [#481](https://github.com/amoai-tech/mdeai/pull/481) | Accessibility: Make Skip to Main Content Work on Contest and Login Pages | Accessibility/Shell | Product feature | Review blocked | — | **46** | Merge | Keyboard-only visitor presses Skip to main content on contests, contest detail, restaurant voting detail or login and focus lands on the real content. |
| P3 | [#376](https://github.com/amoai-tech/mdeai/pull/376) | Rental Partners: Help Brokers Sign Up or Contact MDE | Partners/Marketing | Product feature | Conflicting | SAN-691, SAN-693 | **50** | Fix (rebase on main) → merge | A Medellín broker reaches a real /partners/rentals landing with 'Sign up as a rental broker' and a contact path instead of a coming-soon stub. |
| P3 | [#248](https://github.com/amoai-tech/mdeai/pull/248) | Let buyers ask for new condos in chat and see verified project cards | AI Concierge/New projects | Product feature | Conflicting | SAN-1380 | **50** | Fix (rebase; 33 files/805 lines needs a split) | Buyer asks 'Show me new 2-bedroom projects' in /chat and gets grounded project cards with price/bedrooms/delivery/source, or an honest zero-match answer. |
| P3 | [#367](https://github.com/amoai-tech/mdeai/pull/367) | Rental Details: Remove Broken Buttons and Keep Mobile Viewing Accessible | Rentals/Details | Product feature | Review blocked | SAN-479 | **49** | Merge | On a phone the misleading Ask-a-question/Save buttons disappear and Request viewing clears the home indicator. |
| P3 | [#373](https://github.com/amoai-tech/mdeai/pull/373) | Stop Fake Clean Reviews From Hiding Security Problems | Review tooling/CI integrity | Infrastructure | Review blocked | SAN-1332, SAN-1312 | **46** | Merge | A code block inside a PR review that says 'no issues' can no longer override a real high-severity finding in PR-Agent scoring. |
| P3 | [#455](https://github.com/amoai-tech/mdeai/pull/455) | QA: Clean up broker accounts and rental drafts after onboarding tests | Tests/QA · E2E hygiene | Tests/QA | Review blocked | SAN-677, SAN-1092 | **45** | Merge | A developer runs broker onboarding E2E; passing or failing, it deletes only its own listings/profile/identity and fails loudly if cleanup fails. |
| P3 | [#406](https://github.com/amoai-tech/mdeai/pull/406) | Chat: Suggest Monthly COP Rent Instead of Nightly USD | AI Concierge/Chat | Product feature | Review blocked | SAN-1508, SAN-1059 | **44** | Merge (do not mark SAN-1508 Done) | New renter's chat welcome example reads '1BR in Laureles under COP 3,000,000/month' instead of '$80/night'. |
| P3 | [#473](https://github.com/amoai-tech/mdeai/pull/473) | Mobile Map Tests: Catch Crashes When Opening and Closing Google Maps | Tests/QA · Mobile Maps | Tests/QA | Checks failing | SAN-1564 | **43** | Fix (ACL suite once base is green) → merge | No production code change: a real-Google-Maps smoke suite reopens the mobile map repeatedly and fails if pins vanish or an appendChild error returns. |
| P3 | [#387](https://github.com/amoai-tech/mdeai/pull/387) | CI: Stop Routine Tests From Spending Gemini Credits | CI/Test infrastructure | Infrastructure | Review blocked | SAN-1536 | **42** | Merge | A developer editing homepage copy no longer fails CI because the Gemini account has no prepaid balance. |
| P3 | [#467](https://github.com/amoai-tech/mdeai/pull/467) | AI Search: Prevent Mastra startup loops across rentals, events, and restaurants | Mastra/Infrastructure | Infrastructure | Review blocked | SAN-583 | **39** | Merge | No user-facing change: `mastra dev` stops printing circular-dependency warnings for all three search domains. |
| P3 | [#420](https://github.com/amoai-tech/mdeai/pull/420) | Events Tests: Accept an Honest 'No Events Found' Result | Tests/QA · Prod journey | Tests/QA | Review blocked | SAN-546 | **38** | Merge | A correct empty-event answer stops failing the production J09 journey while the populated branch still asserts a card and Buy path. |
| P4 | [#244](https://github.com/amoai-tech/mdeai/pull/244) | Let property owners and brokers save onboarding progress and resume later | Partners/Onboarding | Product feature | Draft | SAN-1391, SAN-1107 | **46** | Defer (draft, unwired, enum migration) | Owner/broker leaves mid-onboarding and resumes from a validated draft instead of losing answers. |
| P4 | [#234](https://github.com/amoai-tech/mdeai/pull/234) | chore: configure Infisical secret management | Secrets/Ops | Infrastructure | Checks failing | — | **38** | Merge (advisory Kilo failure does not gate) | Developers get one pinned Infisical project config and `*.env` files cannot be committed by accident. |
| P4 | [#389](https://github.com/amoai-tech/mdeai/pull/389) | AI Chat Tests: Restore Temporary Settings After Every Test | Tests/QA | Tests/QA | Review blocked | SAN-1537 | **36** | Merge | No user-facing change: one chat test can no longer leak `COPILOTKIT_TELEMETRY_DISABLED` into the next test in the process. |
| P4 | [#214](https://github.com/amoai-tech/mdeai/pull/214) | ci: restore Codacy coverage reporting | CI/Coverage | Infrastructure | Review blocked | — | **34** | Merge (supersedes #100) | Developers see PR coverage again (JS + TS partial reports finalised per PR) without touching the required floor gate. |
| P4 | [#471](https://github.com/amoai-tech/mdeai/pull/471) | Releases: Check the live website version before reporting a deployment | Release/Ops tooling | Infrastructure | Checks failing | — | **29** | Defer / combine with existing release tooling | A teammate can prove whether 'Feature X is live' matches the commit production actually serves, and can flag a stale claim with exit 1. |
| P4 | [#313](https://github.com/amoai-tech/mdeai/pull/313) | Record missing reviews for PR #310 and PR #312 | Operations docs | Documentation | Review blocked | SAN-1486 | **29** | Merge after rebase | Auditors can see that #310 and #312 merged without an approving review, what GitHub proves, and what follow-up is required. |
| P5 | [#255](https://github.com/amoai-tech/mdeai/pull/255) | Stop anyone with a ticket's QR from marking it used before the door scan | Events/Ticketing · DB ACL | Security | Checks failing | SAN-1284, SAN-1289, SAN-1350, SAN-1427 | **64** | Close (incorporated into #456) | Only the door-scan service can mark a QR ticket used; a buyer (or someone who glimpsed the QR) can no longer consume it directly. |
| P5 | [#447](https://github.com/amoai-tech/mdeai/pull/447) | Rentals: Ask MDE on the listings page without losing the map | Rentals/Discovery | Product feature | Draft | SAN-1421, SAN-386 | **24** | Close (superseded by merged #445) | Renter asks 'Show furnished two-bedroom places' on /rentals and cards + pins update in place without leaving the map. |
| P5 | [#238](https://github.com/amoai-tech/mdeai/pull/238) | Certify the rental chat restart in production (finds a budget-persistence gap) | Tests/QA · Prod certification | Tests/QA | Draft | SAN-548 | **23** | Close (disposition: draft; coverage now provided by merged #396/#429) | Two-phase opt-in production harness that proves a rental chat survives a real Vercel redeploy (writes to production data by design). |
| P5 | [#362](https://github.com/amoai-tech/mdeai/pull/362) | Rental Listings: Show Original Advertisers and Source-Check Status (Deferred) | Rentals/Provenance | Product feature | Draft | SAN-1235, SAN-1503 | **21** | Close (owner-deferred draft) or keep parked off the merge queue | Renter could see the original advertiser and 'Not yet checked' freshness on cards and Details (deferred by the owner). |
| P5 | [#256](https://github.com/amoai-tech/mdeai/pull/256) | Patch the critical shell-quote advisory so CI can pass | Dependency/CI | Infrastructure | Conflicting | — | **18** | Close (already satisfied on main) | No user-facing change: pins `shell-quote` to 1.12.0 so the critical advisory stops failing `floor`. |
| P5 | [#100](https://github.com/amoai-tech/mdeai/pull/100) | Add Codacy coverage reporting to CI | CI/Coverage | Infrastructure | Conflicting | — | **15** | Close (superseded by #214) | Same outcome as #214: PR-level JS/TS coverage in Codacy without changing the floor gate. |
| P5 | [#452](https://github.com/amoai-tech/mdeai/pull/452) | TEST ONLY: PR-Agent must detect reversed access check in isolated probe | Review tooling | Tests/QA | Draft | — | **8** | Close (never intended to merge) | None for users: an unreferenced TypeScript function with a deliberately reversed confidentiality check used to exercise PR-Agent. |

### A.2 CI and merge-gate detail (non-green, conflicting, or review-blocked heads)

#403 and #404 are omitted here because they are `CLEAN` with all checks green and no review submitted; their status is in A.1. Every other open head is listed below with its exact failing/blocking evidence.


| PR | Status | Tests + CI evidence |
| --- | --- | --- |
| [#459](https://github.com/amoai-tech/mdeai/pull/459) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · `review / review` FAILURE | floor SUCCESS, supabase-acl SUCCESS, deterministic chromium SUCCESS, Codacy SUCCESS; `review / review` FAILURE (PR-Agent run 39424285473 aborted with 'Version evidence: NEEDS VERIFICATION / Evidence generation failed') → advisory reviewer infra failure, not a code finding. |
| [#456](https://github.com/amoai-tech/mdeai/pull/456) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | supabase-acl SUCCESS, floor SUCCESS, Codacy SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 `chat-virtualization.spec.ts` first-row flake (run 39410522833 → `✘ 30 … both ends of the conversation are reachable by real scrolling`), not this PR's SQL. |
| [#484](https://github.com/amoai-tech/mdeai/pull/484) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · supabase-acl FAILURE | floor SUCCESS, deterministic chromium SUCCESS, Codacy SUCCESS; `supabase-acl` FAILURE (run 39460687384: pgTAP 3 suites, 2/14 + 6/15 + 7/25 failing). The **identical three-suite signature** appears on #473 (run 39450246434), which contains no SQL at all → the failure is base-branch/live-schema drift, not proof this migration is wrong. Still not green. |
| [#394](https://github.com/amoai-tech/mdeai/pull/394) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, supabase-acl, Codacy, CodeRabbit, Kilo all SUCCESS; no failed check on this head. |
| [#453](https://github.com/amoai-tech/mdeai/pull/453) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#479](https://github.com/amoai-tech/mdeai/pull/479) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook all SUCCESS; no failed check. |
| [#476](https://github.com/amoai-tech/mdeai/pull/476) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook SUCCESS; Kilo left a COMMENTED review; no failed check. |
| [#483](https://github.com/amoai-tech/mdeai/pull/483) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo all SUCCESS on this head — the only open PR that turns that flake green. |
| [#364](https://github.com/amoai-tech/mdeai/pull/364) | Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, supabase-acl, deterministic chromium, Codacy, authenticated restaurant vote all SUCCESS; no failed check. |
| [#402](https://github.com/amoai-tech/mdeai/pull/402) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, Kilo, CodeRabbit SUCCESS; Kilo COMMENTED. |
| [#400](https://github.com/amoai-tech/mdeai/pull/400) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, Kilo, CodeRabbit SUCCESS; Kilo COMMENTED. |
| [#461](https://github.com/amoai-tech/mdeai/pull/461) | Open · MERGEABLE · UNSTABLE (no review decision) · floor FAILURE | floor FAILURE (run 39415707247): `src/mastra/lib/__tests__/intelligence-event-search-errors.test.ts > throws when structured events query fails (not empty success)` — AssertionError expecting 'structured event query failed: permis…', got 'client.from(...).select(...).eq(...)'. This is inside this PR's own touched module (`intelligence-event-search.ts`) → real regression. |
| [#324](https://github.com/amoai-tech/mdeai/pull/324) | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED | floor, deterministic chromium, Codacy, CodeRabbit SUCCESS at head; four review-comment threads from kilo + coderabbit + owner. |
| [#482](https://github.com/amoai-tech/mdeai/pull/482) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | supabase-acl, floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#480](https://github.com/amoai-tech/mdeai/pull/480) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | floor, Codacy, CodeRabbit, Kilo, auth-redirect chromium SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 chat-virtualization flake (run 39445838084 `✘ 30 e2e/chat-virtualization.spec.ts`) — unrelated to this diff. |
| [#405](https://github.com/amoai-tech/mdeai/pull/405) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#474](https://github.com/amoai-tech/mdeai/pull/474) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | floor, deterministic Maps contracts, auth-redirect chromium, Codacy, Kilo, CodeRabbit SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 flake (run 39455299255). |
| [#481](https://github.com/amoai-tech/mdeai/pull/481) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo SUCCESS; new `e2e/san-1524-contests.spec.ts` keyboard check included. |
| [#376](https://github.com/amoai-tech/mdeai/pull/376) | Open · CONFLICTING · DIRTY · no review decision | floor, Codacy, CodeRabbit, Kilo SUCCESS at head; branch is CONFLICTING against main. |
| [#248](https://github.com/amoai-tech/mdeai/pull/248) | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED | floor, deterministic chromium, supabase-acl, deterministic Maps contracts, Codacy, CodeRabbit SUCCESS at head; 15 days stale and CONFLICTING. |
| [#367](https://github.com/amoai-tech/mdeai/pull/367) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#373](https://github.com/amoai-tech/mdeai/pull/373) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#455](https://github.com/amoai-tech/mdeai/pull/455) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, supabase-acl, deterministic chromium, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#406](https://github.com/amoai-tech/mdeai/pull/406) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#473](https://github.com/amoai-tech/mdeai/pull/473) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · supabase-acl FAILURE | floor, deterministic chromium, deterministic Maps contracts, Codacy, Kilo, CodeRabbit, GitBook SUCCESS; `supabase-acl` FAILURE with the same 2/14 + 6/15 + 7/25 signature as #484. This PR contains **no SQL** → the red ACL suite is base-branch drift, not this diff. |
| [#387](https://github.com/amoai-tech/mdeai/pull/387) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#467](https://github.com/amoai-tech/mdeai/pull/467) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#420](https://github.com/amoai-tech/mdeai/pull/420) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, auth-redirect chromium, Codacy, CodeRabbit, Kilo, Sourcery SUCCESS; no failed check. |
| [#244](https://github.com/amoai-tech/mdeai/pull/244) | Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, supabase-acl, deterministic chromium, Codacy, CodeRabbit, GitBook SUCCESS; body states exact-head CI + full floor still need verification after its 2026-10-16 rewrite. |
| [#234](https://github.com/amoai-tech/mdeai/pull/234) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · Kilo Code Review FAILURE | floor, deterministic chromium, Codacy, CodeRabbit, Sourcery SUCCESS; `Kilo Code Review` FAILURE (external kilo.ai review, advisory, not required). |
| [#389](https://github.com/amoai-tech/mdeai/pull/389) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |
| [#214](https://github.com/amoai-tech/mdeai/pull/214) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, Codacy Static, Codacy Diff Coverage, 'Report coverage to Codacy', deterministic chromium, CodeRabbit, Kilo SUCCESS — the only PR on the board with a passing coverage upload run. |
| [#471](https://github.com/amoai-tech/mdeai/pull/471) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · deterministic chromium FAILURE | floor, supabase-acl, deterministic Maps contracts, Codacy, CodeRabbit, Kilo SUCCESS; `deterministic chromium` FAILURE = shared SAN-1357 flake (run 39434317221). |
| [#313](https://github.com/amoai-tech/mdeai/pull/313) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo, GitBook SUCCESS; no failed check. |
| [#255](https://github.com/amoai-tech/mdeai/pull/255) | Open · MERGEABLE · BLOCKED (REVIEW_REQUIRED) · floor FAILURE | `floor` FAILURE on a **15-day-old head** (run 37488865535); supabase-acl, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS then. |
| [#447](https://github.com/amoai-tech/mdeai/pull/447) | Draft · CONFLICTING · DIRTY · REVIEW_REQUIRED | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS at head; CONFLICTING/DIRTY. |
| [#238](https://github.com/amoai-tech/mdeai/pull/238) | Draft · CONFLICTING · DIRTY · REVIEW_REQUIRED | floor, deterministic chromium, Codacy, CodeRabbit SUCCESS at head; CONFLICTING. |
| [#362](https://github.com/amoai-tech/mdeai/pull/362) | Draft · CONFLICTING · DIRTY · REVIEW_REQUIRED | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS at head; CONFLICTING/CONFLICTING-DIRTY. |
| [#256](https://github.com/amoai-tech/mdeai/pull/256) | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED · 15 days old | All checks SUCCESS **on its 15-day-old head**, but the PR is CONFLICTING. |
| [#100](https://github.com/amoai-tech/mdeai/pull/100) | Open · CONFLICTING · DIRTY · REVIEW_REQUIRED · 31 days old | floor, Codacy Diff Coverage, coverage, CodeRabbit SUCCESS at head; `Kilo Code Review` FAILURE; CONFLICTING for 31 days. |
| [#452](https://github.com/amoai-tech/mdeai/pull/452) | Draft · MERGEABLE · BLOCKED (REVIEW_REQUIRED) | floor, deterministic chromium, Codacy, CodeRabbit, Kilo SUCCESS; no failed check. |


### A.3 Collisions between open PRs (files touched by ≥2 heads)

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
| `src/lib/events/list-published-events.ts` (+ test) | #453, #461 |
| `src/lib/onboarding/ai-suggestion.ts` | #403, #404 |
| `src/lib/supabase/database.types.ts` | #244, #248 |
| `src/mastra/agents/concierge.ts` | #324, #479 |
| `src/mastra/agents/partner-agent.ts` | #400, #403 |
| `src/mastra/tools/search-events.ts` | #461, #467 |
| `supabase/tests/database/san1284c_trigger_internal_function_acls_test.sql` | #456, #459 |
| `supabase/tests/database/sb002_live_only_recovery_test.sql` | #456, #459 |

### A.4 Already-merged collisions (rebase risk not shown by GitHub)

| PR | File shared with main | Merged source |
| --- | --- | --- |
| #459 | `supabase/functions/approval-commit/index.ts` | #454 (2026-10-20T10:49Z) |
| #459, #456 | `scripts/function-acl-baseline.json`, `san1304a_*`, `sb002_live_only_recovery_test.sql` | #475 (2026-10-20T15:02Z) |
| #456 | migration prefix `20261021030000` | #454 → `20261021030000_san1548_event_approval_id.sql` (**hard collision**) |
| #476 | `chat-center-panel.tsx`, `concierge-run-feedback.tsx`, `concierge-transcript-tail.tsx`, `concierge-error-store.ts` | #457, #464 |
| #461 | `list-published-events.ts` | #453 (stack base, open) |
| #471 | `scripts/vercel-release-control.mjs`, `.github/workflows/prod-deploy-freshness.yml` purpose | #416 / SAN-1330 tooling |
| #313 | `docs/07-operations/merge-approval-history.md` | #466 (2026-10-20T13:58Z) |

### A.5 Superseded / already satisfied by `origin/main`

| PR | Disposition | Proof |
| --- | --- | --- |
| #256 shell-quote pin | **Close — already satisfied** | `origin/main:package.json` override `"shell-quote": ">=1.11.0"`; lockfile resolves `1.12.0`; `floor` green |
| #447 inline Ask MDE | **Close — superseded by #445** | #445 merged with `rental-ask-composer.tsx`; `rental-inline-ask.tsx` absent from main; draft CONFLICTS |
| #255 ticket QR consume | **Close — subsumed by #456** | #456 revokes `ticket_validate_consume(text)` from anon/authenticated and grants `service_role` |
| #100 Codacy coverage | **Close — superseded by #214** | Both add `.github/workflows/codacy-coverage.yml`; #214 is green, #100 is 31 days CONFLICTING |
| #238 rental restart cert | **Close — covered by #396/#429** | Writes/deletes production identities; CONFLICTING; merged #396/#429 cover the journey and evidence |
| #362 provenance badges | **Close/park — owner-deferred** | PR body: “DRAFT · DEFERRED — NOT A CURRENT DEVELOPMENT PRIORITY … do not merge” |
| #452 PR-Agent probe | **Close — never intended to merge** | PR body: “Never merge.” Purpose served |

### A.6 Merge order

```text
#483 (test flake) ─┬─> #456 (renumber migration) ──> #459 (rebase)
                  ├─> #471, #474, #480
#400 ──> #403 ──> #404
#453 ──> #461
#467, #479 ──> #324
#484 ──> #364   (same SAN-1502 epic)
```

### A.7 Per-PR files, services, dependencies, risk and effort

Risk and effort are **separate from value** (the prompt requires this) and are mechanical, not re-scored: **Risk** = High for security-type PRs, conflicting heads, or the #456 migration collision; Medium for DB/edge/Mastra/API-platform changes; Low otherwise. **Effort** = S ≤120 changed lines and ≤4 files; M ≤800 lines and ≤15 files; L otherwise. Areas are derived from `gh pr view --json files`.

| PR | Files | Areas / services | Depends on | Risk | Effort |
| --- | ---: | --- | --- | --- | --- |
| [#459](https://github.com/amoai-tech/mdeai/pull/459) | 20 | CI workflow, Scripts/CI, UI component, Edge function, DB migration, pgTAP | #454, #475 merged (rebase) | Medium | L |
| [#456](https://github.com/amoai-tech/mdeai/pull/456) | 4 | DB migration, pgTAP | #475 merged; migration version collides with merged #454 | High | M |
| [#484](https://github.com/amoai-tech/mdeai/pull/484) | 5 | DB migration, pgTAP | #478 merged | Medium | L |
| [#394](https://github.com/amoai-tech/mdeai/pull/394) | 7 | Docs, API route, UI component, Lib | — | High | M |
| [#453](https://github.com/amoai-tech/mdeai/pull/453) | 4 | UI component, Lib | — | Low | M |
| [#479](https://github.com/amoai-tech/mdeai/pull/479) | 5 | UI component, Lib, Mastra AI | — | Medium | M |
| [#476](https://github.com/amoai-tech/mdeai/pull/476) | 10 | E2E, UI component, Lib | #457, #464 merged (rebase) | Low | M |
| [#483](https://github.com/amoai-tech/mdeai/pull/483) | 1 | E2E | — | Low | S |
| [#364](https://github.com/amoai-tech/mdeai/pull/364) | 2 | DB migration, pgTAP | #484 (same SAN-1502 epic) | High | M |
| [#404](https://github.com/amoai-tech/mdeai/pull/404) | 14 | API route, UI component, Lib | #403 (stack base) | Low | M |
| [#403](https://github.com/amoai-tech/mdeai/pull/403) | 12 | Scripts/CI, Page, UI component, Lib, Mastra AI | #400 (stack base) | Medium | M |
| [#402](https://github.com/amoai-tech/mdeai/pull/402) | 6 | API route, Page, UI component, Lib | — | Low | M |
| [#400](https://github.com/amoai-tech/mdeai/pull/400) | 14 | Scripts/CI, UI component, Lib, Mastra AI | — | Medium | M |
| [#461](https://github.com/amoai-tech/mdeai/pull/461) | 13 | Lib, Mastra AI | #453 (stack base) | Medium | M |
| [#324](https://github.com/amoai-tech/mdeai/pull/324) | 5 | Mastra AI | #467, #479 paths | High | M |
| [#482](https://github.com/amoai-tech/mdeai/pull/482) | 3 | pgTAP | — | Low | S |
| [#480](https://github.com/amoai-tech/mdeai/pull/480) | 2 | UI component | #483 (shared flake) | Low | S |
| [#405](https://github.com/amoai-tech/mdeai/pull/405) | 2 | UI component | — | Low | S |
| [#474](https://github.com/amoai-tech/mdeai/pull/474) | 2 | E2E, UI component | #483 (shared flake) | Low | S |
| [#481](https://github.com/amoai-tech/mdeai/pull/481) | 5 | E2E, Page | — | Low | M |
| [#376](https://github.com/amoai-tech/mdeai/pull/376) | 7 | E2E, Page, UI component, Lib | — | High | M |
| [#248](https://github.com/amoai-tech/mdeai/pull/248) | 33 | E2E, Deps, Page, UI component, Lib, Mastra AI | — | High | L |
| [#367](https://github.com/amoai-tech/mdeai/pull/367) | 3 | UI component | — | Low | S |
| [#373](https://github.com/amoai-tech/mdeai/pull/373) | 2 | Scripts/CI | — | Medium | S |
| [#455](https://github.com/amoai-tech/mdeai/pull/455) | 6 | E2E, Deps, Scripts/CI | — | Low | M |
| [#406](https://github.com/amoai-tech/mdeai/pull/406) | 3 | UI component, Lib | — | Low | S |
| [#473](https://github.com/amoai-tech/mdeai/pull/473) | 4 | Docs, E2E, Deps | #483 (shared flake) | Low | M |
| [#387](https://github.com/amoai-tech/mdeai/pull/387) | 1 | Mastra AI | — | Medium | S |
| [#467](https://github.com/amoai-tech/mdeai/pull/467) | 3 | Mastra AI | — | Medium | S |
| [#420](https://github.com/amoai-tech/mdeai/pull/420) | 1 | E2E | — | Low | S |
| [#244](https://github.com/amoai-tech/mdeai/pull/244) | 11 | Lib, DB migration, pgTAP | — | Medium | L |
| [#234](https://github.com/amoai-tech/mdeai/pull/234) | 2 | — | — | Medium | S |
| [#389](https://github.com/amoai-tech/mdeai/pull/389) | 1 | — | — | Low | S |
| [#214](https://github.com/amoai-tech/mdeai/pull/214) | 3 | CI workflow | — | Medium | S |
| [#471](https://github.com/amoai-tech/mdeai/pull/471) | 3 | Deps, Scripts/CI | #416 / SAN-1330 release tooling | Medium | M |
| [#313](https://github.com/amoai-tech/mdeai/pull/313) | 1 | Docs | #466 merged path | Low | M |
| [#255](https://github.com/amoai-tech/mdeai/pull/255) | 3 | Scripts/CI, DB migration, pgTAP | #456 (subsumed) | High | S |
| [#447](https://github.com/amoai-tech/mdeai/pull/447) | 3 | UI component | #445 merged (superseded) | High | M |
| [#238](https://github.com/amoai-tech/mdeai/pull/238) | 2 | E2E | #396, #429 merged (covered) | High | M |
| [#362](https://github.com/amoai-tech/mdeai/pull/362) | 11 | UI component, Lib, Mastra AI | — | High | M |
| [#256](https://github.com/amoai-tech/mdeai/pull/256) | 2 | Deps | — | High | S |
| [#100](https://github.com/amoai-tech/mdeai/pull/100) | 2 | CI workflow | #214 (superseded) | High | S |
| [#452](https://github.com/amoai-tech/mdeai/pull/452) | 1 | Lib | none — probe | Low | S |

### A.8 Relevant recently merged PRs used as evidence

These merged PRs change what the open PRs must build on; they are why the queue is review/rebuild-bound rather than code-bound. All merged 2026-10-20 unless noted.

| PR | Title | Why it matters to this plan |
| --- | --- | --- |
| [#478](https://github.com/amoai-tech/mdeai/pull/478) | Rentals: show pending development apartments without exposing private test data | Phase-A pending inventory is live; #484 supplies the request-authority half. |
| [#475](https://github.com/amoai-tech/mdeai/pull/475) | Restore rental, event and restaurant search on a fresh database rebuild | Search restore means #459/#456 must rebase over its ACL/test baseline. |
| [#470](https://github.com/amoai-tech/mdeai/pull/470) | Give standings their own heading and stop clipping long restaurant names | Contest standings surface exists; rendering still needs an asserting test. |
| [#466](https://github.com/amoai-tech/mdeai/pull/466) | Unblock green PRs and run browser tests only when they matter | Changed CI scope; the chat-virtualization flake remains. |
| [#464](https://github.com/amoai-tech/mdeai/pull/464) | Retry the failed concierge search, not the previous AI turn | #476 must rebase on this run-feedback change, not re-introduce it. |
| [#463](https://github.com/amoai-tech/mdeai/pull/463) | Show real accepted-vote standings on the contest page | Standings compute from `vote.entity_tally`; no e2e yet proves rendering. |
| [#460](https://github.com/amoai-tech/mdeai/pull/460) | Homepage: explain map outages and improve search on mobile and desktop | Map-degradation UX is shipped; mobile map tests still brittle (#473). |
| [#457](https://github.com/amoai-tech/mdeai/pull/457) | MDE Chat — stop AI replies and retry failed responses | First-turn retry attempt; #476 covers the empty-transcript gap left here. |
| [#454](https://github.com/amoai-tech/mdeai/pull/454) | Guarantee one event per approved AI review | #459 must rebase over the approval-commit function it changed. |
| [#451](https://github.com/amoai-tech/mdeai/pull/451) | Homepage redesign: one clear search, eight sections, a page that survives a broken map | Current production home is the redesigned surface. |
| [#449](https://github.com/amoai-tech/mdeai/pull/449) | Answer café follow-ups from the shown results, not a new search | Follow-up grounding precedent for #479. |
| [#445](https://github.com/amoai-tech/mdeai/pull/445) | Ask MDE inside the apartment list, without leaving the search | Supersedes #447; inline ask is shipped. |
| [#444](https://github.com/amoai-tech/mdeai/pull/444) | Rentals: clearly label USD prices on apartment cards and details | Latest production commit; budget-disclosure smoke failure is separate. |
| [#438](https://github.com/amoai-tech/mdeai/pull/438) | Keep the viewing request reachable above the phone keyboard | Mobile viewing CTA is shipped but the insert remains unproven. |
| [#437](https://github.com/amoai-tech/mdeai/pull/437) | Event publishing — review AI drafts, retry saves, show receipts | Publish UX predecessor to #459. |
| [#434](https://github.com/amoai-tech/mdeai/pull/434) | Homepage shows only real listings, events and places — no invented content | Grounded-content baseline for the current home. |
| [#433](https://github.com/amoai-tech/mdeai/pull/433) | Prevent production releases when Supabase migrations are missing | Migration preflight exists; drift is 0 today. |

---

## Appendix B — Linear inventory and mapping

Source: Linear GraphQL API, project `25af0641-c8db-45a8-a2eb-fe12c15caa57` (slug `bb25cababf6c`, team SAN), 460 issues in 5 pages, read-only. Full machine-readable dump: `data/linear-data.json`.

### B.1 State distribution

| State | Issues | Share |
| --- | ---: | ---: |
| Backlog | 173 | 37.6% |
| Done | 129 | 28.0% |
| Todo | 77 | 16.7% |
| In Progress | 50 | 10.9% |
| Canceled | 14 | 3.0% |
| Duplicate | 9 | 2.0% |
| In Review | 8 | 1.7% |
| **Total** | **460** | 100% |

Phase framing: 278 Phase A development, 161 ambiguous launch-labelled build work, 21 explicitly Phase B. **No issue certifies the whole public launch at one exact release.**

### B.2 Domain distribution

| Domain | Issues | Done | Active | Backlog+Todo |
| --- | ---: | ---: | ---: | ---: |
| AI/Agents | 116 | 40 | 11 | 60 |
| Rentals | 74 | 28 | 5 | 39 |
| Restaurants Contest | 46 | 10 | 4 | 28 |
| Events | 37 | 2 | 10 | 24 |
| Maps | 35 | 9 | 8 | 18 |
| CI/Platform/Docs | 34 | 11 | 2 | 19 |
| Supabase/Data | 34 | 13 | 4 | 10 |
| Restaurants | 25 | 8 | 1 | 16 |
| Partners/Onboarding | 21 | 1 | 6 | 14 |
| Unclassified | 13 | 1 | 3 | 9 |
| New Projects | 13 | 4 | 3 | 4 |
| WhatsApp | 12 | 2 | 1 | 9 |


### B.3 Active work — In Progress (50) and In Review (8)

| Task | Exact title | Domain | State | Open PRs | Priority |
| --- | --- | --- | --- | --- | --- |
| [SAN-1193](https://linear.app/amo100/issue/SAN-1193/mde-partner-signup-autofill-business-details-from-a-website) | MDE Partner Signup — Autofill Business Details From a Website | Partners/Onboarding | In Progress | [#403](https://github.com/amoai-tech/mdeai/pull/403) OPEN, [#404](https://github.com/amoai-tech/mdeai/pull/404) OPEN | Medium |
| [SAN-1244](https://linear.app/amo100/issue/SAN-1244/san-1244-make-host-os-recover-cleanly-from-loading-and-service) | SAN-1244 · Make Host OS recover cleanly from loading and service failures | Events | In Progress | — | Urgent |
| [SAN-1255](https://linear.app/amo100/issue/SAN-1255/san-1255-keep-only-mastra-agents-with-a-proven-mde-responsibility) | SAN-1255 · Keep only Mastra agents with a proven MDE responsibility | AI/Agents | In Progress | — | Medium |
| [SAN-1268](https://linear.app/amo100/issue/SAN-1268/san-1268-keep-one-current-mde-production-readiness-scoreboard) | SAN-1268 · Keep one current MDE production-readiness scoreboard | Unclassified | In Progress | — | Medium |
| [SAN-1269](https://linear.app/amo100/issue/SAN-1269/san-1269-finish-mde-backlog-cleanup-and-retire-duplicate-or-stale-work) | SAN-1269 · Finish MDE backlog cleanup and retire duplicate or stale work | Unclassified | In Progress | — | High |
| [SAN-1284](https://linear.app/amo100/issue/SAN-1284/stop-unauthorized-users-from-running-admin-database-actions) | Stop Unauthorized Users From Running Admin Database Actions | Supabase/Data | In Progress | [#255](https://github.com/amoai-tech/mdeai/pull/255) OPEN, [#456](https://github.com/amoai-tech/mdeai/pull/456) OPEN, [#58](https://github.com/amoai-tech/mdeai/pull/58), [#78](https://github.com/amoai-tech/mdeai/pull/78), [#79](https://github.com/amoai-tech/mdeai/pull/79), [#88](https://github.com/amoai-tech/mdeai/pull/88) | Urgent |
| [SAN-1285](https://linear.app/amo100/issue/SAN-1285/mde-events-publish-event-and-ticket-tiers-atomically-with-safe-retries) | MDE Events — Publish Event and Ticket Tiers Atomically With Safe Retries | Events | In Progress | [#453](https://github.com/amoai-tech/mdeai/pull/453) OPEN, [#459](https://github.com/amoai-tech/mdeai/pull/459) OPEN, [#437](https://github.com/amoai-tech/mdeai/pull/437), [#454](https://github.com/amoai-tech/mdeai/pull/454) | Urgent |
| [SAN-1291](https://linear.app/amo100/issue/SAN-1291/supabase-ci-catch-database-and-security-breakage-before-merge) | Supabase CI — Catch Database and Security Breakage Before Merge | Supabase/Data | In Progress | [#482](https://github.com/amoai-tech/mdeai/pull/482) OPEN, [#78](https://github.com/amoai-tech/mdeai/pull/78), [#79](https://github.com/amoai-tech/mdeai/pull/79) | High |
| [SAN-1299](https://linear.app/amo100/issue/SAN-1299/epic-make-mde-ai-chats-memory-and-workflows-reliable-in-production) | EPIC · Make MDE AI Chats, Memory, and Workflows Reliable in Production | AI/Agents | In Progress | [#56](https://github.com/amoai-tech/mdeai/pull/56), [#122](https://github.com/amoai-tech/mdeai/pull/122) | High |
| [SAN-1304](https://linear.app/amo100/issue/SAN-1304/san-1304-make-ai-search-work-the-same-after-a-fresh-database-rebuild) | SAN-1304 · Make AI Search Work the Same After a Fresh Database Rebuild | AI/Agents | In Progress | [#66](https://github.com/amoai-tech/mdeai/pull/66), [#67](https://github.com/amoai-tech/mdeai/pull/67), [#68](https://github.com/amoai-tech/mdeai/pull/68), [#113](https://github.com/amoai-tech/mdeai/pull/113) | High |
| [SAN-1311](https://linear.app/amo100/issue/SAN-1311/prove-mde-ai-storage-is-safe-and-reliable-before-production) | Prove MDE AI Storage Is Safe and Reliable Before Production | AI/Agents | In Progress | [#206](https://github.com/amoai-tech/mdeai/pull/206), [#209](https://github.com/amoai-tech/mdeai/pull/209) | Urgent |
| [SAN-1313](https://linear.app/amo100/issue/SAN-1313/keep-scheduled-jobs-reproducible-and-prove-they-actually-work-in) | Keep Scheduled Jobs Reproducible and Prove They Actually Work in Production | Supabase/Data | In Progress | [#66](https://github.com/amoai-tech/mdeai/pull/66), [#67](https://github.com/amoai-tech/mdeai/pull/67), [#146](https://github.com/amoai-tech/mdeai/pull/146), [#147](https://github.com/amoai-tech/mdeai/pull/147) | High |
| [SAN-1315](https://linear.app/amo100/issue/SAN-1315/san-1315-epic-finish-the-rental-journey-from-apartment-discovery-to) | SAN-1315 · EPIC · Finish the rental journey from apartment discovery to committed viewing | Rentals | In Progress | [#113](https://github.com/amoai-tech/mdeai/pull/113), [#150](https://github.com/amoai-tech/mdeai/pull/150) | Urgent |
| [SAN-1332](https://linear.app/amo100/issue/SAN-1332/san-1332-make-pr-agent-verify-api-claims-before-blocking-a-pr) | SAN-1332 · Make PR-Agent verify API claims before blocking a PR | AI/Agents | In Progress | [#373](https://github.com/amoai-tech/mdeai/pull/373) OPEN, [#84](https://github.com/amoai-tech/mdeai/pull/84), [#96](https://github.com/amoai-tech/mdeai/pull/96), [#97](https://github.com/amoai-tech/mdeai/pull/97), [#110](https://github.com/amoai-tech/mdeai/pull/110) | High |
| [SAN-1380](https://linear.app/amo100/issue/SAN-1380/help-buyers-find-and-compare-new-condo-projects-with-one-ai-concierge) | Help Buyers Find and Compare New Condo Projects With One AI Concierge | New Projects | In Progress | [#248](https://github.com/amoai-tech/mdeai/pull/248) OPEN, [#235](https://github.com/amoai-tech/mdeai/pull/235), [#237](https://github.com/amoai-tech/mdeai/pull/237), [#241](https://github.com/amoai-tech/mdeai/pull/241) | High |
| [SAN-1383](https://linear.app/amo100/issue/SAN-1383/epic-mde-new-projects-launch-the-new-construction-buyer-to-developer) | EPIC · MDE New Projects — Launch the New-Construction Buyer-to-Developer Commission Journe | New Projects | In Progress | — | High |
| [SAN-1386](https://linear.app/amo100/issue/SAN-1386/epic-mastra-upgrade-upgrade-mde-without-losing-chats-or-breaking) | EPIC · Mastra Upgrade — Upgrade MDE Without Losing Chats or Breaking Workflows | AI/Agents | In Progress | — | Urgent |
| [SAN-1390](https://linear.app/amo100/issue/SAN-1390/epic-mde-uiux-one-simple-chat-map-and-mobile-experience) | EPIC · MDE UI/UX — One Simple Chat, Map and Mobile Experience | Maps | In Progress | [#300](https://github.com/amoai-tech/mdeai/pull/300) | High |
| [SAN-1391](https://linear.app/amo100/issue/SAN-1391/let-rental-owners-and-brokers-save-and-resume-setup) | Let Rental Owners and Brokers Save and Resume Setup | Rentals | In Progress | [#244](https://github.com/amoai-tech/mdeai/pull/244) OPEN, [#267](https://github.com/amoai-tech/mdeai/pull/267) | High |
| [SAN-1406](https://linear.app/amo100/issue/SAN-1406/mde-new-projects-expand-verified-laureles-new-construction-inventory) | MDE New Projects — Expand Verified Laureles New-Construction Inventory | New Projects | In Progress | [#249](https://github.com/amoai-tech/mdeai/pull/249) | Medium |
| [SAN-1431](https://linear.app/amo100/issue/SAN-1431/stage-multi-source-medellin-rental-candidates-and-verify-3-for-launch) | Stage Multi-Source Medellín Rental Candidates and Verify 3 for Launch | Rentals | In Progress | [#252](https://github.com/amoai-tech/mdeai/pull/252), [#258](https://github.com/amoai-tech/mdeai/pull/258), [#259](https://github.com/amoai-tech/mdeai/pull/259), [#264](https://github.com/amoai-tech/mdeai/pull/264) | High |
| [SAN-1436](https://linear.app/amo100/issue/SAN-1436/epic-mde-rentals-get-real-production-rentals-launch-ready) | EPIC · MDE Rentals — Get Real Production Rentals Launch-Ready | Rentals | In Progress | — | Urgent |
| [SAN-1437](https://linear.app/amo100/issue/SAN-1437/epic-google-maps-platform-make-maps-places-grounding-and-routes) | EPIC · Google Maps Platform — Make Maps, Places, Grounding, and Routes Production-Ready | Maps | In Progress | — | High |
| [SAN-1438](https://linear.app/amo100/issue/SAN-1438/mde-accounts-let-one-user-be-a-customer-and-an-authorized-partner) | MDE Accounts — Let One User Be a Customer and an Authorized Partner Safely | Partners/Onboarding | In Progress | [#267](https://github.com/amoai-tech/mdeai/pull/267) | High |
| [SAN-1442](https://linear.app/amo100/issue/SAN-1442/epic-mde-whatsapp-shared-channel-rental-journeys-and-partner-messaging) | EPIC · MDE WhatsApp — Shared Channel, Rental Journeys & Partner Messaging | WhatsApp | In Progress | [#324](https://github.com/amoai-tech/mdeai/pull/324) OPEN, [#309](https://github.com/amoai-tech/mdeai/pull/309), [#311](https://github.com/amoai-tech/mdeai/pull/311), [#314](https://github.com/amoai-tech/mdeai/pull/314), [#318](https://github.com/amoai-tech/mdeai/pull/318) | Medium |
| [SAN-1451](https://linear.app/amo100/issue/SAN-1451/mde-rentals-harden-fincaraiz-photo-publishing-script) | MDE Rentals — Harden Fincaraíz Photo Publishing Script | Rentals | In Progress | — | Low |
| [SAN-1457](https://linear.app/amo100/issue/SAN-1457/mde-restaurants-contest-build-the-top-100-pages-maps-and-voting) | MDE Restaurants Contest — Build the Top 100 Pages, Maps and Voting Screens | Restaurants Contest | In Progress | — | High |
| [SAN-1473](https://linear.app/amo100/issue/SAN-1473/mde-restaurants-contest-test-the-complete-website-on-mobile-and) | MDE Restaurants Contest — Test the Complete Website on Mobile and Desktop | Restaurants Contest | In Progress | — | High |
| [SAN-1486](https://linear.app/amo100/issue/SAN-1486/mde-events-show-correct-medellin-event-times-without-hydration-errors) | MDE Events — Show Correct Medellín Event Times Without Hydration Errors | Events | In Progress | [#313](https://github.com/amoai-tech/mdeai/pull/313) OPEN, [#310](https://github.com/amoai-tech/mdeai/pull/310) | High |
| [SAN-1487](https://linear.app/amo100/issue/SAN-1487/mde-concierge-fix-mastra-workspace-filesystem-errors-on-vercel) | MDE Concierge — Fix Mastra Workspace Filesystem Errors on Vercel | AI/Agents | In Progress | [#310](https://github.com/amoai-tech/mdeai/pull/310), [#312](https://github.com/amoai-tech/mdeai/pull/312) | High |
| [SAN-1496](https://linear.app/amo100/issue/SAN-1496/mde-restaurants-contest-enforce-one-authenticated-ballot-per-persons) | MDE Restaurants Contest — Enforce One Authenticated Ballot Per Person's Account | Restaurants Contest | In Progress | [#315](https://github.com/amoai-tech/mdeai/pull/315), [#325](https://github.com/amoai-tech/mdeai/pull/325) | High |
| [SAN-1503](https://linear.app/amo100/issue/SAN-1503/mde-rentals-import-15-livcasacoloasis-listings-and-photos-into) | MDE Rentals — Import 15 LIV/Casacol/OASIS Listings and Photos into Supabase Safely | Supabase/Data | In Progress | [#362](https://github.com/amoai-tech/mdeai/pull/362) OPEN, [#329](https://github.com/amoai-tech/mdeai/pull/329), [#330](https://github.com/amoai-tech/mdeai/pull/330), [#333](https://github.com/amoai-tech/mdeai/pull/333), [#334](https://github.com/amoai-tech/mdeai/pull/334) | High |
| [SAN-1522](https://linear.app/amo100/issue/SAN-1522/make-mde-pr-agent-reviews-faster-and-reliable-with-nemotron-35-super) | Make MDE PR-Agent reviews faster and reliable with Nemotron 3.5 Super VL | AI/Agents | In Progress | [#332](https://github.com/amoai-tech/mdeai/pull/332), [#336](https://github.com/amoai-tech/mdeai/pull/336), [#349](https://github.com/amoai-tech/mdeai/pull/349), [#353](https://github.com/amoai-tech/mdeai/pull/353) | High |
| [SAN-1525](https://linear.app/amo100/issue/SAN-1525/mde-restaurants-contest-add-my-votes-and-cross-device-vote-history) | MDE Restaurants Contest — Add My Votes and Cross-Device Vote History | Restaurants Contest | In Progress | [#375](https://github.com/amoai-tech/mdeai/pull/375), [#377](https://github.com/amoai-tech/mdeai/pull/377) | High |
| [SAN-1532](https://linear.app/amo100/issue/SAN-1532/epic-mde-search-verified-progress-tracker-and-implementation-order) | EPIC · MDE Search — Verified Progress Tracker and Implementation Order | AI/Agents | In Progress | — | High |
| [SAN-1533](https://linear.app/amo100/issue/SAN-1533/mde-roadmap-maintain-one-grouped-development-progress-tracker-for-all) | MDE Roadmap — Maintain One Grouped Development Progress Tracker for All Active Tasks | Maps | In Progress | — | High |
| [SAN-1534](https://linear.app/amo100/issue/SAN-1534/mde-uiux-roadmap-and-verified-progress-tracker) | MDE UI/UX —Roadmap and Verified Progress Tracker | Maps | In Progress | [#405](https://github.com/amoai-tech/mdeai/pull/405) OPEN, [#451](https://github.com/amoai-tech/mdeai/pull/451), [#460](https://github.com/amoai-tech/mdeai/pull/460), [#462](https://github.com/amoai-tech/mdeai/pull/462) | High |
| [SAN-1535](https://linear.app/amo100/issue/SAN-1535/epic-mde-vector-search-verified-progress-tracker-and-runtime-readiness) | EPIC · MDE Vector Search — Verified Progress Tracker and Runtime Readiness | AI/Agents | In Progress | — | High |
| [SAN-1537](https://linear.app/amo100/issue/SAN-1537/make-full-test-runs-reliable-without-hiding-failures) | Make Full Test Runs Reliable Without Hiding Failures | CI/Platform/Docs | In Progress | [#389](https://github.com/amoai-tech/mdeai/pull/389) OPEN | High |
| [SAN-1538](https://linear.app/amo100/issue/SAN-1538/mde-partners-complete-partner-journeys-ai-and-dashboard) | MDE Partners — Complete Partner Journeys, AI & Dashboard | Partners/Onboarding | In Progress | — | No priority |
| [SAN-1550](https://linear.app/amo100/issue/SAN-1550/epic-mde-ai-unified-ai-foundation-and-stakeholder-architecture-6) | EPIC · MDE AI — Unified AI Foundation & Stakeholder Architecture (6 Documents · 13 Diagram | AI/Agents | In Progress | — | Medium |
| [SAN-1555](https://linear.app/amo100/issue/SAN-1555/mde-ai-opendots-map-editable-ai-reviews-and-saved-results-to-existing) | MDE AI OpenDots — Map Editable AI Reviews and Saved Results to Existing Workflows | Maps | In Progress | [#431](https://github.com/amoai-tech/mdeai/pull/431) | Medium |
| [SAN-1558](https://linear.app/amo100/issue/SAN-1558/epic-mde-mobile-verified-progress-tracker-and-end-to-end-journeys) | EPIC · MDE Mobile — Verified Progress Tracker and End-to-End Journeys | Unclassified | In Progress | — | High |
| [SAN-1560](https://linear.app/amo100/issue/SAN-1560/mde-events-show-accurate-ticket-prices-and-actions-in-the-public) | MDE Events — Show Accurate Ticket Prices and Actions in the Public Catalog | Events | In Progress | [#453](https://github.com/amoai-tech/mdeai/pull/453) OPEN, [#461](https://github.com/amoai-tech/mdeai/pull/461) OPEN | High |
| [SAN-412](https://linear.app/amo100/issue/SAN-412/make-the-concierge-understand-the-selected-map-place-and-viewport) | Make the concierge understand the selected map place and viewport | Maps | In Progress | — | High |
| [SAN-546](https://linear.app/amo100/issue/SAN-546/lucia-prod-journey-matrix-j05-j20-rentals-venues-maps-mobile) | Lucía: Prod journey matrix J05–J20 (rentals, venues, maps, mobile) | Restaurants | In Progress | [#420](https://github.com/amoai-tech/mdeai/pull/420) OPEN, [#415](https://github.com/amoai-tech/mdeai/pull/415), [#418](https://github.com/amoai-tech/mdeai/pull/418), [#438](https://github.com/amoai-tech/mdeai/pull/438), [#443](https://github.com/amoai-tech/mdeai/pull/443) | Urgent |
| [SAN-677](https://linear.app/amo100/issue/SAN-677/mde-onboarding-prove-a-new-rental-partner-can-onboard-publish-receive) | MDE Onboarding — Prove a New Rental Partner Can Onboard, Publish + Receive the First Viewi | Partners/Onboarding | In Progress | [#455](https://github.com/amoai-tech/mdeai/pull/455) OPEN | High |
| [SAN-705](https://linear.app/amo100/issue/SAN-705/mde-partner-ai-add-one-assistant-for-every-partner-type) | MDE Partner AI — Add One Assistant for Every Partner Type | Partners/Onboarding | In Progress | [#400](https://github.com/amoai-tech/mdeai/pull/400) OPEN, [#403](https://github.com/amoai-tech/mdeai/pull/403) OPEN | High |
| [SAN-709](https://linear.app/amo100/issue/SAN-709/mde-partner-signup-let-ai-suggest-fields-you-can-review-and-edit) | MDE Partner Signup — Let AI Suggest Fields You Can Review and Edit | Partners/Onboarding | In Progress | [#403](https://github.com/amoai-tech/mdeai/pull/403) OPEN, [#404](https://github.com/amoai-tech/mdeai/pull/404) OPEN | High |
| [SAN-878](https://linear.app/amo100/issue/SAN-878/gnd-002-maps-attribution-tos-on-grounded-cards) | GND-002 — Maps attribution ToS on grounded cards | Maps | In Progress | [#246](https://github.com/amoai-tech/mdeai/pull/246) | Medium |
| [SAN-116](https://linear.app/amo100/issue/SAN-116/san-116-keep-ticket-and-sponsor-stripe-webhooks-isolated) | SAN-116 · Keep ticket and sponsor Stripe webhooks isolated | Events | In Review | — | Urgent |
| [SAN-1209](https://linear.app/amo100/issue/SAN-1209/keep-the-same-host-ai-conversation-while-moving-between-host-pages) | Keep the Same Host AI Conversation While Moving Between Host Pages | Events | In Review | — | High |
| [SAN-1267](https://linear.app/amo100/issue/SAN-1267/san-1267-let-buyers-view-their-purchased-ticket-qr-codes) | SAN-1267 · Let buyers view their purchased ticket QR codes | Events | In Review | — | High |
| [SAN-1314](https://linear.app/amo100/issue/SAN-1314/san-1314-keep-production-online-when-vercel-configuration-changes) | SAN-1314 · Keep production online when Vercel configuration changes | CI/Platform/Docs | In Review | [#76](https://github.com/amoai-tech/mdeai/pull/76), [#80](https://github.com/amoai-tech/mdeai/pull/80), [#112](https://github.com/amoai-tech/mdeai/pull/112) | Urgent |
| [SAN-1564](https://linear.app/amo100/issue/SAN-1564/stop-the-mobile-map-from-throwing-when-the-chat-sheet-closes) | Stop the Mobile Map From Throwing When the Chat Sheet Closes | Maps | In Review | [#473](https://github.com/amoai-tech/mdeai/pull/473) OPEN, [#474](https://github.com/amoai-tech/mdeai/pull/474) OPEN | High |
| [SAN-178](https://linear.app/amo100/issue/SAN-178/san-178-prove-a-real-production-ticket-purchase-works-end-to-end) | SAN-178 · Prove a real production ticket purchase works end to end | Events | In Review | [#453](https://github.com/amoai-tech/mdeai/pull/453) OPEN | Urgent |
| [SAN-729](https://linear.app/amo100/issue/SAN-729/show-hosts-real-business-numbers-when-they-ask-the-ai) | Show Hosts Real Business Numbers When They Ask the AI | Events | In Review | — | High |
| [SAN-974](https://linear.app/amo100/issue/SAN-974/san-974-prove-event-checkout-works-from-stripe-payment-to-ticket-qr) | SAN-974 · Prove event checkout works from Stripe payment to ticket QR | Events | In Review | [#453](https://github.com/amoai-tech/mdeai/pull/453) OPEN | Urgent |

_Active total: 58_

### B.3.1 Done issues with an OPEN PR — unsupported Done claims

| Task | Exact title | PR still open | State | Completed |
| --- | --- | --- | --- | --- |
| [SAN-1092](https://linear.app/amo100/issue/SAN-1092/d-07-re-des-005-broker-onboarding-wizard-ui) | D-07 · RE-DES-005 — Broker onboarding wizard UI | [#455](https://github.com/amoai-tech/mdeai/pull/455) OPEN | Done | 2026-06-18 |
| [SAN-1105](https://linear.app/amo100/issue/SAN-1105/broker-security-prove-one-broker-can-never-see-another-brokers-data) | Broker Security — Prove One Broker Can Never See Another Broker's Data | [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#113](https://github.com/amoai-tech/mdeai/pull/113), [#242](https://github.com/amoai-tech/mdeai/pull/242) | Done | 2026-10-06 |
| [SAN-1206](https://linear.app/amo100/issue/SAN-1206/re-des-010-broker-viewing-actions-confirm-decline-reschedule) | RE-DES-010 — Broker viewing actions: confirm, decline + reschedule | [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#186](https://github.com/amoai-tech/mdeai/pull/186), [#224](https://github.com/amoai-tech/mdeai/pull/224), [#227](https://github.com/amoai-tech/mdeai/pull/227), [#242](https://github.com/amoai-tech/mdeai/pull/242) | Done | 2026-10-02 |
| [SAN-1286](https://linear.app/amo100/issue/SAN-1286/san-1286-save-the-lead-and-viewing-together-or-not-at-all) | SAN-1286 · Save the Lead and Viewing Together or Not at All | [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#79](https://github.com/amoai-tech/mdeai/pull/79), [#112](https://github.com/amoai-tech/mdeai/pull/112), [#113](https://github.com/amoai-tech/mdeai/pull/113), [#117](https://github.com/amoai-tech/mdeai/pull/117) | Done | 2026-09-24 |
| [SAN-1312](https://linear.app/amo100/issue/SAN-1312/mde-pr-review-001-make-pr-agent-catch-real-defects-before-saying-safe) | MDE-PR-REVIEW-001 — Make PR-Agent Catch Real Defects Before Saying Safe to Merge | [#373](https://github.com/amoai-tech/mdeai/pull/373) OPEN, [#64](https://github.com/amoai-tech/mdeai/pull/64), [#84](https://github.com/amoai-tech/mdeai/pull/84), [#89](https://github.com/amoai-tech/mdeai/pull/89), [#94](https://github.com/amoai-tech/mdeai/pull/94) | Done | 2026-10-16 |
| [SAN-1349](https://linear.app/amo100/issue/SAN-1349/mde-rentals-require-real-owner-for-every-active-rental-and-prove) | MDE Rentals — Require Real Owner for Every Active Rental and Prove Broker Isolation | [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#129](https://github.com/amoai-tech/mdeai/pull/129), [#131](https://github.com/amoai-tech/mdeai/pull/131), [#134](https://github.com/amoai-tech/mdeai/pull/134), [#139](https://github.com/amoai-tech/mdeai/pull/139) | Done | 2026-10-11 |
| [SAN-1357](https://linear.app/amo100/issue/SAN-1357/task-5512-mde-ck-upgrade-002-upgrade-mde-chat-and-prove-real) | Task 55.12 · MDE-CK-UPGRADE-002 — Upgrade MDE chat and prove real conversations still work | [#456](https://github.com/amoai-tech/mdeai/pull/456) OPEN, [#483](https://github.com/amoai-tech/mdeai/pull/483) OPEN, [#157](https://github.com/amoai-tech/mdeai/pull/157), [#162](https://github.com/amoai-tech/mdeai/pull/162), [#164](https://github.com/amoai-tech/mdeai/pull/164), [#171](https://github.com/amoai-tech/mdeai/pull/171) | Done | 2026-10-01 |
| [SAN-1421](https://linear.app/amo100/issue/SAN-1421/reskin-rentals-as-the-mde-rental-discovery-workspace-filters-ranked) | Reskin /rentals as the MDE Rental Discovery Workspace — Filters, Ranked Cards, Map + Ask M | [#447](https://github.com/amoai-tech/mdeai/pull/447) OPEN, [#479](https://github.com/amoai-tech/mdeai/pull/479) OPEN, [#366](https://github.com/amoai-tech/mdeai/pull/366), [#435](https://github.com/amoai-tech/mdeai/pull/435), [#445](https://github.com/amoai-tech/mdeai/pull/445) | Done | 2026-10-20 |
| [SAN-1444](https://linear.app/amo100/issue/SAN-1444/mde-whatsapp-prove-signed-meta-webhook-and-mastra-concierge-round-trip) | MDE WhatsApp — Prove Signed Meta Webhook and Mastra Concierge Round Trip | [#324](https://github.com/amoai-tech/mdeai/pull/324) OPEN, [#295](https://github.com/amoai-tech/mdeai/pull/295), [#298](https://github.com/amoai-tech/mdeai/pull/298), [#305](https://github.com/amoai-tech/mdeai/pull/305), [#309](https://github.com/amoai-tech/mdeai/pull/309) | Done | 2026-10-14 |
| [SAN-1502](https://linear.app/amo100/issue/SAN-1502/mde-rentals-enable-full-development-journeys-and-defer-real-world) | MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates | [#364](https://github.com/amoai-tech/mdeai/pull/364) OPEN, [#482](https://github.com/amoai-tech/mdeai/pull/482) OPEN, [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#304](https://github.com/amoai-tech/mdeai/pull/304), [#326](https://github.com/amoai-tech/mdeai/pull/326), [#328](https://github.com/amoai-tech/mdeai/pull/328), [#330](https://github.com/amoai-tech/mdeai/pull/330) | Done | 2026-10-18 |
| [SAN-1508](https://linear.app/amo100/issue/SAN-1508/show-monthly-cop-prices-in-the-chat-welcome-and-budget-chip-not) | Show Monthly COP Prices in the Chat Welcome and Budget Chip, Not Nightly Dollars | [#406](https://github.com/amoai-tech/mdeai/pull/406) OPEN, [#359](https://github.com/amoai-tech/mdeai/pull/359), [#369](https://github.com/amoai-tech/mdeai/pull/369), [#444](https://github.com/amoai-tech/mdeai/pull/444) | Done | 2026-10-20 |
| [SAN-1548](https://linear.app/amo100/issue/SAN-1548/mde-ai-standardize-ai-chat-reviewable-edits-and-action-receipts-across) | MDE AI — Standardize AI Chat, Reviewable Edits, and Action Receipts Across Products | [#459](https://github.com/amoai-tech/mdeai/pull/459) OPEN, [#431](https://github.com/amoai-tech/mdeai/pull/431), [#437](https://github.com/amoai-tech/mdeai/pull/437), [#454](https://github.com/amoai-tech/mdeai/pull/454), [#469](https://github.com/amoai-tech/mdeai/pull/469) | Done | 2026-10-20 |
| [SAN-1554](https://linear.app/amo100/issue/SAN-1554/mde-ai-openmuse-map-real-chat-search-maps-and-mobile-patterns-to) | MDE AI OpenMuse — Map Real Chat, Search, Maps and Mobile Patterns to Existing Components | [#476](https://github.com/amoai-tech/mdeai/pull/476) OPEN, [#431](https://github.com/amoai-tech/mdeai/pull/431), [#457](https://github.com/amoai-tech/mdeai/pull/457), [#464](https://github.com/amoai-tech/mdeai/pull/464) | Done | 2026-10-20 |
| [SAN-386](https://linear.app/amo100/issue/SAN-386/only-rank-rentals-that-actually-match-the-renters-hard-requirements) | Only Rank Rentals That Actually Match the Renter's Hard Requirements | [#447](https://github.com/amoai-tech/mdeai/pull/447) OPEN, [#113](https://github.com/amoai-tech/mdeai/pull/113), [#150](https://github.com/amoai-tech/mdeai/pull/150), [#223](https://github.com/amoai-tech/mdeai/pull/223), [#224](https://github.com/amoai-tech/mdeai/pull/224) | Done | 2026-10-20 |
| [SAN-468](https://linear.app/amo100/issue/SAN-468/real-002-make-production-rental-inventory-launch-ready) | REAL-002 — Make Production Rental Inventory Launch-Ready | [#482](https://github.com/amoai-tech/mdeai/pull/482) OPEN, [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#217](https://github.com/amoai-tech/mdeai/pull/217), [#221](https://github.com/amoai-tech/mdeai/pull/221), [#222](https://github.com/amoai-tech/mdeai/pull/222), [#223](https://github.com/amoai-tech/mdeai/pull/223) | Done | 2026-10-06 |
| [SAN-476](https://linear.app/amo100/issue/SAN-476/mde-rentals-show-each-viewing-request-only-to-the-correct-broker) | MDE Rentals — Show Each Viewing Request Only to the Correct Broker | [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#160](https://github.com/amoai-tech/mdeai/pull/160), [#165](https://github.com/amoai-tech/mdeai/pull/165), [#167](https://github.com/amoai-tech/mdeai/pull/167), [#170](https://github.com/amoai-tech/mdeai/pull/170) | Done | 2026-09-29 |
| [SAN-486](https://linear.app/amo100/issue/SAN-486/only-show-rentals-available-for-the-renters-entire-stay) | Only Show Rentals Available for the Renter's Entire Stay | [#484](https://github.com/amoai-tech/mdeai/pull/484) OPEN, [#271](https://github.com/amoai-tech/mdeai/pull/271), [#278](https://github.com/amoai-tech/mdeai/pull/278), [#285](https://github.com/amoai-tech/mdeai/pull/285), [#359](https://github.com/amoai-tech/mdeai/pull/359) | Done | 2026-10-20 |
| [SAN-548](https://linear.app/amo100/issue/SAN-548/make-rental-chat-remember-the-renter-after-a-restart) | Make Rental Chat Remember the Renter After a Restart | [#238](https://github.com/amoai-tech/mdeai/pull/238) OPEN, [#113](https://github.com/amoai-tech/mdeai/pull/113), [#150](https://github.com/amoai-tech/mdeai/pull/150), [#206](https://github.com/amoai-tech/mdeai/pull/206), [#236](https://github.com/amoai-tech/mdeai/pull/236) | Done | 2026-10-06 |

_Count: 18_

### B.3.2 Done issues with no PR evidence in issue text

| Task | Exact title | Domain | Completed | Missing work |
| --- | --- | --- | --- | --- |
| [SAN-1043](https://linear.app/amo100/issue/SAN-1043/supa-re-003-rental-search-index-pack) | SUPA-RE-003 — Rental search index pack | AI/Agents | 2026-09-18 | No PR/migration/query receipt in issue text |
| [SAN-1079](https://linear.app/amo100/issue/SAN-1079/ckv2-re-001-v2-hooks-audit-no-v1-shims) | CKV2-RE-001 — V2 hooks audit (no V1 shims) | CI/Platform/Docs | 2026-06-18 | No PR/migration/query receipt in issue text |
| [SAN-1093](https://linear.app/amo100/issue/SAN-1093/d-09-re-des-002-broker-concierge-primary-ai-native-workspace) | D-09 · RE-DES-002 — Broker Concierge (primary AI-native workspace) | AI/Agents | 2026-06-18 | No PR/migration/query receipt in issue text |
| [SAN-1109](https://linear.app/amo100/issue/SAN-1109/d-06-re-wire-001-hostrentals-route-tree-gate) | D-06 · RE-WIRE-001 — /host/rentals route tree + gate | Events | 2026-06-18 | No PR/migration/query receipt in issue text |
| [SAN-1202](https://linear.app/amo100/issue/SAN-1202/re-des-007-consumer-rental-detail-page-rentalsid) | RE-DES-007 — Consumer rental detail page /rentals/[id] | Rentals | 2026-06-18 | No PR/migration/query receipt in issue text |
| [SAN-1271](https://linear.app/amo100/issue/SAN-1271/san-1271-finish-the-canonical-docs-index-and-make-documentation-drift) | SAN-1271 · Finish the canonical docs index and make documentation drift checks pass | Supabase/Data | 2026-09-27 | No PR/migration/query receipt in issue text |
| [SAN-1275](https://linear.app/amo100/issue/SAN-1275/task-44-mde-docs-arch-001-define-canonical-documentation-architecture) | Task 44 · MDE-DOCS-ARCH-001 — Define canonical documentation architecture | CI/Platform/Docs | 2026-09-16 | No PR/migration/query receipt in issue text |
| [SAN-1282](https://linear.app/amo100/issue/SAN-1282/task-482h1-mde-sb-001-establish-the-canonical-supabase-inventory-and) | Task 48.2H.1 · MDE-SB-001 — Establish the Canonical Supabase Inventory and Schema Ownership Bas | Supabase/Data | 2026-09-17 | No PR/migration/query receipt in issue text |
| [SAN-1417](https://linear.app/amo100/issue/SAN-1417/define-the-authoritative-rentalsid-property-detail-design-responsive) | Define the authoritative /rentals/[id] property-detail design — responsive wireframes, states + | Rentals | 2026-10-16 | No PR/migration/query receipt in issue text |
| [SAN-1434](https://linear.app/amo100/issue/SAN-1434/mde-rentals-add-real-production-landlord-profile-and-link-first-rental) | MDE Rentals — Add Real Production Landlord Profile and Link First Rental | Rentals | 2026-10-10 | No PR/migration/query receipt in issue text |
| [SAN-1454](https://linear.app/amo100/issue/SAN-1454/mde-restaurants-contest-restore-and-protect-the-voting-database) | MDE Restaurants Contest — Restore and Protect the Voting Database | Restaurants Contest | 2026-10-17 | No PR/migration/query receipt in issue text |
| [SAN-242](https://linear.app/amo100/issue/SAN-242/san-242-uix-014-screen-005-rental-card-polish-ctas) | SAN-242 · UIX-014 — SCREEN-005 — Rental Card Polish + CTAs | Rentals | 2026-05-28 | No PR/migration/query receipt in issue text |
| [SAN-243](https://linear.app/amo100/issue/SAN-243/uix-015-wire-002-rental-search-in-thread) | UIX-015 — WIRE-002 — Rental Search (in-thread) | AI/Agents | 2026-05-28 | No PR/migration/query receipt in issue text |
| [SAN-327](https://linear.app/amo100/issue/SAN-327/data-019-rentals-data-inventory-live-schema-vs-real-estate-prd) | DATA-019 — Rentals data inventory — live schema vs real-estate PRD | Supabase/Data | 2026-05-30 | No PR/migration/query receipt in issue text |
| [SAN-331](https://linear.app/amo100/issue/SAN-331/data-009-supabase-schema-migrations-venue-booking-anchors-rental) | DATA-009 — Supabase schema migrations — venue booking, anchors, rental indexes | Restaurants | 2026-05-30 | No PR/migration/query receipt in issue text |
| [SAN-347](https://linear.app/amo100/issue/SAN-347/data-020-leads-rental-fk-apartment-id-preferred-showing-at) | DATA-020 — leads rental FK — apartment_id + preferred_showing_at | Supabase/Data | 2026-05-30 | No PR/migration/query receipt in issue text |
| [SAN-348](https://linear.app/amo100/issue/SAN-348/data-023-rental-golden-queries-camila-eval-sql-pack) | DATA-023 — Rental golden queries — Camila eval SQL pack | Supabase/Data | 2026-05-30 | No PR/migration/query receipt in issue text |
| [SAN-349](https://linear.app/amo100/issue/SAN-349/data-021-showings-lifecycle-lead-showing-row-bridge) | DATA-021 — showings lifecycle — lead → showing row bridge | Supabase/Data | 2026-05-30 | No PR/migration/query receipt in issue text |
| [SAN-381](https://linear.app/amo100/issue/SAN-381/data-043-rental-signals-seed-44-apartments) | DATA-043 — rental_signals + seed 44 apartments | Supabase/Data | 2026-05-30 | No PR/migration/query receipt in issue text |
| [SAN-409](https://linear.app/amo100/issue/SAN-409/int-006-sql-date-filters-for-rental-availability-search) | INT-006 — SQL date filters for rental availability search | AI/Agents | 2026-06-01 | No PR/migration/query receipt in issue text |
| [SAN-433](https://linear.app/amo100/issue/SAN-433/san-433-ux-035-verify-ux-003-rental-parser-on-production) | SAN-433 · UX-035 — Verify UX-003 rental parser on production | Rentals | 2026-06-01 | No PR/migration/query receipt in issue text |
| [SAN-458](https://linear.app/amo100/issue/SAN-458/san-458-keep-main-protected-with-floor-and-review-conversation) | SAN-458 · Keep main protected with Floor and review-conversation enforcement | CI/Platform/Docs | 2026-09-27 | No PR/migration/query receipt in issue text |
| [SAN-471](https://linear.app/amo100/issue/SAN-471/san-471-re-004-rental-cards-in-chat) | SAN-471 · RE-004 — Rental cards in chat | AI/Agents | 2026-06-18 | No PR/migration/query receipt in issue text |
| [SAN-545](https://linear.app/amo100/issue/SAN-545/data-embed-fix-rental-embed-api-403-hybrid-search) | DATA-EMBED — Fix rental embed API 403 (hybrid search) | AI/Agents | 2026-06-08 | No PR/migration/query receipt in issue text |
| [SAN-823](https://linear.app/amo100/issue/SAN-823/ux-038-rentals-pattern-based-fast-path-neighborhood-intent) | UX-038 — Rentals: pattern-based fast-path (neighborhood + intent) | Rentals | 2026-06-08 | No PR/migration/query receipt in issue text |

_Count: 25_


### B.4 Duplicate clusters

| Cluster | Members | Canonical owner / action |
| --- | --- | --- |
| Explicit `Duplicate` state | SAN-469, SAN-716, SAN-1091, SAN-1316, SAN-1384, SAN-1492, SAN-1493, SAN-1494, SAN-1495 | Keep canonical owners: SAN-1043, SAN-476/1206, SAN-1105/1284/1286, SAN-1235/1502, SAN-1383/1385, SAN-1456/1498 |
| Contest epics | SAN-1452, SAN-1455, SAN-1456, SAN-1457, SAN-1459 (45 children) | Merge into SAN-1457; re-parent children |
| Rental launch epics | SAN-1315 (112 children) vs SAN-1436 | Keep one; re-parent children |
| Childless tracker epics | SAN-1532, SAN-1533, SAN-1534, SAN-1535, SAN-1550, SAN-1558 | Retire or merge |
| Near-duplicates | SAN-1204 ↔ SAN-476; SAN-1408 ↔ SAN-1406 | Mark duplicate |

### B.5 Label reality

| Label | Issues |
| --- | ---: |
| `MVP_MDE` | 199 |
| `MVP · Launch Blocker` | 62 |
| `MVP · Launch Supporting` | 87 |
| `MVP · Post-MVP` | 96 |
| `MVP · Complete` | 10 |
| `MVP · Removed/Obsolete` | 12 |

Inconsistencies: 74 issues carry an `MVP · …` category without `MVP_MDE`; 6 carry `MVP_MDE` with no category; 28 `Launch Blocker` issues sit in Backlog/Todo; 3 Post-MVP issues are Urgent/High priority. 124 distinct labels across several generations — no single filter rebuilds the launch set.

### B.6 Recommended corrections (edit existing issues first)

| # | Action | Issues | Why |
| --- | --- | --- | --- |
| C1 | Un-Done the 18 issues with open PRs, or close the PR | SAN-1554, SAN-1548, SAN-1508, SAN-1502, SAN-1444, SAN-1421, SAN-1357, SAN-1349, SAN-1312, SAN-1286, SAN-1206, SAN-1105, SAN-1092, SAN-548, SAN-486, SAN-476, SAN-468, SAN-386 | The work already has an issue; the state is wrong |
| C2 | Attach migration/query receipt or re-open 25 no-PR Done issues | SAN-1434, SAN-1454, SAN-1043, SAN-1282, SAN-1202, SAN-1093, SAN-458, SAN-381, SAN-1417, SAN-1275 + 15 data/UI/verification issues | Evidence belongs on the claiming issue |
| C3 | Fix the 28 Backlog/Todo `Launch Blocker` issues | list in `_work/linear-inventory.md` §7 | Label is the launch contract |
| C4 | Merge 5 contest epics into SAN-1457 | SAN-1452, SAN-1455, SAN-1456, SAN-1459 | Duplicate epics hide progress |
| C5 | Keep one rental-launch epic; re-parent 112 children | SAN-1315 vs SAN-1436 | 112 children is not a plan |
| C6 | Mark near-duplicates | SAN-1204↔SAN-476, SAN-1408↔SAN-1406 | 0.90 title similarity |
| C7 | Fix `MVP_MDE` vs `MVP · *` mismatch | 74 + 6 issues | Either filter alone loses work |
| C8 | Re-open/re-scope Done epics with open children | SAN-1281, SAN-1341, SAN-1271 | Done with open children is not Done |
| C9 | Assign the 28 unowned Launch Blockers and 5 unowned In Review issues | — | 331/460 unassigned |
| C10 | Bring 11 outside-project issues into MDE AI or link them | SAN-1561, SAN-1562, SAN-479, SAN-582, SAN-583, SAN-691, SAN-693, SAN-757, SAN-814, SAN-882, SAN-896 | Board under-reports shipping work |
| C11 | Retire the 6 childless tracker epics | SAN-1532, SAN-1533, SAN-1534, SAN-1535, SAN-1550, SAN-1558 | No deliverable, no owner, no child |

### B.7 PRs without a Linear owner

8 open PRs reference no SAN issue: **#100, #214, #234, #256, #452, #471** (plus #403/#404 are covered by SAN-705/709/1193 but not linked as issues in the project view). 11 more PRs reference issues outside the MDE AI project (`SAN-1561`, `SAN-1562`, `SAN-479`, `SAN-582`, `SAN-583`, `SAN-691`, `SAN-693`, `SAN-757`, `SAN-814`, `SAN-882`, `SAN-896`), so the board does not show them.

### B.8 Active-work task-to-PR mapping (required columns)

All 58 In Progress / In Review issues, using the prompt's mapping columns. `Verified progress` describes what the board + PR evidence actually prove; it is not a completion percentage. A green PR is not a deployed or runtime-verified outcome.

| Linear task | Exact task name | Domain | Related PRs | Required outcome | Verified progress | Missing work | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [SAN-1193](https://linear.app/amo100/issue/SAN-1193/mde-partner-signup-autofill-business-details-from-a-website) | MDE Partner Signup — Autofill Business Details From a Website | Partners/Onboarding | [#403](https://github.com/amoai-tech/mdeai/pull/403) open, [#404](https://github.com/amoai-tech/mdeai/pull/404) open | MDE Partner Signup — Autofill Business Details From a Website | In Progress; 2 open PR(s) | Review/merge open PR(s) and capture runtime proof | Medium |
| [SAN-1244](https://linear.app/amo100/issue/SAN-1244/san-1244-make-host-os-recover-cleanly-from-loading-and-service) | SAN-1244 · Make Host OS recover cleanly from loading and service failures | Events | — | Host OS recovers predictably from API, network, chat and server failures without losing dr | In Progress; no linked PR in issue text | Complete implementation | Urgent |
| [SAN-1255](https://linear.app/amo100/issue/SAN-1255/san-1255-keep-only-mastra-agents-with-a-proven-mde-responsibility) | SAN-1255 · Keep only Mastra agents with a proven MDE responsibility | AI/Agents | — | SAN-1255 · Keep only Mastra agents with a proven MDE responsibility | In Progress; no linked PR in issue text | Complete implementation | Medium |
| [SAN-1268](https://linear.app/amo100/issue/SAN-1268/san-1268-keep-one-current-mde-production-readiness-scoreboard) | SAN-1268 · Keep one current MDE production-readiness scoreboard | Unclassified | — | One scoreboard that is derived from evidence, carries a freshness timestamp, and fails lou | In Progress; no linked PR in issue text | Complete implementation | Medium |
| [SAN-1269](https://linear.app/amo100/issue/SAN-1269/san-1269-finish-mde-backlog-cleanup-and-retire-duplicate-or-stale-work) | SAN-1269 · Finish MDE backlog cleanup and retire duplicate or stale work | Unclassified | — | SAN-1269 · Finish MDE backlog cleanup and retire duplicate or stale work | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1284](https://linear.app/amo100/issue/SAN-1284/stop-unauthorized-users-from-running-admin-database-actions) | Stop Unauthorized Users From Running Admin Database Actions | Supabase/Data | [#255](https://github.com/amoai-tech/mdeai/pull/255) open, [#456](https://github.com/amoai-tech/mdeai/pull/456) open, [#58](https://github.com/amoai-tech/mdeai/pull/58) merged, [#78](https://github.com/amoai-tech/mdeai/pull/78) merged, [#79](https://github.com/amoai-tech/mdeai/pull/79) merged, +12 merged | Protect MDE's privileged database actions so a browser user, anonymous caller, or AI tool  | In Progress; 2 open PR(s); 15 merged PR(s) | Review/merge open PR(s) and capture runtime proof | Urgent |
| [SAN-1285](https://linear.app/amo100/issue/SAN-1285/mde-events-publish-event-and-ticket-tiers-atomically-with-safe-retries) | MDE Events — Publish Event and Ticket Tiers Atomically With Safe Retries | Events | [#453](https://github.com/amoai-tech/mdeai/pull/453) open, [#459](https://github.com/amoai-tech/mdeai/pull/459) open, [#437](https://github.com/amoai-tech/mdeai/pull/437) merged, [#454](https://github.com/amoai-tech/mdeai/pull/454) merged | Host reviews an exact AI draft, confirms it, and gets one persisted event with all ticket  | In Progress; 2 open PR(s); 2 merged PR(s) | Review/merge open PR(s) and capture runtime proof | Urgent |
| [SAN-1291](https://linear.app/amo100/issue/SAN-1291/supabase-ci-catch-database-and-security-breakage-before-merge) | Supabase CI — Catch Database and Security Breakage Before Merge | Supabase/Data | [#482](https://github.com/amoai-tech/mdeai/pull/482) open, [#78](https://github.com/amoai-tech/mdeai/pull/78) merged, [#79](https://github.com/amoai-tech/mdeai/pull/79) merged | Make database/security regressions block a PR before merge, using one stable Supabase CI c | In Progress; 1 open PR(s); 2 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1299](https://linear.app/amo100/issue/SAN-1299/epic-make-mde-ai-chats-memory-and-workflows-reliable-in-production) | EPIC · Make MDE AI Chats, Memory, and Workflows Reliable in Production | AI/Agents | [#56](https://github.com/amoai-tech/mdeai/pull/56) merged, [#122](https://github.com/amoai-tech/mdeai/pull/122) merged | EPIC · Make MDE AI Chats, Memory, and Workflows Reliable in Production | In Progress; 2 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1304](https://linear.app/amo100/issue/SAN-1304/san-1304-make-ai-search-work-the-same-after-a-fresh-database-rebuild) | SAN-1304 · Make AI Search Work the Same After a Fresh Database Rebuild | AI/Agents | [#66](https://github.com/amoai-tech/mdeai/pull/66) merged, [#67](https://github.com/amoai-tech/mdeai/pull/67) merged, [#68](https://github.com/amoai-tech/mdeai/pull/68) merged, +2 merged | SAN-1304 · Make AI Search Work the Same After a Fresh Database Rebuild | In Progress; 5 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1311](https://linear.app/amo100/issue/SAN-1311/prove-mde-ai-storage-is-safe-and-reliable-before-production) | Prove MDE AI Storage Is Safe and Reliable Before Production | AI/Agents | [#206](https://github.com/amoai-tech/mdeai/pull/206) merged, [#209](https://github.com/amoai-tech/mdeai/pull/209) merged | Perform the final independent production storage certification after the renter-durability | In Progress; 2 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | Urgent |
| [SAN-1313](https://linear.app/amo100/issue/SAN-1313/keep-scheduled-jobs-reproducible-and-prove-they-actually-work-in) | Keep Scheduled Jobs Reproducible and Prove They Actually Work in Production | Supabase/Data | [#66](https://github.com/amoai-tech/mdeai/pull/66) merged, [#67](https://github.com/amoai-tech/mdeai/pull/67) merged, [#146](https://github.com/amoai-tech/mdeai/pull/146) merged, +2 merged | Keep Scheduled Jobs Reproducible and Prove They Actually Work in Production | In Progress; 5 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1315](https://linear.app/amo100/issue/SAN-1315/san-1315-epic-finish-the-rental-journey-from-apartment-discovery-to) | SAN-1315 · EPIC · Finish the rental journey from apartment discovery to committed viewing | Rentals | [#113](https://github.com/amoai-tech/mdeai/pull/113) merged, [#150](https://github.com/amoai-tech/mdeai/pull/150) merged | SAN-1315 · EPIC · Finish the rental journey from apartment discovery to committed viewing | In Progress; 2 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | Urgent |
| [SAN-1332](https://linear.app/amo100/issue/SAN-1332/san-1332-make-pr-agent-verify-api-claims-before-blocking-a-pr) | SAN-1332 · Make PR-Agent verify API claims before blocking a PR | AI/Agents | [#373](https://github.com/amoai-tech/mdeai/pull/373) open, [#84](https://github.com/amoai-tech/mdeai/pull/84) merged, [#96](https://github.com/amoai-tech/mdeai/pull/96) merged, [#97](https://github.com/amoai-tech/mdeai/pull/97) merged, +8 merged | Stop PR-Agent from blocking correct MDE code because of stale, unsupported, or misidentifi | In Progress; 1 open PR(s); 11 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1380](https://linear.app/amo100/issue/SAN-1380/help-buyers-find-and-compare-new-condo-projects-with-one-ai-concierge) | Help Buyers Find and Compare New Condo Projects With One AI Concierge | New Projects | [#248](https://github.com/amoai-tech/mdeai/pull/248) open, [#235](https://github.com/amoai-tech/mdeai/pull/235) merged, [#237](https://github.com/amoai-tech/mdeai/pull/237) merged, [#241](https://github.com/amoai-tech/mdeai/pull/241) merged | Give buyers one grounded AI concierge for verified New Projects without creating a second  | In Progress; 1 open PR(s); 3 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1383](https://linear.app/amo100/issue/SAN-1383/epic-mde-new-projects-launch-the-new-construction-buyer-to-developer) | EPIC · MDE New Projects — Launch the New-Construction Buyer-to-Developer Commission Journey | New Projects | — | Launch one trustworthy New Projects journey: | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1386](https://linear.app/amo100/issue/SAN-1386/epic-mastra-upgrade-upgrade-mde-without-losing-chats-or-breaking) | EPIC · Mastra Upgrade — Upgrade MDE Without Losing Chats or Breaking Workflows | AI/Agents | — | EPIC · Mastra Upgrade — Upgrade MDE Without Losing Chats or Breaking Workflows | In Progress; no linked PR in issue text | Complete implementation | Urgent |
| [SAN-1390](https://linear.app/amo100/issue/SAN-1390/epic-mde-uiux-one-simple-chat-map-and-mobile-experience) | EPIC · MDE UI/UX — One Simple Chat, Map and Mobile Experience | Maps | [#300](https://github.com/amoai-tech/mdeai/pull/300) merged | EPIC · MDE UI/UX — One Simple Chat, Map and Mobile Experience | In Progress; 1 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1391](https://linear.app/amo100/issue/SAN-1391/let-rental-owners-and-brokers-save-and-resume-setup) | Let Rental Owners and Brokers Save and Resume Setup | Rentals | [#244](https://github.com/amoai-tech/mdeai/pull/244) open, [#267](https://github.com/amoai-tech/mdeai/pull/267) merged | Let Rental Owners and Brokers Save and Resume Setup | In Progress; 1 open PR(s); 1 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1406](https://linear.app/amo100/issue/SAN-1406/mde-new-projects-expand-verified-laureles-new-construction-inventory) | MDE New Projects — Expand Verified Laureles New-Construction Inventory | New Projects | [#249](https://github.com/amoai-tech/mdeai/pull/249) merged | Expand the production New Projects catalog with additional verified Laureles / Laureles-Es | In Progress; 1 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | Medium |
| [SAN-1431](https://linear.app/amo100/issue/SAN-1431/stage-multi-source-medellin-rental-candidates-and-verify-3-for-launch) | Stage Multi-Source Medellín Rental Candidates and Verify 3 for Launch | Rentals | [#252](https://github.com/amoai-tech/mdeai/pull/252) merged, [#258](https://github.com/amoai-tech/mdeai/pull/258) merged, [#259](https://github.com/amoai-tech/mdeai/pull/259) merged, +10 merged | Stage Multi-Source Medellín Rental Candidates and Verify 3 for Launch | In Progress; 13 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1436](https://linear.app/amo100/issue/SAN-1436/epic-mde-rentals-get-real-production-rentals-launch-ready) | EPIC · MDE Rentals — Get Real Production Rentals Launch-Ready | Rentals | — | Launch rentals with 3 distinct, independently verified Medellín apartments that are publis | In Progress; no linked PR in issue text | Complete implementation | Urgent |
| [SAN-1437](https://linear.app/amo100/issue/SAN-1437/epic-google-maps-platform-make-maps-places-grounding-and-routes) | EPIC · Google Maps Platform — Make Maps, Places, Grounding, and Routes Production-Ready | Maps | — | Make MDE's shared Google Maps platform production-ready without creating a second map stor | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1438](https://linear.app/amo100/issue/SAN-1438/mde-accounts-let-one-user-be-a-customer-and-an-authorized-partner) | MDE Accounts — Let One User Be a Customer and an Authorized Partner Safely | Partners/Onboarding | [#267](https://github.com/amoai-tech/mdeai/pull/267) merged | MDE Accounts — Let One User Be a Customer and an Authorized Partner Safely | In Progress; 1 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1442](https://linear.app/amo100/issue/SAN-1442/epic-mde-whatsapp-shared-channel-rental-journeys-and-partner-messaging) | EPIC · MDE WhatsApp — Shared Channel, Rental Journeys & Partner Messaging | WhatsApp | [#324](https://github.com/amoai-tech/mdeai/pull/324) open, [#309](https://github.com/amoai-tech/mdeai/pull/309) merged, [#311](https://github.com/amoai-tech/mdeai/pull/311) merged, [#314](https://github.com/amoai-tech/mdeai/pull/314) merged, +1 merged | Build one WhatsApp channel that reuses MDE's existing conciergeAgent, grounded rentals/ven | In Progress; 1 open PR(s); 4 merged PR(s) | Review/merge open PR(s) and capture runtime proof | Medium |
| [SAN-1451](https://linear.app/amo100/issue/SAN-1451/mde-rentals-harden-fincaraiz-photo-publishing-script) | MDE Rentals — Harden Fincaraíz Photo Publishing Script | Rentals | — | MDE Rentals — Harden Fincaraíz Photo Publishing Script | In Progress; no linked PR in issue text | Complete implementation | Low |
| [SAN-1457](https://linear.app/amo100/issue/SAN-1457/mde-restaurants-contest-build-the-top-100-pages-maps-and-voting) | MDE Restaurants Contest — Build the Top 100 Pages, Maps and Voting Screens | Restaurants Contest | — | MDE Restaurants Contest — Build the Top 100 Pages, Maps and Voting Screens | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1473](https://linear.app/amo100/issue/SAN-1473/mde-restaurants-contest-test-the-complete-website-on-mobile-and) | MDE Restaurants Contest — Test the Complete Website on Mobile and Desktop | Restaurants Contest | — | MDE Restaurants Contest — Test the Complete Website on Mobile and Desktop | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1486](https://linear.app/amo100/issue/SAN-1486/mde-events-show-correct-medellin-event-times-without-hydration-errors) | MDE Events — Show Correct Medellín Event Times Without Hydration Errors | Events | [#313](https://github.com/amoai-tech/mdeai/pull/313) open, [#310](https://github.com/amoai-tech/mdeai/pull/310) merged | A visitor opening an MDE event sees the correct Medellín-local date and time, and the page | In Progress; 1 open PR(s); 1 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1487](https://linear.app/amo100/issue/SAN-1487/mde-concierge-fix-mastra-workspace-filesystem-errors-on-vercel) | MDE Concierge — Fix Mastra Workspace Filesystem Errors on Vercel | AI/Agents | [#310](https://github.com/amoai-tech/mdeai/pull/310) merged, [#312](https://github.com/amoai-tech/mdeai/pull/312) merged | MDE Concierge on Vercel should initialize only the workspace capabilities it can actually  | In Progress; 2 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1496](https://linear.app/amo100/issue/SAN-1496/mde-restaurants-contest-enforce-one-authenticated-ballot-per-persons) | MDE Restaurants Contest — Enforce One Authenticated Ballot Per Person's Account | Restaurants Contest | [#315](https://github.com/amoai-tech/mdeai/pull/315) merged, [#325](https://github.com/amoai-tech/mdeai/pull/325) merged | Exactly one final restaurant audience ballot per verified Supabase account per contest, ev | In Progress; 2 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1503](https://linear.app/amo100/issue/SAN-1503/mde-rentals-import-15-livcasacoloasis-listings-and-photos-into) | MDE Rentals — Import 15 LIV/Casacol/OASIS Listings and Photos into Supabase Safely | Supabase/Data | [#362](https://github.com/amoai-tech/mdeai/pull/362) open, [#329](https://github.com/amoai-tech/mdeai/pull/329) merged, [#330](https://github.com/amoai-tech/mdeai/pull/330) merged, [#333](https://github.com/amoai-tech/mdeai/pull/333) merged, +7 merged | MDE Rentals — Import 15 LIV/Casacol/OASIS Listings and Photos into Supabase Safely | In Progress; 1 open PR(s); 10 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1522](https://linear.app/amo100/issue/SAN-1522/make-mde-pr-agent-reviews-faster-and-reliable-with-nemotron-35-super) | Make MDE PR-Agent reviews faster and reliable with Nemotron 3.5 Super VL | AI/Agents | [#332](https://github.com/amoai-tech/mdeai/pull/332) merged, [#336](https://github.com/amoai-tech/mdeai/pull/336) merged, [#349](https://github.com/amoai-tech/mdeai/pull/349) merged, +1 merged | Make MDE PR-Agent reviews faster and reliable with Nemotron 3.5 Super VL | In Progress; 4 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1525](https://linear.app/amo100/issue/SAN-1525/mde-restaurants-contest-add-my-votes-and-cross-device-vote-history) | MDE Restaurants Contest — Add My Votes and Cross-Device Vote History | Restaurants Contest | [#375](https://github.com/amoai-tech/mdeai/pull/375) merged, [#377](https://github.com/amoai-tech/mdeai/pull/377) merged | A signed-in voter opens /me/votes, sees every actual restaurant contest ballot, opens the  | In Progress; 2 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | High |
| [SAN-1532](https://linear.app/amo100/issue/SAN-1532/epic-mde-search-verified-progress-tracker-and-implementation-order) | EPIC · MDE Search — Verified Progress Tracker and Implementation Order | AI/Agents | — | EPIC · MDE Search — Verified Progress Tracker and Implementation Order | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1533](https://linear.app/amo100/issue/SAN-1533/mde-roadmap-maintain-one-grouped-development-progress-tracker-for-all) | MDE Roadmap — Maintain One Grouped Development Progress Tracker for All Active Tasks | Maps | — | Maintain one current, linked MDE-wide roadmap and execution progress tracker for every act | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1534](https://linear.app/amo100/issue/SAN-1534/mde-uiux-roadmap-and-verified-progress-tracker) | MDE UI/UX —Roadmap and Verified Progress Tracker | Maps | [#405](https://github.com/amoai-tech/mdeai/pull/405) open, [#451](https://github.com/amoai-tech/mdeai/pull/451) merged, [#460](https://github.com/amoai-tech/mdeai/pull/460) merged, [#462](https://github.com/amoai-tech/mdeai/pull/462) merged | MDE UI/UX —Roadmap and Verified Progress Tracker | In Progress; 1 open PR(s); 3 merged PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1535](https://linear.app/amo100/issue/SAN-1535/epic-mde-vector-search-verified-progress-tracker-and-runtime-readiness) | EPIC · MDE Vector Search — Verified Progress Tracker and Runtime Readiness | AI/Agents | — | EPIC · MDE Vector Search — Verified Progress Tracker and Runtime Readiness | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1537](https://linear.app/amo100/issue/SAN-1537/make-full-test-runs-reliable-without-hiding-failures) | Make Full Test Runs Reliable Without Hiding Failures | CI/Platform/Docs | [#389](https://github.com/amoai-tech/mdeai/pull/389) open | PRs can trust npm run floor: intermittent Vitest failures are diagnosed from the exact fai | In Progress; 1 open PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-1538](https://linear.app/amo100/issue/SAN-1538/mde-partners-complete-partner-journeys-ai-and-dashboard) | MDE Partners — Complete Partner Journeys, AI & Dashboard | Partners/Onboarding | — | Deliver one working MDE partner journey: discover partner landing → sign up or submit a gu | In Progress; no linked PR in issue text | Complete implementation | No priority |
| [SAN-1550](https://linear.app/amo100/issue/SAN-1550/epic-mde-ai-unified-ai-foundation-and-stakeholder-architecture-6) | EPIC · MDE AI — Unified AI Foundation & Stakeholder Architecture (6 Documents · 13 Diagrams) | AI/Agents | — | One canonical index for MDE's shared AI foundation across every stakeholder. This epic lin | In Progress; no linked PR in issue text | Complete implementation | Medium |
| [SAN-1555](https://linear.app/amo100/issue/SAN-1555/mde-ai-opendots-map-editable-ai-reviews-and-saved-results-to-existing) | MDE AI OpenDots — Map Editable AI Reviews and Saved Results to Existing Workflows | Maps | [#431](https://github.com/amoai-tech/mdeai/pull/431) merged | Map reusable editable-AI-review and action-receipt patterns to MDE's existing review frame | In Progress; 1 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | Medium |
| [SAN-1558](https://linear.app/amo100/issue/SAN-1558/epic-mde-mobile-verified-progress-tracker-and-end-to-end-journeys) | EPIC · MDE Mobile — Verified Progress Tracker and End-to-End Journeys | Unclassified | — | Track and complete the 24 labeled mobilemde issues with evidence-based progress, defect fi | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-1560](https://linear.app/amo100/issue/SAN-1560/mde-events-show-accurate-ticket-prices-and-actions-in-the-public) | MDE Events — Show Accurate Ticket Prices and Actions in the Public Catalog | Events | [#453](https://github.com/amoai-tech/mdeai/pull/453) open, [#461](https://github.com/amoai-tech/mdeai/pull/461) open | In public Events browse, ticket prices/actions reflect actual active sellable tiers, not s | In Progress; 2 open PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-412](https://linear.app/amo100/issue/SAN-412/make-the-concierge-understand-the-selected-map-place-and-viewport) | Make the concierge understand the selected map place and viewport | Maps | — | Make the concierge understand the exact place the user selected on the map and the current | In Progress; no linked PR in issue text | Complete implementation | High |
| [SAN-546](https://linear.app/amo100/issue/SAN-546/lucia-prod-journey-matrix-j05-j20-rentals-venues-maps-mobile) | Lucía: Prod journey matrix J05–J20 (rentals, venues, maps, mobile) | Restaurants | [#420](https://github.com/amoai-tech/mdeai/pull/420) open, [#415](https://github.com/amoai-tech/mdeai/pull/415) merged, [#418](https://github.com/amoai-tech/mdeai/pull/418) merged, [#438](https://github.com/amoai-tech/mdeai/pull/438) merged, +2 merged | Prove the launch-critical production journeys for rentals, venues, maps and mobile work en | In Progress; 1 open PR(s); 5 merged PR(s) | Review/merge open PR(s) and capture runtime proof | Urgent |
| [SAN-677](https://linear.app/amo100/issue/SAN-677/mde-onboarding-prove-a-new-rental-partner-can-onboard-publish-receive) | MDE Onboarding — Prove a New Rental Partner Can Onboard, Publish + Receive the First Viewing | Partners/Onboarding | [#455](https://github.com/amoai-tech/mdeai/pull/455) open | Prove the complete production-shaped rental-partner lifecycle using the real application s | In Progress; 1 open PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-705](https://linear.app/amo100/issue/SAN-705/mde-partner-ai-add-one-assistant-for-every-partner-type) | MDE Partner AI — Add One Assistant for Every Partner Type | Partners/Onboarding | [#400](https://github.com/amoai-tech/mdeai/pull/400) open, [#403](https://github.com/amoai-tech/mdeai/pull/403) open | MDE Partner AI — Add One Assistant for Every Partner Type | In Progress; 2 open PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-709](https://linear.app/amo100/issue/SAN-709/mde-partner-signup-let-ai-suggest-fields-you-can-review-and-edit) | MDE Partner Signup — Let AI Suggest Fields You Can Review and Edit | Partners/Onboarding | [#403](https://github.com/amoai-tech/mdeai/pull/403) open, [#404](https://github.com/amoai-tech/mdeai/pull/404) open | MDE Partner Signup — Let AI Suggest Fields You Can Review and Edit | In Progress; 2 open PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-878](https://linear.app/amo100/issue/SAN-878/gnd-002-maps-attribution-tos-on-grounded-cards) | GND-002 — Maps attribution ToS on grounded cards | Maps | [#246](https://github.com/amoai-tech/mdeai/pull/246) merged | GND-002 — Maps attribution ToS on grounded cards | In Progress; 1 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | Medium |
| [SAN-116](https://linear.app/amo100/issue/SAN-116/san-116-keep-ticket-and-sponsor-stripe-webhooks-isolated) | SAN-116 · Keep ticket and sponsor Stripe webhooks isolated | Events | — | Stripe Events checkout and sponsor payments cannot process one another's callbacks, secret | In Review — review decision pending; no linked PR in issue text | Review, merge, then capture runtime proof | Urgent |
| [SAN-1209](https://linear.app/amo100/issue/SAN-1209/keep-the-same-host-ai-conversation-while-moving-between-host-pages) | Keep the Same Host AI Conversation While Moving Between Host Pages | Events | — | Host AI keeps the same authorized conversation while navigating Host pages and after a bro | In Review — review decision pending; no linked PR in issue text | Review, merge, then capture runtime proof | High |
| [SAN-1267](https://linear.app/amo100/issue/SAN-1267/san-1267-let-buyers-view-their-purchased-ticket-qr-codes) | SAN-1267 · Let buyers view their purchased ticket QR codes | Events | — | A paid buyer can open their own ticket QR after login or browser refresh, without needing  | In Review — review decision pending; no linked PR in issue text | Review, merge, then capture runtime proof | High |
| [SAN-1314](https://linear.app/amo100/issue/SAN-1314/san-1314-keep-production-online-when-vercel-configuration-changes) | SAN-1314 · Keep production online when Vercel configuration changes | CI/Platform/Docs | [#76](https://github.com/amoai-tech/mdeai/pull/76) merged, [#80](https://github.com/amoai-tech/mdeai/pull/80) merged, [#112](https://github.com/amoai-tech/mdeai/pull/112) merged | SAN-1314 · Keep production online when Vercel configuration changes | In Review — review decision pending; 3 merged PR(s) | Prove the merged work at runtime; no open PR covers the remaining scope | Urgent |
| [SAN-1564](https://linear.app/amo100/issue/SAN-1564/stop-the-mobile-map-from-throwing-when-the-chat-sheet-closes) | Stop the Mobile Map From Throwing When the Chat Sheet Closes | Maps | [#473](https://github.com/amoai-tech/mdeai/pull/473) open, [#474](https://github.com/amoai-tech/mdeai/pull/474) open | Stop the Mobile Map From Throwing When the Chat Sheet Closes | In Review — review decision pending; 2 open PR(s) | Review/merge open PR(s) and capture runtime proof | High |
| [SAN-178](https://linear.app/amo100/issue/SAN-178/san-178-prove-a-real-production-ticket-purchase-works-end-to-end) | SAN-178 · Prove a real production ticket purchase works end to end | Events | [#453](https://github.com/amoai-tech/mdeai/pull/453) open | Prove one exact public release can process a genuine production ticket payment and issue a | In Review — review decision pending; 1 open PR(s) | Review/merge open PR(s) and capture runtime proof | Urgent |
| [SAN-729](https://linear.app/amo100/issue/SAN-729/show-hosts-real-business-numbers-when-they-ask-the-ai) | Show Hosts Real Business Numbers When They Ask the AI | Events | — | When a host asks AI about revenue, sales or attendees, the answer uses their real Supabase | In Review — review decision pending; no linked PR in issue text | Review, merge, then capture runtime proof | High |
| [SAN-974](https://linear.app/amo100/issue/SAN-974/san-974-prove-event-checkout-works-from-stripe-payment-to-ticket-qr) | SAN-974 · Prove event checkout works from Stripe payment to ticket QR | Events | [#453](https://github.com/amoai-tech/mdeai/pull/453) open | Prove the existing Stripe test-mode purchase creates exactly one paid order, one QR entitl | In Review — review decision pending; 1 open PR(s) | Review/merge open PR(s) and capture runtime proof | Urgent |

_Active total: 58 (In Progress 50, In Review 8)._

---

## Appendix C — Page and API inventory

Source: clean `origin/main` snapshot `5d1d76ddf6` (`/tmp/mde-main`), verified by reading each file. **47 page routes, 35 API route handlers + 2 auth routes.** Status: W Working · P Partial · U Unverified · B Broken/placeholder · N Not implemented · D Dev-only.


### C.1 Page routes (47)

Status: **W** Working · **P** Partial · **U** Unverified (code read, no journey proof) · **B** Broken/placeholder · **N** Not implemented · **D** Dev-only. **Desktop/Mobile** record the implemented surface (`yes`/`—`); they are not runtime verification.

#### Public / discovery

| Route | Role | Functionality (verified) | Data / API | AI | Desktop | Mobile | Status | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` `src/app/page.tsx:22` | Public | Marketing home, 15 home sections; `q` redirects to `/chat?q=` | static | concierge entry | yes | yes | W | P0 |
| `/chat` `src/app/chat/page.tsx:4` | Public | `ChatPageClient` → `GeoChatShell` inside `MapContextProvider` | `/api/copilotkit` | CopilotKit v2 + Mastra | yes | yes | W | P0 |
| `/rentals` `src/app/rentals/(browse)/page.tsx:28` | Public | Browse; `searchRentals` at `:48`; error path `:61` | `apartments` | shared tool | yes | yes | W | P0 |
| `/rentals/[id]` `src/app/rentals/[id]/page.tsx:57` | Public | Detail + metadata | `getRentalDetail` | none | yes | yes | W | P0 |
| `/restaurants` `src/app/restaurants/page.tsx:47` | Public | Browse + cuisine/nbhd filters; contest discovery link (`e2e/san-1524-contests.spec.ts:36-39`) | `restaurants` | shared tool | yes | yes | W | P0 |
| `/restaurants/[id]` `src/app/restaurants/[id]/page.tsx:16` | Public | **Detail page exists and serves 200.** `fetchRestaurantById` → `restaurants` (`src/lib/restaurants/fetch-restaurant-by-id.ts:54`) + `vote_restaurant_target` (`:93`) + `vote_restaurant_contest_options` (`:134`); renders `RestaurantVotePanel` (`:11`); `?contest_id=` selects the ballot (`:26-31`); honest error + not-found states (`:28-41`) | `restaurants`, vote RPCs | none | yes | yes | W | P0 |
| `/cafes` `src/app/cafes/page.tsx:23` | Public | Browse via `venue_anchors` | `venue_anchors` | none | yes | yes | U | P1 |
| `/nightlife` `src/app/nightlife/page.tsx:29` | Public | Browse via `venue_anchors` | `venue_anchors` | none | yes | yes | U | P1 |
| `/events` `src/app/events/page.tsx:45` | Public | Browse, enum-validated `category`/`dateWindow`/`price` | `GET /api/events/public` | indirect | yes | yes | W | P0 |
| `/events/[slug]` `src/app/events/[slug]/page.tsx:26` | Public | Detail + `EventCheckoutNotice` + `EventDetailView` | `getPublicEvent` (`events`,`event_tickets`) | none | yes | yes | W | P0 |
| `/new-projects` `src/app/new-projects/page.tsx:18` | Public | Development-project browse; `listNewProjects` → `development_projects` (`src/lib/new-projects/queries.ts:32`) | `development_projects` | yes (AI compare tool) | yes | yes | W | P1 |
| `/new-projects/[slug]` `src/app/new-projects/[slug]/page.tsx:30` | Public | Detail; `getNewProjectBySlug` → projects + `development_unit_types` (`queries.ts:47`), `development_project_sources` (`:91`) | same | none | yes | yes | W | P1 |
| `/contests` `src/app/contests/page.tsx:181` | Public | Contest discovery list; `listPublicContests` → RPC `contest_public_list` (`src/lib/restaurants/contest-public.ts:87`); state labels `:8-13` | `vote.contests` via RPC | none | yes | yes | W | P0 |
| `/contests/[id]` `src/app/contests/[id]/page.tsx:59` | Public | Contest detail; `getPublicContest` → RPC `contest_public_get` (`contest-public.ts:113`); request-deduped via `cache()` (`:18`); `ContestNomineeCard` | `vote.*` via RPC | none | yes | yes | W | P0 |
| `/venues` `src/app/venues/page.tsx:40` | Public | Venue-partner landing, `?v=` variants | static | none | yes | yes | W | P1 |
| `/partners` `src/app/partners/page.tsx:11` | Public | Partner hub | static | none | yes | yes | W | P1 |
| `/partners/rentals` `src/app/partners/rentals/page.tsx:16` | Public | `PartnerLandingPlaceholder` | static | none | yes | yes | B | P2 |
| `/partners/restaurants` `src/app/partners/restaurants/page.tsx:13` | Public | Real landing: `<VenuesLanding variant="restaurant" />` (`:16`) | static | none | yes | yes | W | P1 |
| `/partners/cafes` `src/app/partners/cafes/page.tsx:13` | Public | `VenuesLanding` variant cafe | static | none | yes | yes | W | P1 |
| `/partners/nightlife` `src/app/partners/nightlife/page.tsx:13` | Public | `VenuesLanding` variant nightclub | static | none | yes | yes | W | P1 |
| `/business/ai` `src/app/business/ai/page.tsx:17` | Public | `PartnerLandingPlaceholder` | static | none | yes | yes | B | P2 |
| `/sponsors` `src/app/sponsors/page.tsx:16` | Public | `PartnerLandingPlaceholder` | static | none | yes | yes | B | P2 |
| `/contact` `src/app/contact/page.tsx:13` | Public | Contact form; `isPartnerType` seeds type (`:18`), `ContactLeadForm` (`:33`) → `/api/partners/contact-leads` | `leads` | none | yes | yes | W | P1 |
| `/host` `src/app/host/page.tsx:14` | Public | Event-host marketing (`EventHostLanding`) | static | none | yes | yes | W | P1 |
| `/login` `src/app/login/page.tsx:15` | Public | Email auth + `safeNextPath` | `getServerUser` | none | yes | yes | W | P0 |
| `/signup` `src/app/signup/page.tsx:10` | Public | Email auth + existing-session card | `getServerUser` | none | yes | yes | W | P0 |
| `/partners/signup` `src/app/partners/signup/page.tsx:28` | Public | Signup wizard + type picker | `/api/partners/activate` | none | yes | yes | U | P1 |

#### Authenticated consumer

| Route | Role | Functionality | Data | AI | Desktop | Mobile | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/saved` `src/app/saved/page.tsx:15` | User | Saved collections; anon prompt | `collections` | none | yes | yes | W |
| `/trips` `src/app/trips/page.tsx:12` | User | Trips dashboard | `trips` | none | yes | yes | W |
| `/trips/[id]` `src/app/trips/[id]/page.tsx:12` | User | Trip workspace | `trip_items` | none | yes | yes | W |
| `/me/tickets` `src/app/me/tickets/page.tsx:12` | Buyer | Upcoming/past orders | `listBuyerOrders` | none | yes | yes | U |
| `/me/tickets/[id]` `src/app/me/tickets/[id]/page.tsx:12` | Buyer | Ticket detail | wallet token | none | yes | yes | U |

#### Host / broker / admin

| Route | Role | Functionality | Data | AI | Desktop | Mobile | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/host/event/new` `src/app/host/event/new/page.tsx:8` | Host | `HostEventShell` with `agentId="hostEventAgent"` | `/api/approval-commit` | **yes** | yes | — | U |
| `/host/events` `src/app/host/events/page.tsx:21` | Host | Auth-gated event list | `events` | none | yes | yes | W |
| `/host/dashboard` `src/app/host/dashboard/page.tsx:11` | Host | Auth-gated `HostDashboardOsShell` | `loadHostDashboardInitial` | hostOps agent | yes | — | U |
| `/host/analytics` `src/app/host/analytics/page.tsx:11` | Host | Auth-gated analytics shell | same loader | none | yes | — | U |
| `/host/rentals/(broker)` `.../(broker)/page.tsx:46` | Broker | Workspace + concierge; layout gate | `fetchBrokerDashboard` | rentals mode | yes | — | W |
| `.../(broker)/listings/page.tsx:35` | Broker | Inventory in Suspense | `fetchBrokerListings` | none | yes | — | W |
| `.../(broker)/dashboard/page.tsx:6` | Broker | 8-line redirect to overview | — | — | — | — | W |
| `/host/rentals/onboarding` `.../onboarding/page.tsx:13` | Broker | Wizard; unauth + already-onboarded redirects | `getBrokerContext` | none | yes | yes | W |
| `/admin/contests` `src/app/admin/contests/page.tsx:17` | Admin | Contest list; gate `is_admin()` (`:25`); `createContestAction` server action (`:6`) | RPC `admin_contest_list` (`contest-admin.ts:74`) | none | yes | yes | P |
| `/admin/contests/[id]` `src/app/admin/contests/[id]/page.tsx:13` | Admin | Detail: `ContestDetailsForm`, `ContestEntries`, `ContestActivity` (`:6-8`); `listCatalogRestaurants` (`excludeIds`) | `admin_contest_get`, `admin_contest_update`, link/unlink RPCs | none | yes | yes | P |
| `/admin/event-bookings` `src/app/admin/event-bookings/page.tsx:14` | Admin | Approval queue, three states | `/api/admin/event-bookings` | none | yes | yes | W |
| `/admin/rentals` `src/app/admin/rentals/page.tsx:14` | Admin | Rental **test mode** panel only (`:3`) | `/api/admin/rentals/test` | none | yes | — | P |

#### Dev-only (D)

`/dev/chat-virtualization` `page.tsx:51`, `/dev/chat-empty-thread` `page.tsx:17` (hard `notFound()` unless `isDeterministicE2E()`, `:18`), `/dev/rentals` `page.tsx:14` (`notFound()` at `:21`). Never user-reachable.

---

### C.2 API routes (35 + 2 auth)

Main-only routes that matter for the plan are marked **★**.

| Route | Auth | Functionality | Downstream | Status |
|---|---|---|---|---|
| `/api/copilotkit/[[...path]]` | Supabase user + distributed rate limit | CopilotKit v2 runtime, Mastra agent map, per-turn audit | Mastra, `ai_runs` | W |
| `/api/rentals/search` | none | POST search | `apartments` | W |
| `/api/restaurants/search` | none | POST search + photo enrichment | `restaurants` | W |
| ★ `/api/restaurants/my-vote` `route.ts:15` | user (`:25`) | GET caller's receipt; **service-role RPC `vote_my_receipt`** (`:30`); 503 if no service client (`:28`) | `vote.votes` join `vote.entities`/`restaurants` | W |
| `/api/events/public`, `/api/events/[id]/public` | none | paged catalog / single event | events | W |
| `/api/events/search` | none | hybrid search, returns `hybridUsed`/`rankExplanation` | embeddings | U |
| `/api/events/proposal` | user | proposal insert | `insertEventProposal` | W |
| `/api/grounded/search`, `/api/grounding/event-web` | rate-limited | grounded place search / web grounding | Google/Gemini | U |
| ★ `/api/places/search` | rate-limited | GET place search | Google Places | W |
| `/api/places/detail`, `/api/places/photo` | rate-limited | detail / photo proxy (429, 503, 502 paths) | Google Places | W |
| ★ `/api/new-projects/search` | none | POST project search | `development_projects` | W |
| ★ `/api/partners/contact-leads` | service-role + replay/idempotency | POST contact lead; verifies saved row (`:52`), returns `replayed:true` on existing receipt (`:58`) | `leads` | W |
| `/api/partners/venue-leads` | user | venue lead → `leads` | `leads` | U |
| `/api/partners/activate` | user + service role | partner activation; 201/200, 503 | `partners` | U |
| ★ `/api/host/rentals/viewings/[id]` `route.ts:18` | user + ownership (403) | **PATCH viewing action**; validates action (`:45`), time (`:64`) | `showings` | W |
| `/api/host/rentals/listings/[id]/detail` | user + ownership | listing + contacts + lead/viewing counts | `apartments`,`leads`,`showings` | W |
| `/api/host/rentals/listings/publish` | user | publish FSM RPC | publish RPC | W |
| `/api/leads/schedule-viewing` | user session | viewing request | edge fn, `leads`/`showings` | U |
| `/api/venue-booking/request` | user | booking request | `venue_booking_requests` | U |
| `/api/tickets/checkout` | none (buyer email) | POST → edge fn `ticket-checkout`; requires session url + order + access token else 502 | Stripe (edge) | U |
| `/api/tickets/wallet` | order id + token | wallet payload | `getWalletOrderByToken` | U |
| `/api/approval-commit` | user | HITL commit → edge fn `approval-commit` | `approval_requests/decisions` | U |
| ★ `/api/admin/rentals/test` `route.ts:106` | admin `is_admin()` (`:42`) | GET test-mode fixture state; writes fixture rows (`:128-153`) | `apartments`, test tables | W (admin-only prelaunch tool) |
| ★ `/api/admin/event-bookings` | admin | queue GET, decision POST, workflow run id | `event_*` | W |
| ★ `/api/threads` | user + service role | list threads | `mastra_threads` | W |
| ★ `/api/threads/[threadId]` `route.ts:29` | user + ownership (403 `:63`) | PATCH thread title; 404/403/`updated:false` | `mastra_threads`, `mastra_messages` | W |
| ★ `/api/threads/[threadId]/messages` `route.ts:24` | user + ownership | GET history; NO_STORE; 503/404/403 | `mastra_messages` | W |
| ★ `/api/whatsapp/webhook` `route.ts:59` | Meta HMAC (`:72`), 401/400/413/503 paths | POST verify → **durably record before processing** (`after()` `:12`); GET verify handshake (`:48`); statuses (`:95-102`) | `whatsapp_*`, service role | W (server) |
| ★ `/api/whatsapp/process-inbound` `route.ts:20` | shared secret (`:22-24`) | POST sweeper: 503 when disabled/unconfigured, summary | `whatsapp_messages` | W (server) |
| `/api/scorers` | none | list Mastra scorers | `mastra_scorers` | W |
| ★ `/api/version` | none | returns `sha`, `environment`, `NO_STORE` | build env | W |
| `/api/dev/rental-photo/[slug]/[filename]` | dev fixture | local rental photo serving | filesystem | D |
| `/auth/callback`, `/auth/signout` | — | Supabase code exchange / sign out | auth | W |


**Page claims contradicted by planning docs:** Super Admin is 4 pages, not 9 surfaces; partner dashboards do not exist; landlord management has tables only; refunds/payouts have tables only; contests and restaurant detail exist (the earlier “absent” claim came from a `public`-only table query — the data is in the `vote` schema). Production HTTP confirms public pages return 200 and auth-gated pages 307 to `/login`.

---

## Appendix D — Live database inventory

Source: Supabase Management API read-only SQL against project `zkwcbyxiwklihegjhuql` (`medellin`), 2026-10-21. The configured `mcp__supabase__*` tools point at a different project (`nvdlhrodvevgwdsneplk`) and were not used.

### D.1 Tables by domain

| Domain | Tables | Key exact rows |
| --- | ---: | --- |
| Rentals | 30 | apartments 44 · leads 19 · showings 8 · bookings 7 · development_projects 16 · landlord_profiles 7 |
| Events / ticketing | 19 | events 65 · event_orders 202 · event_tickets 21 · event_attendees 41 · event_check_ins 3 |
| Restaurants / votes | 1 public + 11 `vote` | restaurants 44 · vote.contests 4 · vote.entities 15 · vote.votes 4 · vote.entity_tally 4 · vote_consumed_nonces 99 |
| Partners | 11 | partners 9 · partner_locations 6 · partner_organizations 0 · partner_members est 0 |
| Admin / infra | 29 | profiles 1235 · user_roles 3 · payments 3 · idempotency_keys 72 · search_logs 3298 |
| AI / chat / search | 46 | ai_runs 2015 · mastra_threads est 156 · listing_embeddings 44 · event_embeddings 65 · restaurant_embeddings 44 · embedding_jobs est 255 |
| Other app schemas | sponsor 10 · marketing 12 · outreach 6 · openclaw 4 · postiz 5 · paperclip 5 · hermes 5 | — |

**Total: 194 app tables**; 193 RLS-enabled (exception: PostGIS `spatial_ref_sys`); 540 policies.

### D.2 Functions and security flags

- 190 app-owned functions in `public`; **0 missing `search_path`**.
- **23 anon-executable SECURITY DEFINER** functions. Five flagged:

| Function | Issue | Severity |
| --- | --- | --- |
| `redeem_promo_code` | anon, no caller check, unconditional `usage_count++` | **High** — unauthenticated promo exhaustion |
| `ticket_validate_consume` | anon, consumes QR, returns `attendee_name` on refunded/used | **High** — token burn + PII |
| `fn_record_conversion` | anon, no internal guard | Medium — metric poisoning |
| `fn_join_wait_list` | anon, no internal guard | Medium — wait-list spam |
| `stripe_payment_intent` not UNIQUE | finalize idempotency rests on status guard | Medium — verify webhook retries |

Vote/contest RPCs are correctly service-role-only; identity arrives as an argument, so the Edge/route layer is the trust boundary (unverified from SQL). Duplicate prevention is DB-enforced: `vote_votes_one_restaurant_ballot_idx`, `vote_votes_idempotency_idx`, `vote_entities_one_entry_per_restaurant_idx`, nonce PK, audit actor/request unique.

### D.3 Retrieval indexes

| Table.column | Type | Dimension | Index |
| --- | --- | ---: | --- |
| `listing_embeddings.embedding` | vector | 768 | HNSW `vector_cosine_ops`, m=16, ef=64 |
| `event_embeddings.embedding` | vector | 768 | HNSW `vector_cosine_ops`, m=16, ef=64 |
| `restaurant_embeddings.embedding` | vector | 768 | HNSW `vector_cosine_ops`, m=16, ef=64 |
| `vote.entities.embedding` | vector | 768 | ivfflat, lists=100 |
| `hermes.embedding_cache.embedding` | vector | 1536 | none, 0 rows (dormant, dimension mismatch) |

FTS: GIN tsvector indexes on `apartments.fts_content`, `events.fts_content`, `restaurants.fts_content`; `pg_trgm` installed but no trigram GIN index found. Hybrid search RPCs (`hybrid_search_{listings,events,restaurants}`) use RRF k=60, weights 1.5/1.0, Spanish `websearch_to_tsquery`, with baked-in active/recency filters.

### D.4 Migration reconciliation

| Measurement | Value |
| --- | --- |
| Remote applied versions | 207 |
| `origin/main` migration files | 208 total (207 conforming + 2 `_archive-not-on-remote`) |
| Local-only (main not applied) | 0 |
| Remote-only (applied, no file) | 0 |
| **Drift** | **0** |
| Highest version | `20261021070000_san1502_phase_a_pending_rental_search` (both sides) |
| Latest applied timestamp | Unverified — remote table has no `inserted_at` column |
| Canary worktree comparison | 127 conforming files, newest `20260929120000` — 80 behind main; **checkout difference, not drift** |

### D.5 Deployed edge functions vs repository source

The live project reports **41 ACTIVE edge functions**; `origin/main` defines **8 deployable functions** (`approval-commit`, `chat-lead-capture`, `process-embedding-jobs`, `ticket-checkout`, `ticket-payment-webhook`, `vote-cast`, `vote-nonce`, `whatsapp-webhook`) plus `_shared` and `tests`. The remaining 33 — `sponsor-*` family, `postiz-*`, `openclaw-*`, `outbox-dispatch`, `fraud-scan`, `listing-*`, `lead-*`, `moderate-asset`, `event-photo-moderate`, `google-directions`, `p1-crm`, `rules-engine`, `notify-entity-approved` — have **no matching source on main**. Provenance is unverified (likely legacy/FashionOS-era); treat as release-surface and reconcile or retire. Functions used by the current product are deployed and ACTIVE.

### D.6 Extensions, cron, auth

- 14 extensions: `vector 0.8.0`, `postgis 3.3.7`, `pg_trgm 1.6`, `pg_cron 1.6.4`, `pg_net`, `pgcrypto`, `pg_stat_statements`, `hypopg`, `index_advisor`, `citext`, `uuid-ossp`, `supabase_vault`, `plpgsql`.
- 7 active cron jobs (analytics snapshot, wait-list expiry, lead follow-up, span retention, anonymous regression, embedding jobs tick); cron bodies schema-qualified; embedding job raises if Vault secrets absent.
- `auth.users` 24 · `auth.identities` 25 · sessions 1058 · `profiles` 1235 (role `user` 1234, `moderator` 1) · `user_roles` 3 (admin, moderator, super_admin) · storage buckets 5 · storage objects 542. **Profiles/auth ratio is an anomaly (51×); cause unverified — do not plan capacity from it.**

---

## Appendix E — Test inventory and evidence limits

### E.1 Test layers on `origin/main`

| Layer | Count | Location | What it asserts | Maps to |
| --- | ---: | --- | --- | --- |
| Vitest | 422 files | `src/**/*.test.{ts,tsx}` | tool logic, schemas, classifiers, route authz, component render, contracts | AI tools, rentals, events, contest libs, partners, maps, WhatsApp |
| Playwright | 106 specs (66 root + 40 `screens/`, `host/`) | `e2e/` | journeys, visual evidence, production smokes, auth guards, admin gates | contests, restaurant detail/vote, admin sign-in, rental journey, broker viewings, checkout states, contact, new projects |
| pgTAP | 72 files | `supabase/tests/database/` | RLS isolation, vote-schema replay/access, contest reads, tally, receipt, publish FSM, ACLs, WhatsApp durability, embeddings | 10 contest/vote specs + rental/event/security suites |
| Edge function tests | `supabase/functions/tests/*` | Deno | vote-cast handler + local integration, vote-nonce, fail-closed protection, WhatsApp deny-all, embedding jobs | voting + WhatsApp |
| Node `--test` | `scripts/__tests__/*.test.mjs` | repo scripts | env contract, hooks, skill layout, migration preflight, release gates | infrastructure |
| Mastra tests | 84 files | `src/mastra/**` | router/concierge, search tool logic, grounding quality, quota, storage durability, telemetry | AI stack |

### E.2 Executed in this audit vs not

| Check | Executed | Result |
| --- | --- | --- |
| GitHub PR state, checks, diffs (43) | yes | documented in Appendix A |
| Vercel production deployment + SHA parity | yes | drift 0 |
| Production HTTP reachability | yes | public 200; auth 307 |
| Live schema, RLS, functions, indexes, rows, migration ledger | yes | Appendix D |
| Linear issue inventory (460) | yes | Appendix B |
| Page/API/AI code inventory | yes (read, not run) | Appendices C, main §6 |
| `npm test` / Playwright / pgTAP suites | **no** | not re-executed; CI conclusions read instead |
| Signed-in browser journeys | **no** | journeys remain Unverified where no executed proof |
| Stripe / Gemini / Places / ADK live calls | **no** | provider-dependent behaviour Unverified |

### E.3 Reproducible commands

```bash
# release truth
gh pr list --state open --limit 200 --json number,title,isDraft,mergeable,mergeStateStatus
gh run list -b main --limit 20 --json name,conclusion,createdAt,url
curl -s "https://api.vercel.com/v13/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&limit=20"   -H "Authorization: Bearer $VERCEL_TOKEN"

# database (read-only helper used in this audit)
# /tmp/mde_sql.sh is a 10-line local wrapper around
#   POST https://api.supabase.com/v1/projects/zkwcbyxiwklihegjhuql/database/query
# with SUPABASE_ACCESS_TOKEN from .env; recreate it rather than trusting a remembered path.
/tmp/mde_sql.sh "select count(*) from pg_tables where schemaname='public';"
/tmp/mde_sql.sh "select count(*) from supabase_migrations.schema_migrations;"

# linear
curl -s -X POST https://api.linear.app/graphql   -H "Authorization: $LINEAR_API_KEY" -H 'Content-Type: application/json'   -d '{"query":"{ project(id:"25af0641-c8db-45a8-a2eb-fe12c15caa57"){ issues(first:1){nodes{identifier title state{name}}}} }"}'

# clean main snapshot (never audit the canary for product truth)
git archive origin/main | tar -x -C /tmp/mde-main
find /tmp/mde-main/src/app -name page.tsx | wc -l   # 47
```

### E.4 Audit artefacts

| File | Contents |
| --- | --- |
| `_work/pr-inventory.md` | 481-line PR audit: summary, 43-row table, 20 notable PRs, collision map, superseded analysis, shortlists |
| `data/pr-data.json` | 43 structured PRs, sub-scores, collisions, dependencies, merge order |
| `data/pr-files.json` | Per-PR changed file paths and line counts from `gh pr view` |
| `_work/linear-inventory.md` | 504-line Linear audit: distribution, Done proof tables, active work, duplicates, labels, corrections |
| `data/linear-data.json` | 460 issues with states/labels/PR links; PR→issue mapping |
| `_work/features-and-pages.md` | Route/feature/journey/test inventory, retractions, canary comparison |
| `_work/ai-architecture.md` | Mastra/CopilotKit/retrieval/Maps/Open* audit + Mermaid architecture |
| `_work/database-inventory.md` | 309-line live schema/security/migration audit |
| `_work/release-and-runtime.md` | 449-line deployment/CI/env audit |

---

## Appendix F — Feature matrix with route, code, data and evidence

Source: `origin/main` `5d1d76ddf6` snapshot, verified by reading each file; live row counts from the Supabase Management API. This is the prompt-required feature matrix: every row names the actual route/component entry point, data source, status and evidence. **Working** here means code plus a committed test or live schema (or a production HTTP observation), not an executed user journey — see Appendix E.2 for what this audit did and did not run.

### F.1 Domain feature matrix

#### F.1.1 Contests & restaurant voting — implemented in the `vote` schema

The table below omits a Domain column because every row is Contests. The datastore is a dedicated `vote` schema (invisible to a `public`-only query); live counts: contests 4 (1 live, 1 draft, 2 test fixtures), entities 15, votes 4, entity_tally 4, contest_audit 34, paid_vote_orders 0.

Datastore is a **dedicated `vote` schema**, invisible to a `public`-only table query. Live DB: `vote` relations = `contests`, `categories`, `entities`, `entity_tally`, `votes`, `judge_scores`, `judges`, `scoring_criteria`, `paid_vote_orders`, `fraud_signals`, `contest_audit`; plus `public.vote_consumed_nonces`. Live rows: `contests=4` (1 live, 1 draft, 2 test fixtures), `categories=5`, `entities=15`, `votes=4`, `entity_tally=4`, `contest_audit=34`, `paid_vote_orders=0`. 19 RPCs: `contest_public_list/get`, `admin_contest_{list,get,create,update,link_restaurant,unlink_restaurant}`, `assert_contest_admin`, `vote_{restaurant_target,restaurant_contest_options,nonce,cast,receipt,my_receipt,tally,contest_context,consume_nonce}`, `contest_audit_insert`, `broadcast_vote_tally_changes`.

| Feature | Entry point | Data source | Status | Evidence | Gap |
|---|---|---|---|---|---|
| Public contest list | `src/app/contests/page.tsx:181` | RPC `contest_public_list` (`contest-public.ts:87`) | **Working** | e2e `e2e/san-1524-contests.spec.ts:41-58` (lists real contests, empty+error states, 390px overflow `:65-69`); pgTAP `san1524_contest_public_read_test.sql` | — |
| Contest detail + nominees | `src/app/contests/[id]/page.tsx:59` | RPC `contest_public_get` (`contest-public.ts:113`) | Working | pgTAP `san1524_contest_options_test.sql`; `ContestNomineeCard` | — |
| Restaurant detail (voting entry) | `src/app/restaurants/[id]/page.tsx:16` | `restaurants` + `vote_restaurant_target:93` + `vote_restaurant_contest_options:134` | Working | Serves 200 in production; e2e `san-1469-restaurant-detail.spec.ts`; pgTAP `san1483_entry_link_test.sql` | Multi-contest disambiguation relies on `?contest_id=` (`:26-31`) — no automatic pick, by design |
| Cast vote | `src/components/restaurants/restaurant-vote-panel.tsx:238` | edge fn `vote-cast` (`:150,208,238`) + `vote-nonce` (`:222`) | Working | pgTAP `san1498_restaurant_vote_rpc_test.sql`; edge tests `supabase/functions/tests/vote-cast_handler_test.ts`, `vote-cast_local_integration_test.ts` | Paid vote path (`paid_vote_orders=0`) unexercised |
| Duplicate prevention / nonce | `src/components/restaurants/restaurant-vote-panel.tsx:46,222` | `public.vote_consumed_nonces`, `vote_consume_nonce` | Working | edge test `vote_protection_fail_closed_test.ts`; pgTAP `san1484_vote_entities_access_test.sql`; `vote_consumed_nonces` present live | Fail-closed behavior proven at function level only |
| Receipt persistence | `/api/restaurants/my-vote:30` | RPC `vote_my_receipt` (joins `vote.votes`→`vote.entities`→`restaurants`) | **Partial** | pgTAP `san1469_my_receipt_test.sql`; `parseReceipt` (`vote-panel.tsx:50`); e2e `san-1469-restaurant-vote.spec.ts` | No browser proof that a receipt survives reload and re-renders without double-voting |
| Standings / tally | read via `vote_tally`, `entity_tally` | RPCs `vote_tally`, `broadcast_vote_tally_changes` | **Unverified** | pgTAP `san1497_vote_tally_test.sql`, `san1497b_contest_wide_tally_test.sql`, `san1470_contest_leaderboard_test.sql` | No page/route rendering standings was confirmed; no e2e asserts a tally |
| Test-fixture hiding | `contest_public_list` / `contest_public_get` | `vote.contests` state filter | **Unverified** | No pgTAP or e2e in snapshot asserts fixtures are excluded from the public list; live DB has 2 test fixtures among 4 contests | **Verify before launch**: `/contests` could expose test fixtures |
| Admin contest management | `src/app/admin/contests/page.tsx:17`, `[id]/page.tsx:13` | RPCs `admin_contest_*`; server action `createContestAction` | **Partial** | e2e `admin-sign-in.spec.ts` proves non-admin refusal + login link on all three admin routes; pgTAP `san1526_contest_admin_test.sql` | No e2e of a real admin creating/editing/linking a contest |
| Vote audit | — | `vote.contest_audit` (34 rows live) | Working | `contest_audit_insert`; rows present | No admin UI surface for audit |

#### F.1.2 All other domains

| Domain | Feature | Entry point | Data source | Status | Evidence | Gap |
|---|---|---|---|---|---|---|
| Rentals | Browse/filters | `rentals/(browse)/page.tsx:28` | `apartments` | Working | `san-483-production-rental-journey`, `REAL-011` | — |
| Rentals | Detail | `rentals/[id]/page.tsx:57` | `apartments` | Working | `san-1202-rental-detail` | — |
| Rentals | Schedule viewing | `api/leads/schedule-viewing` | edge fn, `leads`,`showings` | Unverified | no browser insert proof | — |
| Rentals | Broker viewing action | `api/host/rentals/viewings/[id]:18` | `showings` | Working | e2e `san-1204-broker-viewing-requests`; pgTAP `san1286_atomic_viewing_test.sql`, `san1206_broker_viewing_actions_test.sql` | — |
| Rentals | Broker onboarding/inventory | `(broker)/page.tsx:46`, `listings/page.tsx:35` | broker libs | Working | `san-1092-broker-onboarding`; pgTAP `san1105/san1349/san476` | — |
| Rentals | Landlord management UI | — | `landlord_profiles`, `landlord_inbox` exist | **Not implemented** | no `landlord*` route among 47 pages | Tables + RLS only |
| Rentals | New projects | `new-projects/*` | `development_*` | Working | e2e `SAN-1379-new-projects`, `SAN-1380-new-projects-ai`; pgTAP `san1379/1385/1404/1406` | — |
| Events | Discovery/detail | `events/page.tsx:45`, `[slug]/page.tsx:26` | public routes | Working | `san-518`, `ck-v2-015-events-chip` | — |
| Events | Host create (AI) | `host/event/new/page.tsx:8` | approval edge fn | Unverified | unit `host-event-agent.test.ts` | no draft→publish e2e |
| Events | Checkout/payment | `api/tickets/checkout` | edge fn + Stripe webhook | Unverified | `san-715-checkout-states` asserts states only | paid→ticket chain unproven |
| Events | Wallet/tickets | `me/tickets*` | `event_orders` | Unverified | — | — |
| Events | Refunds / payouts | — | `event_order_refunds`, `revenue_ledger` | **Not implemented** | no route/UI in 35 handlers | tables only |
| AI Concierge | Chat + runtime | `chat/page.tsx:4`, `api/copilotkit` | Mastra | Working | `home-to-chat`, `concierge-new-chat`, `prod-copilotkit-isolation`, `copilotkit-request-budget` | — |
| AI Concierge | Grounded tools | `src/mastra/tools/search-*` | Supabase + embeddings | Working | `intelligence-*` unit suite | tool-level, not journey |
| AI Concierge | Thread history/titles | `api/threads/[threadId]{,/messages}` | `mastra_threads/messages` | Working | `thread-history-authz`, `copilotkit-thread-routes-authz` | — |
| AI Concierge | HITL approvals | `api/approval-commit` | edge fn | Unverified | `approval-commit-schema`, `approval-panel` | no apply proof |
| AI Concierge | Maps/pins | `platform/maps/*` | Maps JS | Working | `maps-grounding`, `maps-layout-*`, `maps-007b` | — |
| Discovery | Cafés / nightlife | `cafes:23`, `nightlife:29` | `venue_anchors` | Unverified | `san-575-*visual-evidence` only | visual-only proof |
| Discovery | Places search/detail/photo | `api/places/{search,detail,photo}` | Places + `place_details_cache` | Working | route tests | — |
| Partners | Hub + vertical landings | `partners/page.tsx:11`, `partners/{restaurants,cafes,nightlife}/page.tsx:13` | static | Working | `san-692-partner-hub`, `san-713-restaurant-partners` | rentals/ai/sponsors still placeholders |
| Partners | Signup/activation | `partners/signup/page.tsx:28`, `api/partners/activate` | `partners` | Unverified | unit only | no e2e |
| Partners | Contact lead capture | `contact/page.tsx:13`, `api/partners/contact-leads` | `leads` | Working | e2e `san-693-contact`; unit `partners/contact-lead-form` | — |
| Partners | Dashboard/analytics/assistant | — | `partner_*` | **Not implemented** | no partner-authenticated page | biggest partner gap |
| Super Admin | Contests | `admin/contests*` | vote RPCs | Partial | `admin-sign-in`, `san1526` | no create e2e |
| Super Admin | Event bookings | `admin/event-bookings` | `is_admin()` | Working | route + queue tests | — |
| Super Admin | Rentals test mode | `admin/rentals`, `api/admin/rentals/test` | `apartments` fixtures | Working (dev tool) | `admin-rental-test-mode.spec.ts` | not a production admin surface |
| Super Admin | Users/roles, media, imports, transactions, monitoring | — | tables exist | **Not implemented** | no routes | — |
| Infrastructure | Auth/SSR clients, RLS | `lib/supabase/{server,service}` | — | Working | pgTAP `fashionos_rls_exposure`, `san476`, `san1284a/b/c`; `auth-guard` e2e | — |
| Infrastructure | WhatsApp intake | `api/whatsapp/{webhook,process-inbound}`, edge `whatsapp-webhook` | `whatsapp_*`, `wa_outbox` | Working (server) | HMAC verify `route.ts:72`; pgTAP `san1444_whatsapp_{delivery_tracking,inbound_durability}`; edge test `whatsapp-webhook_deny_all_test.ts` | channel activation/config unverified |
| Infrastructure | Embeddings / pgvector | `embedding_jobs`, edge `process-embedding-jobs` | pgvector | Working | pgTAP `embedding_worker_pipeline_test.sql`; `embedding-contract` unit | — |
| Infrastructure | Observability | `search_logs`, `ai_runs`, `/api/scorers` | — | Partial | unit telemetry tests | no dashboard |
| Infrastructure | Version/deploy visibility | `api/version` | env | Working | — | — |

---

## Appendix G — UX review against the MDE design system

Reference: `DESIGN.MD` (three-panel desktop, bottom-sheet mobile, result cards, map pins, detail panels, chips, skeletons, error/empty states) and `docs/plans/mde-shared-discovery-readiness.md`. Mindtrip is referenced only as an interaction-quality benchmark; no branding or assets are used.

| Design-system criterion | Verified evidence | Status |
| --- | --- | --- |
| Clear search and filters | Home/rentals/events/restaurants search routes exist; event category/date/price enums validated server-side; `/api/rentals/search`, `/api/restaurants/search`, `/api/events/public` | Working (test-backed) |
| Relevant cards and synchronized maps | `venue-card-shell`, `map-ui-sync`, `focusMapPin`, `MapFocusController`; map-neutral regression tests prevent invented coordinates; SAN-472 cards/pins sync | Working (test-backed; live not executed) |
| Accurate pricing and metadata | #444 USD labelling shipped; #453 real “From COP…” price / valid Buy open; **prod budget-disclosure smoke red** | Partial — pricing disclosure is broken on the serving build |
| Details accessible from results | `/rentals/[id]`, `/events/[slug]`, `/restaurants/[id]`, `/contests/[id]`, `/venues`; production 200 | Working |
| Obvious next action | Viewing CTA, Buy CTA, vote panel, partner contact; #367 removes broken rental-detail buttons; #453 removes dead Buy | Partial |
| Real loading / error / empty states | Skeletons, `concierge-error-notice`, `ConciergeRunFeedback`, contest empty/error e2e, map-degradation tests; #476 adds empty-transcript retry | Working (test-backed) |
| Keyboard and mobile accessibility | Skip-link fix #481 open; 390 px overflow assertions in contest/chat e2e; keyboard pass not executed | Partial / Unverified |
| Persistent composer and conversation context | CopilotKit thread routes + `lastIntent`/`lastResults`/`selectedId`/`mapUi` working memory; thread lifecycle test | Working (test-backed) |
| 1440 px desktop | Three-panel chat/desktop layouts and visual-evidence specs exist; **no 1440 px runtime pass in this audit** | Unverified |
| 390 px mobile | Mobile sheets, nav drawer, keyboard-aware composer; contest/chat/map e2e at 390 px; #438 keyboard viewing test | Working (test-backed) |
| Mindtrip-style interaction quality | Referenced only as a quality bar; no copied assets; no execution comparison | Reference only |

**UX verdict:** the design system is implemented and test-backed on the main paths; the two open quality risks are pricing disclosure in rental chat (a live regression) and keyboard/1440 px verification, which this audit did not execute.

---

---

## Appendix H — Prompt compliance checklist

This maps every required part of `01-prompt-Master Product Roadmap, PR Audit & Progress Tracker.md` to the artefact that satisfies it, and states the remaining limit honestly.

| Prompt requirement | Where satisfied | Status / limit |
| --- | --- | --- |
| §1 Read AGENTS.md + plan/tasks/linear-audit/efficient/progress/task-verifier skills | Reviewed during this audit; methods reflected in the evidence labels and independent-Done checks | Complete |
| §1 Review prd.md, roadmap.md, mvp.md, DESIGN.MD, sitemap, domain plans | Read for product intent, design system, launch loops and known gaps; stale claims listed in Appendix H/main §13.3 | Complete (planning docs are stale in places; implementation treated as truth) |
| §1 Development policy: no Phase A business gates; keep auth/RLS/atomicity/auditability; Phase B separate | Wave 7 is explicitly deferred; no gate is proposed for Phase A; security findings are tracked as integrity work, not launch paperwork | Complete |
| §2 Audit all open PRs + relevant merged PRs; 13 fields per PR | Appendix A.1 (43 rows), A.2 (CI), A.3/A.4 (collisions/dependencies), A.5 (superseded), A.7 (files/services/risk/effort/dependencies), A.8 (recent merged) | Complete |
| §2 Primary classification + live recalculation of the 23/15/5 baseline | Main §2.1 reconciles the baseline; live split 22/8/8/4/1 | Complete |
| §2 Do not count merged as deployed/working | Appendix A intro: production serves `main`; no open PR is deployed | Complete |
| §3 Review all Linear tasks; exact titles/status/dependencies/PRs/evidence | 460 issues via GraphQL; Appendix B.1–B.3; full JSON `data/linear-data.json` | Complete |
| §3 Task-to-PR mapping with required columns | Appendix B.8 (58 active issues) + B.3/B.3.1/B.3.2 | Complete |
| §3 Identify Done-without-proof, Done+open-PR, duplicates, obsolete, missing; correct before create | Appendix B.3.1 (18), B.3.2 (25), B.4, B.6 corrections C1–C11, §12 N1–N9 | Complete; no Linear issue was created or edited |
| §4 Feature matrix: route, code entry point, data source, status, evidence | Appendix F (all domains, 40+ features) with statuses and evidence | Complete; "Working" is code+test/schema, not an executed journey (Appendix E.2) |
| §5 CopilotKit, Mastra, Supabase/pgvector, OpenBot/OpenMuse/OpenDots audits | Main §6 + `_work/ai-architecture.md` + Appendix D | Complete; ADK sidecar and AdvancedMarker remain Unverified (no paid call made) |
| §6 Pages: role/function/data/AI/desktop/mobile/status/priority | Appendix C (Desktop and Mobile columns) | Complete; Desktop/Mobile record surface, not runtime verification |
| §6 UX review against DESIGN.MD, 1440/390, Mindtrip reference | Appendix G | Complete; keyboard and 1440 px were not executed and are labelled Unverified |
| §7 Eight user journeys with exact breakpoints | Main §8 + completion metric (1/8 proven, 6/8 evidenced, 2/8 unverified) | Complete |
| §8 Progress tracker: counts, weighted scores, overall /100, PR values, blockers, PR dispositions | Main §4.1–4.2, §3.1–3.2, §13.4, Appendix A | Complete; 60/100 is a development indicator, not certification |
| §9 Waves 0–7 with required work-item columns | Main §10 (28 work items) | Complete |
| §10 Mermaid A–E, valid, verified/partial/missing stages, evaluation branch | Main §9 (5 diagrams) | Complete; all five rendered to PNG (HTTP 200) as a syntax check |
| §11 Value rubric (100), risk and effort separate columns, flag low-value | Appendix A.1 (value), Appendix A.7 (risk/effort/files/dependencies), §3.2 low-value list | Complete |
| §12 One canonical plan, 14 sections, clickable URLs, detailed appendix | `docs/progress/02-…md` + this appendix | Complete |
| §13 Verify counts/titles/PR states/Mermaid/implementation; label unverified; identify doc conflicts | Main §13 + Appendices B/C/E/H; count checks in this audit | Complete to the stated limits; tests were not re-executed |
| §13 Return Working/Broken/Missing/Highest-value PRs/Readiness/Next 10/Path | Main §1 + §3 + §14 | Complete |
| §13 Docs-only PR, unrelated worktrees untouched | [PR #485](https://github.com/amoai-tech/mdeai/pull/485) from branch `docs/master-plan-progress-20261021`, created from `origin/main`; docs only | Complete; no merge performed |
| Final success criteria: new agent can see what exists, PR value, Linear owners, AI stack, dashboards, journeys, breakpoints, next order | Main §1–14 + Appendices A–H | Complete |

**Honest limits:** no test suite, signed-in browser flow, Stripe/Gemini/Places/ADK call was executed; all such claims are marked Unverified. The local checkout is a reduced canary, so all product evidence uses `origin/main`. The configured Supabase MCP points at a different project and was not used.

---

*Appendix to the canonical plan. It records evidence and limits; it does not authorise code, migration or data changes.*