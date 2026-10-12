---
name: research
description: Researches technical decisions using local truth and authoritative primary sources, then maps the best proven approach to exact implementation. Use when current APIs, SDKs, vendor capabilities, patterns, or external evidence affect a technical decision.
---

**RESEARCH — Technical Decision Research**

**Goal**
Find the best proven solution, verify it from authoritative sources, and map it to implementation.

**1. Define the decision**
State:
- what must be decided/implemented
- current stack/version
- key constraints: MVP, cost, security, compatibility, deployment

**2. Check local truth first**
Inspect only relevant:
- current implementation
- installed source/types
- existing dependencies/utilities
- schema/runtime/config when needed
Do not recommend rebuilding something already present.

**3. Find the fastest safe solution**
Prefer:

**existing implementation → configuration/vendor capability → official SDK/module → official example → minimal custom code**

**4. Use primary sources**
Order:
1. installed source/types
2. official docs
3. official repo/examples
4. official release/migration guides
5. secondary sources only if necessary
Verify current versions; do not rely on memory for changing APIs.

**5. Verify decision-relevant facts**
Check only what matters:
- supported/current vs deprecated
- compatibility
- security/reliability
- production limitations
- cost/plan limits
- operational burden

**6. Map sources to implementation**
For each important source:

**URL → what it proves → COPY / ADAPT / MODEL / REFERENCE ONLY → destination → verification**
No link dumps.

**7. Decide**
Compare only:
- correctness
- effort
- maintenance
- security/reliability
- compatibility
- cost/operations
Recommend one approach and identify what still needs custom work.

**8. Define proof**

**focused test/prototype → integration/runtime → real workflow proof when required**
Docs alone are not production proof.

**Output**

**Recommendation**
1–3 sentences.

**Evidence**
Facts that drive the decision.

**References**
Only actionable sources.

**Implementation**
Exact application steps.

**Risks**
Only material limits.

**Proof**
Required checks.

**Next step**
Highest-value action.
