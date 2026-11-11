---
name: prompt
description: Creates or improves prompts using clear instructions, useful context, proportional structure, explicit success criteria, and minimal unnecessary detail. Use when drafting, reviewing, shortening, or strengthening reusable prompts.
---

**PROMPTS — Write & Improve Prompts**

**Goal**
Create clear, direct prompts that reliably produce the desired result with minimum necessary structure.

**1. State the task**
Lead with the action and desired result.
Include only context that changes decisions.

**2. Define requirements**
Specify relevant:
- scope
- constraints
- authoritative sources
- output format
- success criteria
- what must remain unknown
Say what to do; use negative rules only for real failure risks.

**3. Explain important constraints**
Give the reason when it helps the model generalize.
Example:
> Verify the exact PR head because older CI does not prove the current code.

**4. Use structure proportionally**
Simple task → short prompt.
Complex task → headings or XML only when boundaries are genuinely useful.
For long context: **sources first → task/query after**.

**5. Use examples carefully**
Add examples only when format, tone, or behavior is hard to describe.
Use representative examples; never include patterns you do not want copied.

**6. Allow uncertainty**
If evidence is missing, require:
- `unknown`
- `null`
- or a clear statement of what would verify it
Never force confident guessing.

**7. Control agent behavior**
State:
- which sources/tools are authoritative
- read-only vs mutation authority
- what must be verified
- whether external research is needed
Avoid “review everything.” Inspect only load-bearing paths.

**8. Define observable success**
Use outcomes such as:
- exact test passes
- persisted row exists
- deployed SHA matches
- unauthorized request fails
- cited source supports claim
Avoid vague goals like “make it perfect.”

**9. Improve reusable prompts**
Test realistic examples, inspect misunderstandings/wasted work, then:
- remove ineffective instructions
- add specificity only for observed failures
- retest
Longer is not automatically better.

**Template**
```md

**Task**
[Direct action + result]

**Context**
[Only useful context]

**Requirements**
- [...]

**Sources**
[Authoritative truth]

**Process**
1. [...]

**Output**
[Exact useful format]

**Success**
[Observable pass condition]
```

**Review**
Ask:
- Is the real task obvious immediately?
- Can this be shorter?
- Are sources/constraints clear?
- Can unknowns remain unknown?
- Is success observable?

**Output**

**Improved prompt**
Copy/paste-ready prompt.

**Changes**
Only material improvements.

**Why**
Brief reason.
