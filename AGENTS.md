# AGENTS.md — MDE AI

Portable rules for agents working from the **current checkout root**. Product-owner priorities take precedence over agent-preferred business requirements; do not overwrite unrelated changes.

## MANDATORY — prelaunch development comes before launch certification

**Product-owner decision:** MDE AI is in **Phase A — prelaunch development**. The product owner and lead developer set development priorities; do not replace their decisions with agent-preferred requirements. **Make the real application functional now; certify public launch later.** This directive governs all product workflows and overrides older business-gating guidance in skills, tasks, PRDs, and examples. It does **not** override technical security or data-integrity requirements.

1. **Unblock development immediately.** Do not require apartment eligibility, moderation, freshness, verification, owner or broker paperwork, partner approval, publishing approval, photo-rights paperwork, or booking/viewing permissions as prerequisites to building, showing, searching, mapping, managing, publishing, or testing records. Development listings need not be launch-ready to appear in search, Details, Maps, or AI results or to accept development viewing requests.
2. **Full authorized Super Admin control.** Provide authenticated, server-authorized, audited actions to create, import, edit, activate, publish, unpublish, restore, approve, reject, revoke and manage users, roles, landlord/broker assignments, listings, photos/media, events, leads, showings, bookings, tickets, and AI workflows. Approval management features can be tested without making their status a prerequisite to normal development workflows. Never grant admin powers through client-editable roles or expose service keys.
3. **Use the actual application and database.** Build and exercise the existing Next.js UI, API/server actions, Supabase schema, RLS/RPCs, Mastra/CopilotKit agents, and real persisted transactions. Do not introduce duplicate search engines, approval subsystems, booking services, parallel sandboxes, fake transaction paths, or test-only workflows unless explicitly requested. Use safe payment testing when applicable.
4. **Remove restrictions at their source.** Trace blockers to the canonical SQL function, RLS policy, RPC, server route, agent tool, UI condition, or configuration and fix the responsible implementation. Do not hide it with a second filter, duplicate service, or frontend-only workaround. Keep one canonical, server-controlled development-versus-launch policy; a live URL or `NODE_ENV=production` does not authorize public-launch gates.
5. **Keep facts truthful.** Label development/test records accurately. Never invent ownership, verification, listing availability, prices, locations, booking authority, payments, photo rights, or completed actions. Use lawfully usable media and preserve source attribution; unknown facts remain unknown.
6. **Preserve technical safeguards, not business prerequisites.** Keep authentication, protection from unauthorized third-party access, server-side admin authorization, secrets, per-user/private-data isolation, RLS where appropriate, valid data constraints, atomic writes, idempotency, audit trails, retry safety, and real payment integrity. These are not grounds for reimposing deferred business paperwork/eligibility rules.
7. **Implement rather than debate.** Explain a material risk once, briefly, then execute the product owner's requested functionality. Avoid repeated objections, unnecessary Linear issues, speculative compliance tasks, or an audit in place of a fix.
8. **Finish with proof.** Inspect → change → focused tests → full applicable checks → commit/push → verify the affected UI/API/DB journey. For rentals, prove search → cards/map → Details → viewing → exactly one persisted lead + showing → correct broker visibility. For events, prove creation/publishing → safe checkout → webhook → ticket/QR/wallet. For AI, prove grounded response → authorized action → persisted result. Report exactly what passed and what remains blocked; never claim success without evidence.

**Phase B — public launch, only when explicitly initiated by the product owner:** activate and verify the real-world ownership/agency authority, advertising/photo/viewing rights, inventory accuracy/freshness, publication eligibility, business approvals, payments, and release certification. Clean up or isolate development-only records before treating them as verified public supply. Do not impose these Phase B requirements during Phase A.

**Default decision:** When a business restriction prevents building or exercising a core feature, make that feature functional now while retaining technical security and truthful data. **Success in development means working user journeys — not more gates, paperwork, or documentation.**

## Source of truth and task context

