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

## 21 Nov 2026 code-review remediation (current PR branch)

- Retry finding: already handled by the common `sendConciergeMessage` helper:
  at most one retry, and only when no app API request began; clarified the
  local comment instead of adding a duplicate-send retry.
- Empty state: test semantic `No rentals` plus separate API/zero-card and
  applied-budget assertions instead of enumerating product copy variants.
- Search intent: require both API turns to retain rental type and Laureles;
  the structured budget independently changes from 3M to 2.5M.
- Coworking: quarantined under `MDE_QA_COWORKING_DIAGNOSTIC=1`; the known
  flake remains tracked in SAN-874/SAN-876, not declared corrected.
- Release contract: parse installed `yaml` package (no new dependencies);
  validate executable step order, conditions, target URL, and simulated bypass.

Verification results for this revision are recorded in the PR review responses.
The historical 10 Nov evidence above must not be mistaken for fresh proof.

## 21 Nov 2026: current PR preview host/access and canonical main repair

- The PR preview is hosted by the MDE `amo-agency` Vercel team. The
  original feature branch's old fixture trusted only `amoco` and failed
  before page load.
- Newer `origin/main` already corrected the team host and implemented
  exact-SHA public-preview verification. Rather than duplicate or override
  it, PR #860 merged the latest main and adopted its canonical fixture.
- The main fixture allows an unprotected preview without a bypass cookie
  only when the real app's `/api/version` matches the expected SHA
  and `environment=preview`. A protected preview still requires the
  bypass cookie and rejects the Vercel login page.
- Before merging main, the repaired local preview test had passed the
  real two-message budget journey 2/2 at 390px and 1440px (9.4 seconds)
  on preview SHA `75ac8d9a9a`; independently verified via
  `/api/version`.
- The merged final head needs fresh full-floor, GitHub checks and the
  exact deployed preview SHA check. Do not count earlier source or
  preview evidence as proof of the merged SHA.

## 21 Nov 2026: production environment review fix

A later review caught that the guest test defaulted to
`expectedEnvironment=preview` while the release workflow stages a
production deployment. A public staged production candidate could have been
incorrectly rejected despite a matching SHA. The workflow now explicitly sets
`MDE_VERCEL_EXPECTED_ENVIRONMENT=production`. Manual PR previews default
to preview, and a negative YAML contract checks this release requirement.
The bypass secret remains scoped to the one release-check step; passing it
through process.env instead of the workflow env would not change which
processes can read it.


## 21 November 2026 — protected Vercel cookie trace regression

- **Cause:** This guest spec overrode the `prod-smoke` project's secure
  `trace: off` setting with `on-first-retry`.
- **Safe reproduction:** A local-only Playwright trace experiment used a
  **dummy** `_vercel_jwt` cookie. Its value appeared in `trace.network`.
  No real Vercel bypass token or user cookie was inspected or displayed.
- **Minimal fix:** Explicitly keep `trace: off` and `video: off`
  in the anonymous guest test. Keep `screenshot: only-on-failure`.
  The existing staged-candidate test already inherits `prod-smoke`'s
  `trace: off` setting; no second bypass/certification path is needed.
- **Regression:** The Node release contract now requires tracing disabled.
  It was run RED against the old setting before changing the spec.
- **Reference:** https://playwright.dev/docs/trace-viewer (Network tab can show
  request headers) and https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation.
