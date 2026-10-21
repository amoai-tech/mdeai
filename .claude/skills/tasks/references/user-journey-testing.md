# MDE user-journey testing standard

Prove that a real actor can complete the requested MDE outcome across UI, CopilotKit/Mastra (where used), server authorization, Supabase and durable state. A page rendering or a passing mocked tool test is not end-to-end proof.

**Scope:** Load this reference only for user-facing, cross-system or AI-native changes. Documentation-only, pure helper and static refactor PRs should use the narrow tests in [pre-merge-tests.md](pre-merge-tests.md), not unrelated browser or payment runs.

## Quick lookup — use the affected MDE journey

| Actor / feature | Journey to verify | Durable or visible success |
| --- | --- | --- |
| Renter | Rental search → grounded cards/map → Details → Request Viewing | Exactly one saved lead and showing, correct broker, honest renter confirmation |
| Broker/landlord | Sign in → own listings/leads → respond/update | Authorized actor sees and updates only the correct records |
| Event organizer | Create event → ticket tiers → publish | Event and ticket tiers persisted once, prices in correct currency/minor units |
| Ticket buyer | Discover → Details → Stripe **test-mode** checkout → signed webhook → ticket/QR | Actual paid-test transaction, one order/ticket, valid check-in permissions |
| Restaurant voter | Discover → sign in → explicit vote confirmation → submit | Persisted vote/receipt, duplicate and outsider rejection |
| Venue/partner | Register → profile/details → customer inquiry | Correct saved record with owner isolation |
| Super Admin | Authenticated dashboard → inventory/users/events mutation | Audited authorized transaction and correct readback; outsider denied |
| AI Concierge | Intent → grounded retrieval → cards/map → authorized action → refresh | Truthful retrieved records, coherent follow-ups and persisted action where applicable |

**MDE development phase:** Phase A does **not** require owner/agency verification, property/photo paperwork, moderation, publication, partner approvals, listing freshness or rental eligibility as prerequisites for browsing, viewings or booking. Do not convert review/HITL examples into these business gates. Keep authentication, user/tenant isolation, private/test-fixture exclusion, accurate prices/maps, payment consent, server authorization, atomic writes and idempotency. Public-launch Phase B controls require explicit owner authorization.

## Define the smallest journey

Record only what the change touches:

- Actor and initial authenticated/unauthenticated state.
- Input (query, listing/event ID, budget, action).
- Observable result and persisted IDs if writing data.
- Layers crossed, actual authorization boundary and source of truth.
- Happy path, realistic negative/empty cases, retry/partial failure and recovery.
- Desktop and 390px mobile when interaction/layout changed.
- Exact proof command, environment and tested commit SHA.
- Untested boundary = **UNVERIFIED**, not PASS or fabricated receipt.

## MDE verification layers

| Layer | What it proves | Appropriate tool |
| --- | --- | --- |
| Logic/UI component | Validation, rendering and local state | Vitest / component test |
| SQL and authorization | Supabase RPC/RLS, allow/deny, migration replay, transaction integrity | pgTAP and owned fixtures; service-role path tests when relevant |
| Browser | Real navigation, auth, mobile interaction, network failures, visible receipt | Playwright / Chrome DevTools |
| AI/tool contract | Correct tool, schema, context/memory and grounded result across turns | Existing CopilotKit/Mastra deterministic tool and run tests |
| Real integration | Checkout/webhook, broker routing, persisted showing or ticket | Controlled app API + durable database readback; Stripe **test mode** |
| Release | Exact HEAD checked, migrations applied, serving SHA, postdeploy behavior | Required GitHub CI, deployed runtime/smoke |

Use `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:e2e:deterministic`, `npx supabase test db` and `npm run floor` **only where required by changed risk**. Verify names in current `package.json` / CI; do not assume a fixed Playwright port, provider, or preview URL. See [pre-merge-tests.md](pre-merge-tests.md) for test selection.

**Exploratory automation:** Use the existing selected exploratory-browser pilot when appropriate. It supplements, not replaces, repository-owned deterministic checks. Never claim an uninstalled tool is a required gate.

## CopilotKit and Mastra journey

```text
User / page → CopilotKit / AG-UI → authenticated server context
  → existing Mastra agent and registered tool → grounded Supabase retrieval
  → result cards / synchronized map → explicit user action when the product requires it
  → owning server route or atomic RPC → durable store → visible readback
```

Only include layers that actually participate. For agent-only queries without a write, do not fabricate a persisted result. For an action involving payment/voting, preserve required **user confirmation and payment consent**. That is different from Phase A **business approvals**. Independent S4 **engineering/security verification** is a development proof gate, not a user-facing landlord approval.

For each affected agent flow check:

- **Grounding:** Source rows and search constraints (location, monthly budget, amenities, availability) match displayed cards. No invented prices, coordinates, broker authority or photos.
- **Tool and identity:** Correct Mastra agent/tool, supported inputs, server-verified user/tenant context; model cannot supply its own authority.
- **Conversation:** Follow-up questions retain relevant constraints; unknown facts stay unknown; stop, retry, streaming or provider errors have truthful states.
- **Authorization:** Private/internal/test fixtures stay protected from ordinary users; unauthorized writes denied.
- **Persistence:** One request/booking/payment/vote yields one correct result; retry has no duplicate side effect; UI reflects database state after refresh.
- **Safety:** Prompt injection, sensitive-data leakage, and cross-tenant contamination fail safely.

Load the relevant current [Mastra skill](../../mastra/SKILL.md) and [CopilotKit skill](../../copilotkit/SKILL.md) when their code is touched. Do not reference a nonexistent `mastra/references/user-journeys.md` or impose a generic human-approval workflow.

## Risk-specific negative and recovery scenarios

| Journey | Required failure cases when affected |
| --- | --- |
| Rentals | Non-matching budget is not shown as matching; nonexistent location gets no invented pin; pending non-fixture allowed in Phase A; private/test fixture and unrelated broker denied; retry creates no duplicate lead/showing |
| Events | Amount/currency mismatch, duplicate publish, failed webhook, checkout rollback, replay, wrong ticket owner and unauthorized check-in |
| Votes | Login return to same restaurant, duplicate ballot, forged voter identity, missing persisted receipt |
| Agent/chat | Empty retrieval, stale result, dropped follow-up constraint, model/tool failure, lost thread, fabricated action success |
| Admin/partner | Anonymous or other-tenant write, unauthorized role escalation, failed save with success toast, audit gap |

## Completion contract

**System correctness** = UI/auth/API/search and relevant integrations work.
**AI correctness** = tool selection, grounding, state and guardrails work when AI participates.
**State correctness** = frontend, server action and durable record agree when writing.

- Prove the affected claim with the cheapest decisive evidence, then broaden for security/side-effect risk.
- An S4 actor/transaction change needs independent `task-verifier` review; do not self-certify.
- Never create live production fixtures or execute real paid transactions as proof of a docs change.
- CI green is not proof that a feature is deployed or that a user journey succeeded.
- Report **PASS / FAIL / UNVERIFIED / N/A** with command, SHA, environment, and evidence source.
- Only after applicable layers pass, update Linear status and the PR's exact-head evidence.
