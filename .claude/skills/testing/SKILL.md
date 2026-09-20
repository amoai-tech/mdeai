---
name: testing
description: >-
  Use when designing test-first changes, selecting test seams, running or interpreting MDE Vitest/Playwright/smoke/eval/production tests, or proving regressions with RED → GREEN → REFACTOR.
title: Testing — mdeai.co toolchain + Claude-assisted layers
impact: HIGH
impactDescription: Vitest/Playwright/MCP recipes + generic layers + evals
tags: testing, vitest, playwright, evals, claude-code, e2e, mdeai
paths:
  - "src/**"
  - "tests/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "playwright/**"
  - "e2e/**"
  - "vitest.config.*"
---

# testing — mdeai.co + cross-stack test layers

## Ownership

`testing` is the single owner for test strategy, test-first implementation, regression proof, running tests, and interpreting test results. Use `systematic-debugging` first when the failure source is unknown; return to `testing` once the behavior/seam is localized.

For test-first work, read [references/tdd.md](references/tdd.md). For broader strategy, read [references/testing-strategy.md](references/testing-strategy.md).

## When NOT to use

- **Load / soak testing** as the primary ask (no mdeai harness yet)—keep scope to shipped gates in CLAUDE.md

Pick the topic that matches the work, then load it.

| Intent | Read |
|--------|------|
| Component tests, unit tests, jsdom, Vitest config, mocks | [vitest.md](vitest.md) |
| Playwright e2e, real browser, login flow, multi-step | [playwright.md](playwright.md) |
| Chrome DevTools MCP — traces, network panel, real-browser inspection | Use the configured Chrome DevTools tooling directly; keep test ownership in `testing` |
| LCP / Core Web Vitals verification | Use current performance tooling; performance implementation ownership stays with the affected framework/deploy domain |
| Manual exploratory testing, dogfood session, bug discovery | [exploratory.md](exploratory.md) |
| Choosing what to test (pyramid, ROI, coverage strategy) | [references/testing-strategy.md](references/testing-strategy.md) |
| Common bug patterns / triage taxonomy | [references/issue-taxonomy.md](references/issue-taxonomy.md) |
| Map of layers (unit → E2E → visual → mobile → agentic → evals) | [references/testing-layers.md](references/testing-layers.md) |
| Curated external links (subagents, marketplace, Anthropic eval docs) | [references/resource-hub.md](references/resource-hub.md) |
| Browser/MCP tool itself failing to connect | `systematic-debugging` |

---

## Browser surfaces — pick one

Choose the lightest surface that proves the behavior:

| Surface | When to pick |
|---------|--------------|
| **Playwright** | Repeatable E2E/user journeys, auth flows, regression coverage, CI-safe browser proof |
| **Chrome DevTools tooling** | Network/console/performance traces, Lighthouse/Core Web Vitals, runtime inspection |
| **Interactive authenticated browser tooling** | A real signed-in session is required and the configured environment explicitly provides it |

Resolve available browser tooling from the current environment; do not assume a historical MCP/plugin is installed. Never hardcode test-user passwords or tokens in a skill.

---

## mdeai recipes

| Job | Surface | Owner skill |
|-----|---------|-------------|
| LCP regression on `/coffee` | current browser performance tooling | `testing` for proof; affected framework/deploy skill for implementation |
| Lighthouse audit on a Vercel preview URL | Chrome DevTools tooling (`lighthouse_audit --mode navigation --device mobile`) | `nextjs` |
| Bundle / Core Web Vitals trace | current performance tooling | `testing` for proof; `nextjs` for implementation ownership |
| Supabase email/OAuth sign-in regression | Playwright or configured authenticated browser | `testing` → [playwright.md](playwright.md) |
| Stripe checkout end-to-end | authenticated browser/Playwright path | `testing` + `stripe` |

| UI four-state visual verify | Playwright | `testing` → [playwright.md](playwright.md) |
| RLS / 403 debugging during a UI flow | Chrome DevTools tooling (`list_console_messages --types error` + `list_network_requests --resourceTypes Fetch`) | `supabase`, `systematic-debugging` |
| Console-error sweep before commit | Playwright or current DevTools tooling | `testing` |

---

## Repo-specific pointers (mdeai.co)

- Vitest entry: `npm run test` (run once) / `npm run test:watch`
- Playwright E2E coverage exists under `e2e/`; use focused specs first instead of the full suite for narrow changes.
- Required-states pattern in the MDE UI state contract: every data-fetching component handles loading/error/empty/success — tests must cover all four
- Resolve the active dev/preview command and port from current repo configuration instead of hardcoding a historical port.

---

## Route by intent (task lifecycle)

| User need | Open |
|-----------|------|
| Task lifecycle Phase 4 routing | `tasks` + this testing skill |
| Test-first implementation / regression proof | [references/tdd.md](references/tdd.md) |
| Ship checklist + deploy gates | `tasks` + `task-verifier` + current deploy/runtime checks |

---

## Decision tree (thin)

```
Goal
 ├─ Only choosing framework / layer / CI shape for a greenfield app → testing-layers.md
 ├─ External guides + subagent checklist → resource-hub.md
 ├─ This repo (Vitest, Playwright, npm scripts) → vitest.md / playwright.md
 └─ Ship checklist + deploy gates → tasks + task-verifier + current deploy/runtime checks
```

---

## Principles (always)

1. **Fast feedback first** — unit + lint before heavy E2E.
2. **One golden runner per layer** per repo; don't mix incompatible assertion styles.
3. **Flakes are defects** — fix or quarantine; don't mask with infinite retries.
4. **Agentic loops need fresh context** — long chains degrade quality; reset or compact between batches ([workflow notes](https://www.nathanonn.com/claude-code-testing-task-management-workflow/)).
5. **LLM evals need frozen rubrics** — version the judge prompt and golden set like code.
6. **Security "light sweeps" ≠ pentest** — escalate real assurance to specialists.

---

## Quick framework peek

| Layer | Typical tools |
|-------|----------------|
| Unit | Vitest, Jest, JUnit, XCTest |
| Web UI | Playwright, Cypress |
| Mobile | Detox, Appium, Espresso, XCUITest |
| API | Supertest, REST Assured, contract checks |

Full table + workflows → **testing-layers.md**.

---

## Resources in this folder

- `examples/` — console logging, element discovery, static HTML automation snippets
- `scripts/with_server.py` — wrap test runs around a dev server
- `templates/` — dogfood session templates

---

## Skill composition note

Authored using the shared **[skill-authoring standard](../tasks/references/shared/skill-authoring-standard.md)**: thin **`SKILL.md`**, progressive disclosure via **`references/`**, explicit **anti-triggers** in YAML `description`.
