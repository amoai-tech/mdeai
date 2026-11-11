---
name: progress
description: Use when tracking what is complete, in progress, blocked, not started, or still needs evidence; produces an evidence-based status of tasks or project work without inventing completion percentages.
---

**PROGRESS — Evidence-Based Status**

**Goal**
Show what is complete, in progress, blocked, not started, or unproven using current evidence.

**1. Verify current truth**
Use relevant:
- Linear
- current main/PRs
- runtime/production
- Supabase/provider state
Do not infer completion from status labels alone.

**2. Classify each item**
- 🟢 Complete — delivered and verified
- 🟡 In progress — partially implemented
- 🔴 Blocked — cannot proceed safely
- 🔵 Not started — no verified implementation
- ❓ Needs evidence — status cannot be proven

**3. Report proof**
For each item state:

**task/outcome → status → evidence → blocker/gap → next action**
Use full Linear names:

**SAN-#### · Exact Linear Task Name**

**4. Avoid fake percentages**
Use percentages only when there is a real denominator and objective measurement.
Prefer status + evidence.

**5. Prioritize next work**
Order:

**launch blocker → dependency → user journey → reliability/security → polish**

**Output**
| Task / Outcome | Status | Evidence | Gap / Blocker | Next Action |
|---|---|---|---|---|

**Rules**
- Evidence over optimism.
- No generic technology inventory.
- No fake % complete.
- Do not call Done without proof.
- Keep the tracker concise.
