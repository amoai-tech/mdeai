---
name: docs
description: Use when updating PRDs, roadmaps, MVP docs, technical docs, runbooks, or resolving contradictions between docs and implementation; synchronizes documentation with verified current product, code, runtime, and execution truth.
---

**DOCS — Documentation Sync**

**Goal**
Update documentation to match verified current truth without duplicating ownership.

**Source ownership**
- PRD = requirements/user outcomes
- roadmap = strategy/sequencing
- mvp.md = launch scope/gates
- Linear = live execution state
- GitHub/current main = implementation truth
- technical docs = architecture/APIs/runbooks

**1. Verify truth**
Inspect only relevant:
- current main/PRs
- Linear
- production/runtime when needed
- Supabase/provider config when needed

**2. Find contradictions**
Look for:
- shipped vs planned mismatch
- stale architecture/dependencies
- wrong task status
- outdated versions/config
- duplicate facts owned by multiple docs

**3. Make the smallest doc change**
Prefer:

**correct → remove stale text → link canonical source → add only missing facts**
Keep history only when it remains useful.

**4. Use precise status language**
Use:
- planned
- implemented
- verified
- production-ready
- blocked
Do not claim shipped/verified/production-ready without evidence.

**5. Check consistency**
Verify:
- references point to current tasks/PRs/files
- terminology is consistent
- no contradictory owner remains

**Output**

**Updated**
Docs changed.

**Corrections**
Facts fixed/removed.

**Conflicts**
Remaining contradictions.

**Current truth**
Canonical sources.

**Gaps**
Anything still unknown.

**Next step**
Highest-value documentation action.

**Rules**
- One owner per fact.
- GitHub is implementation truth.
- Linear is execution truth.
- Do not copy the same status into many docs.
- Keep changes concise.