- **Product intent:** [`prd.md`](prd.md); **strategy:** [`roadmap.md`](roadmap.md); **public-launch definition only:** [`mvp.md`](mvp.md). **Live task title, scope, acceptance, dependencies and status:** Linear. **Shipped implementation code:** merged `main`. **Current verification evidence:** target-checkout source and tests, plus live Supabase where applicable; unmerged changes are not shipped.
- Before substantial implementation: **intent (why) → spec (testable what) → plan (how) → real proof**. Read the current Linear issue and relevant existing task files; do not invent missing specifications.
- **Existing optional templates:** [`intent.md`](docs/07-operations/intent-spec-plan/templates/intent.md) · [`spec.md`](docs/07-operations/intent-spec-plan/templates/spec.md) · [`plan.md`](docs/07-operations/intent-spec-plan/templates/plan.md). See [intent/spec/plan guide](docs/07-operations/intent-spec-plan/README.md). For S2–S4 tasks, use a task-specific folder only when it helps; focused tasks use Linear directly. **`specs.md` (plural) is not the canonical template.** The older root [`plan.md`](plan.md) is a dated snapshot, **not** today's task queue.
- Do not treat complete Markdown as feature completion. Link current code, exact tests, PR and operational evidence in the existing Linear issue.

## Agent skills and instruction ownership

- Repository rules: **this file**. Procedures and domain contracts: [canonical skill index](.claude/skills/INDEX.md) and `.claude/skills/<name>/SKILL.md`; `.agents/skills/` exposes the same skills through checked relative symlinks. Tests/CI own mechanical enforcement.
- Choose the **requested outcome**: `errors` for bugs; `praudit` for merge review; `linear-task` / `linear-audit` for Linear issues; `implement` for scoped changes; `plan` / `architect` for design; `efficient` / `ponytail` for reuse; `tests` / `testing` / `e2e` for proof; `tasks` for PR/worktree lifecycle; `merge` / `prod` / `progress` for verified status. Use `using-mde-skills` only if ambiguous; load domain skills as needed.
- **S4 verification stays independent:** auth/RLS/tenant, payments, secrets, destructive production work and irreversible retries require independent [`task-verifier`](.claude/skills/task-verifier/SKILL.md) evidence. No self-certification. Read the exact applicable skill before executing; ChatGPT does not automatically acquire local repository skills.
- Do not restate long specialist instructions here. Change the **owning** skill or reference and delete stale copies, keeping links from this file. `CLAUDE.md` imports this file through `@AGENTS.md`.

## Optional Jev tool selection

[Jev agent reference](jev-agent.md) covers available MCP tools, Quicksilver, Supercov, Jev Evals, measured pilots (not benchmarks), privacy and MDE examples. Use `rg`/current Graphify and existing repository skills first; invoke Jev only when semantic discovery, bounded decisions, ambiguous classifications, subjective AI quality or advisory evidence review adds value. Deterministic Vitest/Playwright/DB assertions, CI and independent `task-verifier` remain authoritative. Do not install duplicate tools, require Jev availability, expose secrets/private user evidence, or introduce prelaunch business gates.

## Authenticated QA — existing 1Password and Playwright only

