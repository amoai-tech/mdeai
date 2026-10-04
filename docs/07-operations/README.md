---
title: MDE AI Operations
description: Canonical navigation for local development, verification, deployment, security, observability, and troubleshooting.
status: current
updated: 2026-09-20
source_of_truth: current repository code and tests
---

# Operations

Canonical navigation for running, validating, deploying, securing, and troubleshooting MDE AI. Keep detailed procedures in dedicated runbooks rather than duplicating them here.


## Contents

- [Local development](#local-development)
- [Verification](#verification)
- [Graphify repository intelligence](#graphify-repository-intelligence)
- [Deployment and runtime](#deployment-and-runtime)
- [Supabase and security operations](#supabase-and-security-operations)
- [Maps and environment checks](#maps-and-environment-checks)
- [Troubleshooting rule](#troubleshooting-rule)

## Development workflow

- [`agent-workflow-plan.md`](agent-workflow-plan.md) — plan for Linear, agent handoffs, GitHub, docs/GitBook, and changelog ownership.

## Local development

Run commands from the current Git checkout root. On the audited machine this is `/home/sk/mdeai`, but agents should resolve the repository root dynamically rather than hard-code machine paths.

Key scripts:

- `npm run dev` — UI + Mastra agent process.
- `npm run dev:ui` — Next.js UI on port 3001.
- `npm run dev:agent` — Mastra development server on port 4111.
- `npm run check:env:ci` — CI-oriented environment validation.

## Verification

Use the cheapest decisive check first, then broaden only when the change requires it:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run floor`
- `npm run check:docs`

See `docs/06-testing/` for focused QA and browser/E2E procedures.

## Graphify repository intelligence

Use the repository wrappers so Graphify follows project configuration:

- `npm run graphify:update`
- `npm run graphify:query -- "<question>"`
- `npm run graphify:explain -- "<symbol>"`
- `npm run graphify:path -- "<A>" "<B>"`

Detailed guidance: `docs/07-operations/graphify-reference.md`.

## Deployment and runtime

Production promotion should follow the current release task/runbook and provider configuration. Do not infer production state from local success alone. Run the relevant production smoke journey after deployment when the change affects runtime behavior.

Representative production check: `npm run test:e2e:prod-synthetic`.

### Production health signals

Three signals, and each states only what it actually tested:

| Signal | When it runs | What it proves | Blocking |
| -- | -- | -- | -- |
| **Candidate Runtime Certification** | pre-promotion, against the staged candidate | the candidate's *runtime*: it boots, auth works, and one concierge turn completes and persists | yes — Vercel blocks alias assignment until it passes |
| **Production Runtime Smoke** | post-promotion, nightly, manual | each vertical's chat results reach a valid **rendered terminal state**: result cards, or that vertical's explicit empty state | yes for runtime; it never asserts inventory |
| **Marketplace Health** | alongside Production Runtime Smoke | live inventory counts (total / consumer-visible / requestable-eligible) | no — observation only |

**The rule: a green check must never claim more than it tested.** Certification publishes
"Candidate runtime certified — promotion checks passed. Marketplace inventory not evaluated."
That wording is deliberate: it must not be readable as "everything is healthy" while a separate
live-data signal says otherwise. Signatures: `vercel-production-certification.yml` and
`prod-synthetic-smoke.yml`.

**An empty marketplace is a valid product state.** Zero published listings reports as
**Marketplace Health: empty** and must never turn **Production Runtime Smoke** red. A vertical may
only pass as empty when its own explicit empty-state element rendered — "no cards and no error" is
a failure, not an empty state. Never seed fake inventory to make a health signal green. The
terminal-state contract lives in `e2e/helpers/vertical-terminal-state.ts`.

These three names are canonical. Do not introduce `prod smoke`, `live-data health`,
`inventory certification`, or a generic `production health`.

## Supabase and security operations

- Current migrations/functions/policies in the repository own intended database behavior.
- Live production state must be checked before destructive changes.
- Preserve RLS, explicit authorization, tenant isolation, service-role boundaries, webhook verification, and idempotency.
- Dated inventory evidence belongs in architecture snapshots/audits and must not be silently rewritten as current live truth.

Security references live under `docs/07-operations/security/`.

## Maps and environment checks

- `npm run verify:maps`
- `npm run smoke:map-pins`

Local QA details: `docs/06-testing/localhost-qa-runbook.md`.

### CopilotKit environment variables (SAN-1330)

Three different things used to share one confusing name. They are now separate, and each has one job:

| Variable | What it is | Where it is read | Required? |
| -- | -- | -- | -- |
| `NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY` | CopilotKit public **license** key (safe in the browser bundle) | Passed as `publicLicenseKey` by `src/lib/copilotkit-client-props.ts`. Chat still uses the same-origin `/api/copilotkit` runtime: in CopilotKit 1.75.0 `runtimeUrl` always wins, so this key never redirects chat to CopilotKit Cloud. | Yes in a **production build**; the mocked-CI floor does not need it. |
| `CPK_INTELLIGENCE_API_KEY` | CopilotKit **Intelligence** API key (server-only, never `NEXT_PUBLIC_*`) | **Not read by the app today.** CopilotKit reads it only through `new CopilotKitIntelligence({ apiKey })`, which would move threads to CopilotKit's hosted platform. MDE keeps the same-origin runtime on purpose (UX-001 and the thread-ownership rules, D17), so enabling it is an architecture decision, not a rename. | Yes (presence check in `check:env:runtime` and the release gate). |
| `MDE_COPILOTKIT_SERVICE_BEARER` | MDE's **own** service-to-service bearer for `/api/copilotkit` (`src/lib/copilotkit-auth.ts`) | The route's service path. Nothing in the repo presents it today. | **No.** Unset means the service path is closed (401), never open. |

The retired name `COPILOTKIT_API_KEY` was MDE's own bearer, but it read like a CopilotKit credential. It is no longer used anywhere; `scripts/__tests__/copilotkit-env-names.test.mjs` fails if production code, the contract, the release gate, the workflows or `.env.example` read it again. Older audit and archive documents still mention it as a historical record.

`scripts/vercel-release-control.mjs` checks the **names** of these variables on the Vercel Production target before a candidate can be promoted (names only, never values).

## Troubleshooting rule

When a failure is not understood, reproduce it first, capture the smallest failing command/journey, inspect current source/runtime evidence, then fix the root cause. Do not change production data or provider configuration merely to make a local symptom disappear.
