# SAN-755 · MDE QA — Prove AI Rental Search, Map, Details, and Viewing End-to-End

## Scope: PR #860 — Playwright guard for guest budget and signed-in topic changes

- Source branch: `test/san-755-guest-budget-ai-intents-20261110` based on verified `origin/main`
- Real public target: `https://www.mdeai.co/chat`
- Real protected Vercel preview: `https://mdeai-6clg0o4ow-amoco.vercel.app`
- Browser: Playwright 1.64.1 with Chrome; anonymous guest viewports 390×844 and 1440×900
- No application runtime, database migration, new search engine, or development-phase business eligibility changes

## Evidence

| Check | Result | Evidence on authorized workstation |
| --- | --- | --- |
| Public guest budget COP 3M → COP 2.5M, 390px and 1440px | **PASS 2/2** | `/tmp/san755-guest-review-green.log` and `/tmp/san755-guest-helper-retest.log` |
| Same guest journey on protected Vercel preview | **PASS 2/2** | `/tmp/san755-protected-preview.log` |
| Source-contract: guest gate before candidate promotion | **PASS 1/1** | `node --test scripts/__tests__/prod-guest-budget-gate.test.mjs` |
| Signed-in apartments → restaurants → monthly follow-up | **PASS** | `/tmp/san755-signed-other-topics.log`, `/tmp/san755-signed-review-green.log` |
| Signed-in apartments → events → monthly follow-up | **PASS** | Same as above |
| Signed-in apartments → coworking → monthly follow-up | **FAIL intermittently** | `/tmp/san755-signed-coworking2.log`: first run unexpected second rental API call, retry passed; `/tmp/san755-signed-review-green.log`: repeat run failed without retry |
| Full floor on original PR head (`f67ff6b526`) | **PASS** | `/tmp/san755-final-floor.log`: 5,673 Vitest passed, 49 skipped, 653 test files passed, 13 skipped; lint, TypeScript, optimized build, audits, Mastra |

The guest tests assert two real API POSTs, COP currency and monthly budget caps, displayed card prices, stable semantic query text, no forced sign-in, no horizontal overflow, and a grounded mobile map CTA. Catalog counts must be allowed to change; zero real listings are a legitimate marketplace state, but require the truthful, source-defined budget-specific or generic empty answer. A listing without real coordinates must not receive a fabricated pin. Browser failure screenshots/traces stay on the trusted workstation; authenticated QA recording is disabled.

## Separate rental content observation

A read-only public COP 3M result returned three source rows. Two lacked usable photo data in the API response; one lacked coordinates. This is tracked in the existing **SAN-1503 · MDE Rentals — Import 15 LIV/Casacol/OASIS Listings and Photos into Supabase Safely**; don't claim source media or exact locations are available until verified. Do not make incomplete photo/maps metadata a Phase A search gate.

## Remaining before calling this PR fully verified

1. Resolve substantive review findings against final current code; don't hard-require live inventory.
2. Run local full floor on final exact head and confirm GitHub CI and protected preview.
3. Diagnose intermittent signed-in coworking routing separately within the existing SAN-755 owner; **do not** present passing retry as a stable AI guarantee.
4. After approved merge, verify the deployed SHA and production guest journey without repeating the entire test suite.
5. The larger SAN-755 end-to-end viewing/lead/showing/broker persistence acceptance is NOT delivered by this small browser gate.
