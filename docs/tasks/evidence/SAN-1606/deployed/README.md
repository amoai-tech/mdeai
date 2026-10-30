# SAN-1606 — mobile navigation: deployed verification evidence

**Command (one line, reusable):**

```bash
npm run verify:mobile-nav -- <url> <expected-sha>
```

It prints `PASS`/`FAIL` per check and exits non-zero on any failure. Against a `localhost` URL the
deployed-commit check is skipped (there is no Vercel commit there).

## Runs

| Run | Target | Result | Log |
| --- | --- | --- | --- |
| Pre-merge, published release (feature only) | `https://mdeai-gamma.vercel.app` @ `bdac360e7262f42c9ff1820156ada57ca8762e36` | **34/36** — the two failures are the defect this change fixes: the floating map control stayed visible while the keyboard was open | [`deployed-before-fix-bdac360e72.log`](deployed-before-fix-bdac360e72.log) |
| Pre-merge, this branch on a production build (`next build` + `next start`, port 3000) | tested tree = **`2630adff53fd5efa2a4acfc3f63d5887abdf0366`** plus the verifier hardening (the app code is unchanged by it) | **37/37 in ~35s** (includes the 9-test journey spec) | [`premerge-production-run.log`](premerge-production-run.log) |
| Post-merge | see the SAN-1606 Linear comment (the same command against the release that contains this change) | recorded there | — |

## What the 35 checks cover

- **Deployed commit** matches the expected SHA (skipped on localhost).
- **Existing journey spec** (`e2e/mobile-bottom-nav.spec.ts`, 9 tests): five tabs, one active per
  route, Back/Forward, 320/428 geometry, excluded routes (protected/auth/checkout/unrelated),
  chip strip hidden, keyboard hide **and return**, 1024px desktop boundary.
- **390px** on `/`, `/chat`, `/rentals`, `/restaurants`, `/events`: 200, one 366×64 bar at `x=12`,
  5 tabs, correct `aria-current`, 44px targets, no horizontal overflow; `/chat` has no chip strip
  and a 56–64px composer with no nav/composer/map-control overlap.
- **Map sheet**: opens, 44px close control, closes.
- **Long draft**: capped at 112–128px with Send still above the bar.
- **Routes without the bar**: `/cafes` and `/nightlife` render no bar **and reserve no space**.
- **Keyboard overlay** (iOS-style `visualViewport` proxy): bar **and floating map control hidden**,
  chat reserve released, composer above the keyboard; on close the bar **and map control return**,
  the reserve is restored and the keyboard-only marker is cleared.
- **1023 / 1024 / 1280px**: bar present at 1023, absent at 1024 and 1280, chip strip back on desktop.
- **Console**: only the expected guest runtime `401`, Google Maps' WebGL→Raster fallback, the
  deliberate unsupported-route `404`, and a dev-only HMR reconnect.

## Screenshots (390px and 1280px, production build)

| File | Shows |
| --- | --- |
| [`390-chat.png`](390-chat.png) | chip strip gone, 56px composer, five-tab bar with Chat active |
| [`390-rentals.png`](390-rentals.png) | Rentals active, Ask MDE bar above the tab bar |
| [`390-chat-keyboard-open.png`](390-chat-keyboard-open.png) | keyboard open: **bar and map button gone**, composer lifted |
| [`390-cafes-no-bar.png`](390-cafes-no-bar.png) | a route without the bar, nothing reserved |
| [`1280-chat-desktop.png`](1280-chat-desktop.png) | desktop unchanged: no bar, chip strip back |

## Negative controls (prove the command fails when it should)

| Control | Command | Observed |
| --- | --- | --- |
| Wrong deployed SHA | `npm run verify:mobile-nav -- https://mdeai-gamma.vercel.app deadbeef…` | `FAIL deployed commit matches deadbeefdead (deployment says bdac360e7262)` with both SHAs and a hint — exit 1 |
| Broken base URL (pages never render) | `npm run verify:mobile-nav -- http://localhost:3000/nope` | `FAIL rendered / — missing / main content` per route — exit 1, no silent passes |
| Pre-fix deployment (map control still visible under the keyboard) | `… https://mdeai-gamma.vercel.app bdac360e72…` | `FAIL keyboard open: floating map control hidden` and the journey spec fails on the same assertion — the defect is detected, not skipped |
| Sharding | `npx playwright test e2e/mobile-bottom-nav.spec.ts --project=local-chromium --list --shard=1/3` (then 2/3, 3/3) | 9 / 0 / 0 — the file runs in exactly one shard, so the deterministic job executes it once |

Console handling is exact, not substring-based: expected console messages are matched whole, and a
failed response is allowed only for the guest `/api/copilotkit` 401 and the local
`/_vercel/insights/` 404; every other 4xx/5xx URL fails both the request and console checks.

## Why this is not a second test framework

The command runs the **existing** Playwright spec for the navigation journey and adds only the
checks a live URL needs (deployed SHA, keyboard overlay marker, map sheet, long-draft cap, routes
without the bar, 1023/1280 boundaries).
