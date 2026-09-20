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

## Troubleshooting rule

When a failure is not understood, reproduce it first, capture the smallest failing command/journey, inspect current source/runtime evidence, then fix the root cause. Do not change production data or provider configuration merely to make a local symptom disappear.
