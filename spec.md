# MDE AI — Root Specification Contract

**Purpose:** Define *what* a working change must do before an agent changes code. This root file is the reusable specification standard—not a status tracker, a replacement for the [PRD](prd.md), or the specification for every Linear task.

**Start with:** [AGENTS.md](AGENTS.md) → exact verified Linear issue → [PRD](prd.md) / [roadmap](roadmap.md) when product intent or sequence matters → this specification contract → [root implementation playbook](plan.md). For substantial/ambiguous work, fill the existing [task-specific spec template](docs/07-operations/intent-spec-plan/templates/spec.md) and [plan template](docs/07-operations/intent-spec-plan/templates/plan.md) only when useful; do not write duplicate plans for focused fixes.

## 1. Outcome, scope and owner

Every S2–S4 feature spec must answer:

- **Verified issue:** SAN-#### · exact Linear task name, current status, owner, dependencies, linked PR and source SHA.
- **User:** who cannot do what today; distinguish *observed defect*, *planned behavior* and *unverified assumption*.
- **Outcome:** actor → action → visible result → authoritative saved result (if an action writes).
- **Scope / non-goals:** what changes, what stays with another existing issue, what is explicitly not built.
- **Canonical owner:** current UI component, agent/tool, server action/RPC, database record and test. Do not invent new services where an owner exists.
- **Constraints:** pinned package APIs, truthful source data, source attribution, responsive/accessible UI, technical security and Phase A policy.

For S0/S1 changes, the verified Linear acceptance criteria can serve as the spec; no mandatory separate Markdown or approval stage.

## 2. Acceptance criteria — testable, numbered and traceable

Use stable `AC-1`, `AC-2` ... IDs. Each acceptance criterion must state an input, observable behavior and how to prove it. Include only applicable cases:

| ID | Given / when | Required behavior | Decisive proof |
| --- | --- | --- | --- |
| AC-1 | Valid user performs primary journey | Result matches verified source and intended task | Focused UI/API test |
| AC-2 | Initial load, empty or AI unavailable | Deterministic usable UI; no false facts | No-model browser test |
| AC-3 | Invalid, missing, stale or forged record | Honest error/unavailable state; no wrong entity | Negative unit/integration test |
| AC-4 | Retry, refresh, cancellation or concurrent action | Latest human choice preserved; no duplicate writes | Recovery/idempotency test |
| AC-5 | Unauthorized user or another broker | API/RLS denies protected read/write | Authenticated A/B/guest test |
| AC-6 | User uses 390px screen or keyboard | Visible controls and safe navigation without overflow | Playwright/mobile/accessibility test |
| AC-7 | A consequential action succeeds | Canonical service commits once; UI shows actual receipt | Browser → API → database readback |

Do not claim every row is required for a pure documentation or styling task. Explicitly mark **N/A with a reason** rather than fabricating execution evidence.

## 3. CopilotKit component-first contract — current Rentals work

**Scope:** approved Rentals and Broker Dashboard migration tracked in [SAN-1675](https://linear.app/amo100/issue/SAN-1675). Reuse [existing MDE catalog](src/components/copilot/a2ui/mde-ui-catalog.tsx), Mastra agents/tools, Supabase/RPC, Google Maps and current routes. Do **not** make every MDE feature an AI-rendered page.

1. **Catalog before page:** verify the installed `@copilotkit/react-core/v2` and runtime version, `standardUI` component/schema/slot support and current omissions. Extend the shared catalog narrowly; keep typed authorized ID-resolving adapters for Maps/Places, images and uploader where official display components do not implement the full feature.
2. **Working page without model:** use supported deterministic rendering/fallback for initial, loading, empty and error states. Verify the installed version's no-model path; do not assume an AI-generated Surface is a dependable first paint.
3. **Bind real state and interactions:** a visible `Select`, `Slider`, `Form`, `Button` or `Carousel` must have the actual handler, current state, validation, keyboard support and error handling. `useGenerativeUIState` is renderer state; the agent sees selected, permitted state only when explicitly exposed using the supported context contract.
4. **Keep authority on the server:** renderer UI functions handle user events; AI-authorized actions use existing Mastra tools and authenticated server services. A successful visual render is not proof of a persisted save, viewing or booking.
5. **Keep scopes separate:** Concierge and Host use a shared catalog **contract**, but retain distinct existing provider/agent/thread/auth boundaries. Generated IDs and media resolve against authorized results; never allow model-invented prices, coordinates, availability or photo URLs.
6. **Align guidance and tests:** change `src/mastra/lib/generative-ui-context.ts` and catalog/Surface drift tests with any new exposed components; allowlist each named Surface and provide graceful error fallback.
7. **Remove old presentation after parity:** the official catalog should be the approved Rentals UI target, while existing native components may remain a temporary safe baseline. Remove only superseded presentation after real parity; do not remove canonical data, search, map or transaction services.

**Real-world acceptance example:** A renter asks for a furnished two-bedroom apartment in Laureles under COP 3M. The real result ID appears in the catalog card, map marker (only if coordinates exist), Details and viewing review. Filters apply consistently; the request writes **exactly one** lead and showing through the existing backend. With no AI model response, browsing and essential actions remain usable.

## 4. Phase A development and risk boundary

During prelaunch development, **do not impose business eligibility, ownership-document, moderation, rights-paperwork, approval, publication or booking prerequisites**. Do not replace these with a shadow UI/SQL gate. Keep required authentication, private-data isolation/RLS, server-side admin authorization, truthful records, safe payment testing, atomic transactions, idempotency and audit.

For S4 risk (payment, authorization/RLS, secrets, destructive data or irreversible retry), independently verify the actual effect using the existing [task-verifier skill](.claude/skills/task-verifier/SKILL.md); this is technical proof, **not** public-launch certification.

## 5. Implementation handoff

Only after defining the actual issue acceptance, convert these criteria into ordered steps using [plan.md](plan.md). Reference stable `AC-#` IDs in tests, PR summary and [REVIEW.md](REVIEW.md) review findings. Record *live* status, blocker, PR SHA and final proof in the existing Linear issue—not this root contract.

**Official references:** [Standard Catalog](https://docs.copilotkit.ai/generative-ui/components/standard-catalog) · [Catalogs](https://docs.copilotkit.ai/generative-ui/components/catalogs) · [State and actions](https://docs.copilotkit.ai/generative-ui/components/state-and-actions) · [Surfaces](https://docs.copilotkit.ai/generative-ui/components/surfaces) · [MDE component-first Linear owner](https://linear.app/amo100/issue/SAN-1675).
