---
name: launch
description: Audits MVP launch readiness, identifies true launch blockers, and cuts work that does not materially affect safe core user journeys. Use when deciding what must be completed, deferred, or removed before launch.
---

**LAUNCH — MVP Readiness**

**Goal**
Identify the minimum remaining work required to launch safely and cut work that does not materially affect the core product.

**1. Define launch journeys**
Use requirements/MVP/current truth to define the critical user journeys and observable success.

**2. Verify current truth**
Check relevant:
- current main/open PRs
- Linear
- production deployment
- Supabase/schema/config
- external providers
- real workflow evidence

**3. Classify work**
- 🔴 MVP · Launch Blocker
- 🟡 MVP · Launch Supporting
- 🟢 MVP · Complete
- ⚪ MVP · Post-MVP
- ❌ MVP · Removed/Obsolete
Ask:
> If this fails, can a real user still safely complete the core production journey?
Do not classify from Linear status alone.

**4. Find real blockers**
Examples:
- broken critical journey
- auth/RLS/isolation failure
- duplicate transactions/retries
- payment/webhook failure
- unsafe data
- source/schema/config drift
- unrecoverable failure
- required mobile failure
- missing diagnostics
- synthetic-only production certification

**5. Build the shortest critical path**
Order:

**blocker → dependency → user journey → security/reliability → supporting quality**
Use full Linear names:

**SAN-#### · Exact Linear Task Name**
Cut speculative infrastructure and polish that do not reduce launch risk.

**6. Define proof**
Use:

**focused → RLS/integration → browser/E2E → exact production journey**

**Output**

**Launch verdict**
Ready / Not ready / Conditional.

**Proven journeys**
What works with evidence.

**Blockers**
Only launch blockers.

**Supporting**
Useful but non-blocking work.

**Cut/defer**
Post-MVP or obsolete work.

**Execution order**
Exact tasks in dependency order.

**Production-ready success**
Observable certification criteria.

**Next step**
Highest-value blocker.

**Rules**
- User safety/value over task count.
- Production truth beats stale planning docs.
- Do not call launch-ready until real production journeys are proven.
