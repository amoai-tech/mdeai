# Canary on MDE

Canary is an optional, independent PR checker alongside CodeRabbit and Playwright.

1. Install the CLI and authenticate (`npm i -g @runcanary/cli`, then `canary login`).
2. Copy `env.example.json` to the ignored `env.json` and run `canary setup --check`, then `canary setup`.
3. Install the Canary GitHub App for `amoai-tech/mdeai` if it is not already connected. Each PR author must have their own approved Canary setup in the selected workspace.
4. Once approved, use an open PR for a single `@canary` test. New PRs and pushes can then be checked automatically while usage remains available.

**Scope:** This recipe runs the real Next.js and Mastra servers with an inert local Supabase client configuration and in-memory Mastra storage. It checks that code and public pages boot without access to MDE production. Real rental data, authentication, bookings, payments and persistence are **not tested** by this configuration. Connect only an explicitly authorized QA backend to expand coverage. Never copy `.env` or `.env.local` into Canary, and never commit `env.json`, credentials or job metadata.

The GitHub App can post comments independently of local `canary verify`; do not add a second mandatory GitHub Action or change branch-protection rules just for Canary.

## Security and authenticated QA

- **Untrusted PR sandbox:** The Canary setup phase has **no injected env.json values**; `setup.sh` disables npm lifecycle scripts (`--ignore-scripts`). The `/workspace` root is guaranteed by Canary's cloud runtime. The service processes run PR-controlled code, so **never** add live Supabase, service-role, Stripe, Google API, or signed-in QA session secrets to `.canary/env.json`, even if the installer blocks lifecycle scripts. The example values are inert and only exercise boot and public UI paths.
- **Trusted production smoke only:** The existing `e2e/helpers/auth.ts` `signInAsOnOrigin()` uses Supabase Admin magic-link generation; this requires a service-role credential in the **trusted test runner**, never in GitHub PR or Canary. The permanent Super Admin account `mde@socialmediaville.ca` is pre-existing, and the helper refuses to create it if missing.
- **Opt-in read-only verification after reviewing/merging to trusted main:** load your locally ignored Supabase environment securely (do not print it), then run:

  ```bash
  MDE_SUPER_ADMIN_QA_SMOKE=1 PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
    npx playwright test e2e/prod-signed-in-route.spec.ts \
      --project=prod-smoke --grep 'opt-in Super Admin QA account' --workers=1
  ```

  This opens the real `/app/admin/events` page and verifies that the authenticated account can view the admin interface; **it submits no forms and performs no writes**. The account's `super_admin` membership should also be checked through the canonical `user_roles` source. Keep traces, screenshots and video off for authenticated production tests, as configured in that spec. Never run this credentialed smoke from an untrusted PR checkout or inside Canary; avoid a GitHub PR workflow with production secrets.
