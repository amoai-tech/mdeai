# Specification: [feature / issue outcome]

**Linear:** [SAN-#### · verified title](https://linear.app/amo100/issue/SAN-####)
**Intent:** [relative path to matching intent.md]
**Status:** Draft (document only)
**Source verified at:** [branch/SHA and live issue timestamp]

## Current verified behavior

- Existing: [exact route/component/function/test and evidence]
- Missing or failing: [reproduced behavior or explicitly unverified claim]
- Reuse: [single canonical owners; avoid parallel systems]

## Functional behavior and user journey

[actor] → [input] → [real retrieval/action] → [visible result] → [persisted result where needed].

| Case | Given / when | Required result | Evidence needed |
| --- | --- | --- | --- |
| Success | [input and existing record] | [observable result] | [test or browser/DB proof] |
| Missing data | [unknown or stale record] | [honest empty/error, never fabricated] | [negative test] |
| Failure/retry | [aborted run or retry] | [no false success/duplicate write] | [recovery test] |
| Security | [unauthorized user] | [denied, no private data] | [authorization test] |

## Interfaces and ownership

- UI: [existing route and component]
- Agent/API: [existing tool and boundary, when applicable]
- Data: [existing Supabase tables/RPCs, if applicable]
- Dependency/contract: [installed version and source when material]

## Acceptance criteria

- [ ] [Behavior and measurable proof]
- [ ] [Negative/recovery case]
- [ ] [Security/data integrity when relevant]
- [ ] [Mobile/desktop when UI]

## Non-goals and STOP conditions

[No second provider/engine, extra business approval gates, unauthorized writes, or unverified assumptions.]

**Next:** implementation sequence and proof in the same task's [plan.md](plan.md). Linear owns live task state; documents do not establish "Done".
