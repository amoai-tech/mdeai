---
name: outcomes
description: Defines measurable end states, gradeable criteria, required evidence, and pass or failure conditions. Use when work needs explicit definitions of done or an outcome grader should verify completion.
---

**OUTCOMES — Define & Grade Done**

**Goal**
Define the observable end state before execution, then verify it with explicit evidence.

**1. State the outcome**
Describe the final result, not implementation steps.
Good:
> A renter submits one viewing request and exactly one lead/showing is persisted for the correct broker.
Bad:
> Create an RPC and update the frontend.

**2. Identify what is graded**
Specify the artifact or workflow:
- code/change
- file
- deployed feature
- database state
- E2E journey
- research/migration result

**3. Write gradeable criteria**
Each criterion should be independently checkable.
Prefer exact states, values, persisted results, authorization outcomes, and source-backed facts.
Avoid “looks good,” “high quality,” or “production ready.”

**4. Require evidence**
For important criteria define proof:
- run exact test
- inspect persisted row/state
- verify deployed SHA
- fetch cited source
- prove unauthorized failure
- prove retry creates no duplicate
Do not pass on plausible-looking output alone.

**5. Anticipate false success**
Ask how the agent could appear done while failing the real outcome.
Examples:
- UI says success but DB write failed
- citation does not support claim
- preview works but production is stale
- retry duplicates transaction

**6. Define what to ignore**
Exclude unrelated style issues, pre-existing defects, optional improvements, and unrelated warnings.
Only grade the requested outcome.

**7. Set iteration rules**
Typical:
- simple: 2–3 iterations
- moderate: 3–5
- complex: up to 5–8 when justified
Stop when all criteria pass, a real blocker exists, or max iterations is reached.

**Output**

**Outcome**
One concise end-state statement.

**Rubric**
Numbered independent criteria.

**Evidence**
Proof required for critical criteria.

**Ignore**
What must not cause failure.

**Pass**
Exact satisfied condition.

**Failure**
What requires revision or blocks completion.

**Rules**
- Grade outcomes, not commands.
- One coherent outcome per loop.
- Unknown evidence means not proven.
- Feedback should be **criterion → evidence → correction**.
