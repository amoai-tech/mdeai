---
name: mde-vercel
description: >-
  Use when deploying MDE to Vercel, configuring Vercel environments or domains, diagnosing Vercel deployments, or optimizing Next.js for Vercel runtime and performance.
paths:
  - "vercel.json"
  - "vercel.ts"
  - ".vercel/**"
  - "package.json"
  - ".vercelignore"
---

# mde-vercel — Vercel superskill

Pick the topic that matches the work, then load it.

| Intent | Read |
|--------|------|
| Deploy / preview / env / domain / rollback ops | [deploy.md](deploy.md) |
| React / Next.js performance patterns from Vercel Engineering | [react-best-practices.md](react-best-practices.md) |
| Deep references | [references/](references/) |

## Decision rule

- **"Deploy this", "preview link", env var question** → `deploy.md`
- **"Why is this slow", "optimize bundle", RSC/streaming question** → `react-best-practices.md`
