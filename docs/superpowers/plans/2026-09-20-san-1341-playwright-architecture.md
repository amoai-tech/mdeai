# SAN-1341 Playwright Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Land the Microsoft-style Playwright project architecture, deterministic critical coverage, CI gate, and safer test interactions without changing product or Supabase behavior.

**Architecture:** Keep current MDE dependencies. Split the runner into deterministic local, selected cross-browser, and live production projects. Refactor only the critical helper paths and use route mocking for fast-path UI contracts.

**Tech Stack:** Next.js 16.3.5, Node 24.21.0, Playwright 1.60.x, Vitest 4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-20-san-1341-playwright-architecture-design.md`

## Global Constraints
- No dependency downgrade.
- No Supabase schema/RLS changes.
- No secrets/auth state committed or uploaded.
- Production smoke stays real and serialized.
- Preserve direct `playwright` package because repo scripts import it.

## Review Focus
- Local project accidentally includes live/prod specs.
- Production project accidentally starts a local web server or uses mocks.
- Parallel tests share mutable auth/data state.
- Critical tests still use arbitrary sleeps or native DOM value setters.
- CI installs browsers it does not execute or omits trace/report artifacts.

### Task 1: Architecture contract and config
- [ ] Add failing Vitest contract for project names/defaults.
- [ ] Verify RED against old config.
- [ ] Implement project split and auth ignore.
- [ ] Verify GREEN and `playwright test --list`.
- [ ] Commit.

### Task 2: Critical deterministic fast paths
- [ ] Add route-mocked restaurant/rental journey tests first.
- [ ] Verify RED before helper changes.
- [ ] Replace native DOM setters with `fill()` and remove restaurant fixed sleep.
- [ ] Verify deterministic Chromium tests GREEN.
- [ ] Commit.

### Task 3: PR CI gate and scripts
- [ ] Add CI contract test for focused Chromium workflow.
- [ ] Verify RED.
- [ ] Add workflow/scripts and Playwright lint integration if compatible.
- [ ] Verify GREEN, lint, typecheck.
- [ ] Commit.

### Task 4: Full verification and cutover evidence
- [ ] Run targeted local suite and selected cross-browser list/smoke.
- [ ] Run full Vitest, lint, typecheck, Floor, diff-check.
- [ ] Review secrets/artifacts/diff.
- [ ] Commit docs/evidence updates if needed.
