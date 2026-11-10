---
title: MDE AI — 1Password authenticated QA
status: active
owner: MDE engineering
---

# MDE AI — 1Password, Playwright and Chrome QA

**Purpose:** Use existing passwordless Supabase QA accounts for https://www.mdeai.co and localhost without duplicating login systems. The canonical fixtures, role and browser security contract are in [e2e/README.md](../../e2e/README.md#agent-qa-commands--authenticated-chrome).

## Verified integration and scope

- On the configured Ubuntu QA host, `mde-qa-op` is a **local, untracked** helper that loads 1Password Developer Environment `MDE-QA` from account `my` with `op run --environment`, validates required values and the MDE Supabase project, then permits approved npm QA scripts only.
- The helper currently uses a dedicated QA worktree on that host. Its path is host-specific; do not assume it exists on another workstation, GitHub Actions, or a cloud agent. The normal repository `npm run qa:browser`, `npm run qa:auth:check`, `npm run qa:test:admin` are tracked.
- Only existing identities: Renter for rentals/saves/viewings, Event Host for event management, Broker for leads/showings. Super Admin is restricted to protected Playwright fixtures; interactive Chrome CDP **rejects** the Super Admin role, even with `--allow-admin`. Missing roles fail closed.

## 1. Preconditions and safe authentication check

Unlock 1Password Desktop; authorize the CLI if requested. From a trusted terminal:

```bash
op vault list --account my >/dev/null
mde-qa-op npm run qa:auth:check
```

Require both `MDE QA 1Password: PASS` and `MDE QA auth: PASS`. `op vault list` establishes account reachability **only**; it does not establish Developer Environment authorization or login success. If the helper is missing or cannot read its Environment, stop and obtain Desktop approval or the existing operator setup; never invent accounts, tokens or bypass flags.

**Do not run `op environment secret list` for discovery:** 1Password CLI 2.42.0 can print both secret names **and values**. Do not print, log, paste or commit `op` output containing secrets. `op run` masking is best effort, not a security boundary.

## 2. Live site — browser with Renter identity

```bash
mde-qa-op npm run qa:browser -- \
  --role=renter \
  --origin=https://www.mdeai.co \
  --allow-remote \
  --port=9255
```

Wait for `MDE QA browser READY` and the verified `/saved` authentication check. Then navigate to the authorized pages you are testing. Production QA is **read-only by default**; any transaction/write test needs explicit task opt-in and verified cleanup.

## 3. Localhost — real application

On the configured host, start the **dedicated QA worktree selected by the existing `mde-qa-op` helper**. Find it from the host setup or `git worktree list`; do not assume a machine-specific path. **Before starting Next.js**, supply the QA server process its **own trusted environment**, including `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and any other variables required by that development configuration). Use the worktree's ignored environment files or operator-provided exports; the separate `mde-qa-op npm run qa:auth:check` checks credentials but **does not supply the dev server's environment**. Do not copy or link production-backed `.env` / `.env.local` files by default; [worktree bootstrap](../../scripts/worktree-bootstrap.sh) requires deliberate `MDE_WORKTREE_LINK_ENV=1` opt-in, as explained in [worktree environment traps](../../.claude/skills/tasks/references/pre-merge-tests.md#mde-specific-local-and-worktree-failure-traps). For `npm run floor`, also provide `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` through the trusted environment:

```bash
npm run dev:ui:worktree     # from that QA worktree; localhost:3002
```

In another terminal:

```bash
mde-qa-op npm run qa:browser -- \
  --role=renter \
  --origin=http://localhost:3002 \
  --port=9255
```

The helper uses its **configured QA worktree** even if invoked from a different checkout. Confirm the checkout, source revision and target origin before making any claim about a commit or deployment.

## 4. Playwright and DevTools integration

- Chrome DevTools MCP: connect to `http://127.0.0.1:9255` using `--browser-url=http://127.0.0.1:9255` after the launcher prints READY.
- Playwright: prefer existing `e2e/fixtures.ts` with `qaRolePage` / `superAdminPage` and `e2e/helpers/auth.ts`. For ad hoc Chromium inspection only, use `chromium.connectOverCDP("http://127.0.0.1:9255")` from the **trusted local machine**; CDP has lower feature fidelity than Playwright's own connection and grants access to the signed-in browser.
- Non-admin role selection: `--role=renter`, `--role=event-host`, `--role=broker`. Super Admin is **not** a normal interactive CDP role; use `mde-qa-op npm run qa:test:admin` for the protected, read-only fixture instead.
- Authenticated Playwright runs must use `test.use({ screenshot: "off", trace: "off", video: "off" })`. Do not upload session cookies, storage state, traces, screenshots, HTML reports or error-context artifacts. Never let separate agents operate the same page concurrently.

## 5. Verify real workflows and stop cleanly

For Rentals test: search → original listing ID/cards/map → Details → viewing request **only if writes explicitly authorized** → exactly one persisted lead/showing → correct broker readback and idempotent retry. For Events: current event list/detail and authorized Host operations; payment tests must use safe test mode. Check 390px mobile, failure and recovery, and API/DB truth; never claim success based only on a toast or mock response.

Press **Ctrl+C** in the QA Chrome launcher terminal and confirm its temporary browser profile and localhost-only CDP port are gone. If the launcher was force-killed, identify and stop **only its own** Chrome process by the selected CDP port and `--user-data-dir` (not a blanket Chrome kill). Confirm that Chrome has exited and the CDP listener is closed **before** deleting that temporary profile. Treat its cookies/session data as sensitive; if process ownership is uncertain, ask the operator rather than terminating unrelated browsers.

**Official contracts:** [1Password CLI releases](https://releases.1password.com/developers/cli/) · [Playwright CDP](https://playwright.dev/docs/api/class-browsertype) · [MDE role fixtures](../../e2e/README.md#role-selected-qa-and-private-artifacts).