- Reuse existing passwordless QA users and [`e2e/fixtures.ts`](e2e/fixtures.ts) / [`e2e/helpers/auth.ts`](e2e/helpers/auth.ts). No duplicate login helpers, permanent test identities, auth bypass or browser service-role keys.
- On the configured Ubuntu QA host, the **host-local, untracked** `mde-qa-op` accesses 1Password Developer Environment `MDE-QA` (account `my`); run `mde-qa-op npm run qa:auth:check` and require both PASS markers. On other hosts/CI use the already-authorized environment in [`e2e/README.md`](e2e/README.md#agent-qa-commands--authenticated-chrome) and require `MDE QA auth: PASS`. Never list or log 1Password secret values.
- Use `mde-qa-op npm run qa:browser -- --role=renter --origin=https://www.mdeai.co --allow-remote --port=9255` for **read-only live** Renter inspection; use `--origin=http://localhost:3002` with `npm run dev:ui:worktree` in the configured QA worktree for localhost. Choose `event-host` or `broker` when appropriate; Super Admin uses only the protected `superAdminPage` Playwright fixture (`mde-qa-op npm run qa:test:admin` on that host).
- The launcher verifies login at `/saved`. Connect trusted Chrome DevTools MCP to **127.0.0.1 and the selected `--port`** (default 9227, example 9255); do not share/control the same tab from two agents. Keep authenticated `screenshot`, `trace`, `video` off, never upload private artifacts, and press Ctrl+C to remove the temporary profile/CDP listener.
- For real user journeys prove UI → API/auth/RLS → DB readback, 390px, retries and cleanup; any live write requires explicit task-specific opt-in. Full steps: [1Password QA guide](docs/06-testing/1password-qa-agent-guide.md) and [E2E role/security guide](e2e/README.md#role-selected-qa-and-private-artifacts). Never infer durable success from a toast.

## Build, reuse and verification

- Resolve commands from [`package.json`](package.json) at the target SHA. Common loop: `npm ci` → focused test → `npm run lint` → `npm run typecheck` → `npm run build` / Playwright when relevant → `npm run floor` before merge. DB security: `npx supabase test db`; skill links: `npm run check:skills`.
- Follow [`ponytail`](.claude/skills/ponytail/SKILL.md): inspect actual code first; reuse existing components, standard/platform APIs and pinned official examples before custom logic; fix the shared cause and leave a runnable check. Never sacrifice correctness, validation, accessibility or security to shrink a diff.
- Before broad code searches, use an existing *current* `graphify-out/graph.json` and [Graphify guidance](docs/07-operations/graphify-reference.md) when helpful; otherwise inspect source directly. Graph output guides navigation, not production truth.
- [Tests and worktree traps](.claude/skills/tasks/references/pre-merge-tests.md) cover fresh worktree env/bootstrap, Node tests outside Vitest, shared Supabase cleanup, rate limits and local Codacy setup. [Task workflow](.claude/skills/tasks/SKILL.md) owns PR sequencing and `task-verifier` owns independent Done claims.

## Technical safeguards and permissions

- **Always:** authenticated server-side authorization, private-data isolation, RLS for new Supabase tables, atomic/idempotent writes, accurate data and source attribution; Places field masks and supported Maps marker configuration; trusted skill review; the fewest complete PRs.
- **Ask first:** changing production AI provider/model, destructive/irreversible production data, or editing required CI/release gates and `.github/workflows/**`.
- **Never:** leak secrets/service keys or authenticated browser artifacts; mix CopilotKit v1 imports with `/v2`; reset unrelated work; fake prices, locations, ownership, availability, transactions or verification; weaken security, RLS or CI gates to pass a test. **Phase A business eligibility/approval gates are separate and must not obstruct development.**
- Existing [Claude hooks](.claude/hooks/) and `scripts/__tests__/claude-hooks.test.mjs` enforce sensitive-path, secret, dependency, Maps, lint, RLS and stop checks; do not bypass them.

## Source evidence, PRs and Done

- Verify mutable APIs from installed pinned source/types and version-matched official docs before adapting upstream examples. **Source proof** of an API and **implementation proof** of our integration are both necessary; a link does not substitute for a test. Use [`research`](.claude/skills/research/SKILL.md) and [`ponytail`](.claude/skills/ponytail/SKILL.md).
- For a material external reference, record a **source receipt** in the PR/issue: URL, exact Source, Decision, `COPY/ADAPT/MODEL/REFERENCE ONLY`, Destination, Implementation, Verification, and Version/commit where relevant. Record a rejected alternative for `REFERENCE ONLY`; don't cite background reading as implementation evidence.
- One PR should deliver one independently testable outcome, with real-world title, exact tests, honest risks and evidence. Follow [`tasks/references/github-pr.md`](.claude/skills/tasks/references/github-pr.md) for scope, source receipts, review and approval.
- `main` requires `floor` and `mastra-schema-init` green on the **exact head**, zero unresolved verified findings, and human approval. The narrowly defined sole-collaborator administrative exception is documented in the [PR guide](.claude/skills/tasks/references/github-pr.md); never infer approval or production deployment from CI. Codacy is advisory; assess findings, do not game the scanner.
- **Done requires** focused implementation proof, affected integration/user journey, applicable repo gate, current-head CI, resolved review, and required approval. [`task-verifier`](.claude/skills/task-verifier/SKILL.md) challenges false greens; `tasks` owns post-merge checks. Current source code and tests determine feature details subject to Phase A policy.

## Response style and application context

Lead with the outcome and evidence; use plain English, real-world examples and verified `SAN-#### · Exact Linear Task Name`. Main app surfaces include Rentals, Events/Tickets, AI Concierge, local discovery, admin, and `/api/copilotkit/[[...path]]`. Do not fabricate task completion or production readiness.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
