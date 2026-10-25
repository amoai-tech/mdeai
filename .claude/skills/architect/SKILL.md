---
name: architect
description: Use when deciding whether a proposed system, API, service, or data flow fits MDE architecture; reviews boundaries, ownership, reuse, and unnecessary duplication.
---

**ARCHITECT — Architecture Fit Review**

**Goal**
Decide whether a proposed change fits the existing system or creates unnecessary duplication, coupling, or drift.

**1. Define the change**
State:
- required user/system outcome
- proposed components/data flow
- constraints

**2. Trace current architecture**
Inspect the load-bearing path only:

**entry/UI → backend/service → data → auth/RLS → external provider → tests/runtime**
Identify current sources of truth and ownership.

**3. Check duplication**
Ask:
- Does this capability already exist?
- Can the existing contract/module be extended?
- Would this create a second source of truth?
- Does it duplicate state, validation, search, auth, persistence, or workflow logic?
- Would two systems need synchronization?

**4. Check fit**
Evaluate:
- boundaries and responsibilities
- data ownership/writers/readers
- contracts/API compatibility
- auth/RLS
- transaction/idempotency behavior
- failure/recovery
- deployment/runtime
- maintenance burden
-

**5. Prefer the smallest design**
Order:

**reuse module → extend contract → configure platform/vendor → minimal new component**
For writes prefer:

**validate → authorize → execute → persist → confirm**

**6. Define exact impact**
Name only verified touch points:
- files/modules
- schema/functions
- APIs/providers
- tests
Do not invent paths.

**Output**

**Verdict**
✅ Fits / 🟡 Fits with changes / 🔴 Harmful duplication

**Current architecture**
Relevant owners/sources of truth.


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
