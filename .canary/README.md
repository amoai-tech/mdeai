# Canary on MDE

Canary is an optional, independent PR checker alongside CodeRabbit and Playwright.

1. Install the CLI and authenticate (`npm i -g @runcanary/cli`, then `canary login`).
2. Copy `env.example.json` to the ignored `env.json` and run `canary setup --check`, then `canary setup`.
3. Install the Canary GitHub App for `amoai-tech/mdeai` if it is not already connected. Each PR author must have their own approved Canary setup in the selected workspace.
4. Once approved, use an open PR for a single `@canary` test. New PRs and pushes can then be checked automatically while usage remains available.

**Scope:** This recipe runs the real Next.js and Mastra servers with an inert local Supabase client configuration and in-memory Mastra storage. It checks that code and public pages boot without access to MDE production. Real rental data, authentication, bookings, payments and persistence are **not tested** by this configuration. Connect only an explicitly authorized QA backend to expand coverage. Never copy `.env` or `.env.local` into Canary, and never commit `env.json`, credentials or job metadata.

The GitHub App can post comments independently of local `canary verify`; do not add a second mandatory GitHub Action or change branch-protection rules just for Canary.
