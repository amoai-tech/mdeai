# MDE AI — CopilotKit + Mastra Forensic Implementation Plan

> Audit date: 2026-10-05 UTC. Repository truth inspected on current main. Scores are MDE product/architecture judgments, not vendor ratings.
>
> Important: this file was requested at this legacy path. The current canonical platform docs are under **docs/03-platform/copilotkit-mastra/**. Treat this plan as the current decision record; do not infer that **docs/copilotkit/** is the canonical docs taxonomy.

## 1. Executive summary

MDE is already using the important CopilotKit + Mastra foundations correctly. The current code is not the old v1 architecture described by several historical tasks and documents.

Current verified package baseline:

| Package | Current MDE version |
| --- | --- |
| @copilotkit/react-core | 1.75.0, using the /v2 API surface |
| @copilotkit/runtime | 1.75.0, using the /v2 API surface |
| @ag-ui/client | 0.0.59 |
| @ag-ui/mastra | 0.2.1-beta.2 |
| @mastra/core | 1.35.0 |
| @mastra/pg | 1.11.0 |
| @mastra/memory | 1.0.1-alpha.1 |
| @mastra/libsql | 1.1.0-alpha.2 |
| @mastra/client-js | 1.19.1 |
| mastra CLI/package | 1.1.0-alpha.3 |
| @ai-sdk/google | 2.0.74 |

The production path already uses:

- CopilotKit v2 provider/runtime APIs and AG-UI.
- Same-origin **/api/copilotkit** with server-derived identity, thread ownership checks, distributed rate limits and a Mastra RequestContext.
- CopilotKit **useAgent** shared state, **useAgentContext**, **useRenderTool**, **useFrontendTool** and **useHumanInTheLoop**.
- Tool rendering for search results, map synchronization and Stop/cancel behavior.
- Saved thread replay and MDE-owned thread navigation.
- Eight registered Mastra agents, four workflows, typed tools, Postgres persistence, thread-scoped memory, workspace/skills and two registered scorers.
- One real suspend/resume workflow for event venue booking.
- A lean AI-run ledger with model/token/cost/error capture.

The biggest core gaps are not “more agents.” They are production reliability and finishing the native features already chosen:

1. finish Mastra storage/security hardening and certification;
2. stop resending browser transcript history before it reaches the runtime;
3. replace the generic “Searching Medellín…” wait state with truthful progress for slow work;
4. consolidate consequential-action approval so existing HITL patterns cover publish/checkout without stale duplicate tasks;
5. add native Mastra trace correlation instead of expanding custom tracing;
6. prove a minimal model-failure policy;
7. make saved evaluation datasets/experiments a release regression gate;
8. add safe resource-scoped preferences across chats only after storage/identity certification.

There is no evidence that MDE currently needs new subagent infrastructure, MCP, a browser agent, Channels, Agent Builder, a custom queue, a second SSE transport, or a second memory system.

### The most important correction

Several old tasks are dangerous if an AI coding agent follows them literally:

- **SAN-737** still tells the implementer to use CopilotKit v1 **useCopilotReadable** even though the title says **useAgentContext**.
- **SAN-739** still tells the implementer to use v1 **useCopilotAction**, but current MDE already uses v2 **useRenderTool** for rental/search cards.
- **SAN-741** still tells the implementer to use v1 **useCoAgent**, but map state is already synchronized through v2 **useAgent** state via the concierge co-agent wrapper.
- **SAN-834** is entirely a v1 running/nodeName design. Current MDE already has **agent.isRunning** plus a thinking indicator, and SAN-609 owns richer progress.
- **`.claude/skills/mastra/references/workflows.md`** still maps HITL to CopilotKit **renderAndWaitForResponse**. That is legacy v1-era terminology, but several repository docs/checklists still use it to describe existing approval behavior. Current runtime source uses v2 **useHumanInTheLoop**. Treat this as migration debt: do not mechanically rewrite a working approval flow; first prove the current hook + respond/approval behavior end-to-end, then update only references proven stale.
- The canonical **`docs/03-platform/copilotkit-mastra/README.md`** on PR base/head still said the CopilotKit audit was broken because `scripts/audit-copilotkit-v2-map.mjs` was missing. That statement was stale: current **`package.json`** maps `audit:copilotkit-v2` to the dependency-cruiser + no-new-v1 audit and runs it from **`floor`**. This PR corrects the README; do not reopen completed SAN-1300 work.
- The 2026-09-20 adoption plan describes identity/thread-authorization defects that are now fixed by completed work. Do not re-open or rebuild those fixes from the historical document.

## 2. Current feature scorecard

Status legend:

- ✅ Already working
- 🟡 Partially implemented
- 🔴 Missing
- 🧪 Measure first
- ⏸ Defer
- ❌ Do not build

### CopilotKit

| Priority | Feature | Current MDE use | Real-world example | Existing task | Status | Value /100 | Effort | Verdict |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
| 1 | CopilotKit v2 + AG-UI runtime | Same-origin v2 provider/runtime; auth, ownership, rate limits and RequestContext preserved | Sofia sends one chat message and the correct Mastra agent streams back through the existing runtime | Upgrade/certification tasks are Done | ✅ | 100 | Done | Keep |
| 2 | Stop/cancel | Current chat stops/detaches an active run before switching conversations | Sofia presses Stop; the old stream cannot bleed into the next chat | Covered by v2 upgrade/certification | ✅ | 98 | Done | Keep |
| 3 | Tool rendering / generative UI | Search tools render cards with v2 useRenderTool | Rental search returns trusted cards instead of raw JSON | SAN-739 is stale | ✅ | 98 | Done | Verify and close/retarget SAN-739 |
| 4 | Shared agent state | useAgent state is used for concierge/host state | Map or host dashboard changes stay synchronized with the agent | SAN-741 is stale | ✅ | 97 | Done | Keep; verify and close/retarget SAN-741 |
| 5 | HITL | Venue booking and event publish already use v2 useHumanInTheLoop | Roberto sees the exact proposed action before a protected backend write | SAN-595, SAN-738, SAN-740 | 🟡 | 97 | M | Consolidate remaining protected actions |
| 6 | Saved chat continuity | Saved thread messages are explicitly replayed and guarded against reconnect races | Roberto opens yesterday’s rental chat and sees the prior transcript | SAN-1389 | ✅ | 96 | Done | Keep |
| 7 | Mobile chat | Certification is in review; keyboard/scroll polish remains | Sofia can type and send normally with the phone keyboard open | SAN-521, SAN-522 | 🟡 | 96 | S-M | Finish before adding novelty UX |
| 8 | Progress/state rendering | Generic thinking indicator exists; meaningful stages do not | “Searching → 8 candidates → Ranking → Ready” | SAN-609, SAN-1032 | 🟡 | 95 | M | Build shared path, then rental copy |
| 9 | Bounded browser history | Server trims concierge; provider has no messageFilter and hostOps still gets browser history | A 30-message chat sends only the new turn while Mastra remembers the rest | SAN-1399 | 🟡 | 94 | S | Build after wire measurement |
| 10 | Page/app context | v2 useAgentContext exists for host focus, host draft and chat filters; not every old task route is proven | On an event page the agent understands the current event without the user repeating it | SAN-737 | 🟡 | 88 | S-M | Rewrite task around current v2 gaps only |
| 11 | Smart suggestions | No live useConfigureSuggestions call | After rental results: “Pet-friendly”, “Under 4M”, “Show map” | SAN-1398 | 🔴 | 84 | S | Build after core reliability |
| 12 | Chat/thread navigation | MDE-owned thread navigation exists; broader UX task remains | The correct saved conversation stays selected | SAN-1088 | 🟡 | 83 | M | Finish, do not switch to Intelligence threads |
| 13 | Multimodal attachments | Not enabled | Upload a rental screenshot and compare it with grounded MDE inventory | SAN-1400 | 🔴 | 76 | M | Advanced/post-MVP |
| 14 | Voice transcription | No transcription service; runtime explicitly denies transcribe | Sofia dictates “quiet 2BR Laureles under 4M” | Full Gemini Live task is canceled | 🔴 | 62 | M | Optional new advanced task; transcription first |
| 15 | CopilotKit Intelligence / managed threads | Intentionally not adopted | — | SAN-1397 documents the decision | ❌ | 25 | H | Do not adopt just to get threads |

### Mastra

| Priority | Feature | Current MDE use | Real-world example | Existing task | Status | Value /100 | Effort | Verdict |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
| 1 | Agents + tools + RequestContext | Eight agents registered; typed tools; server-derived identity passed into RequestContext | Renter and host tools run with the correct user boundary | Existing core work | ✅ | 100 | Done | Keep |
| 2 | Postgres storage | Production uses PostgresStore, max pool 3, idle timeout, disableInit and fail-closed DATABASE_URL | A deploy does not erase the chat | SAN-1303, SAN-1368, SAN-1311 | 🟡 | 100 | M | Finish security/certification, do not rewrite |
| 3 | Thread-scoped working memory | Concierge/rental/event/host agents use thread memory; concierge keeps 10 raw messages | Follow-up “show cheaper ones” still has thread-local context | SAN-548 certifies restart | 🟡 | 96 | S-M | Certify fresh-runtime behavior |
| 4 | Workflows | Four workflows; event booking has real suspend/resume | Admin review pauses and later resumes one booking | SAN-601, SAN-607 | 🟡 | 95 | M | Add retry/compensation only to consequential multi-step paths |
| 5 | Scorers | Faithfulness and grounding scorers registered | Detect unsupported rental claims | SAN-590 and SAN-605 Done; SAN-1061/SAN-611 next | 🟡 | 94 | M | Turn into reproducible release evals |
| 6 | Native observability | Custom ai_runs/token/error telemetry exists; native Mastra observability is not wired in Mastra({}) on current main | Operator jumps from one slow AI turn to its tool/model trace | SAN-1003, SAN-856 | 🟡 | 93 | M | Native trace + lean ledger correlation |
| 7 | Guardrails/processors | TokenLimiter always on; PromptInjectionDetector opt-in | Oversized prompts are bounded; risky prompt guard can be enabled | SAN-396, SAN-598 | 🟡 | 90 | M | Add precise output/PII guards where risk justifies latency |
| 8 | Model failure/fallback | Central Gemini models but no automatic fallback chain in current models.ts | Gemini 429s; rental flow degrades or uses one proven compatible fallback | SAN-1057 | 🔴 | 90 | M | Keep policy minimal; verify installed API first |
| 9 | Resource-scoped preferences | Thread memory only today | Sofia’s “Laureles, under 4M” follows her into a new chat, never Roberto’s | SAN-597, SAN-1024, SAN-610 | 🔴 | 89 | M | Build after storage/identity certification |
| 10 | Golden datasets/experiments | Scorers exist, but canonical dataset/experiment release gate remains backlog | A model/prompt change cannot silently recommend an over-budget rental | SAN-1061, SAN-611 | 🔴 | 89 | M | Core quality gate |
| 11 | Structured output | Tool schemas are typed; evaluation agent still asks for “JSON only”; no need to expose evaluation agent to runtime | Scorer verdicts stay machine-valid without string parsing | SAN-592 canceled; SAN-611 owns typed eval verdict need | 🟡 | 72 | S | Fix only where a consumer needs typed output |
| 12 | Workspace + skills | Global workspace is read-only; write/edit/delete tools disabled | Agent can read governed project knowledge without arbitrary writes | Existing implementation | ✅ | 70 | Done | Keep |
| 13 | Background tasks | Native capability not adopted | Slow enrichment retries without holding the chat turn open | SAN-600 | 🔴 | 60 | M-H | Measure a proven slow job first |
| 14 | Cross-domain retrieval/RAG | Domain search exists; no reason yet for a second generic RAG system | “Rental near salsa and coworking” combines trusted MDE domains | SAN-389 | 🟡 | 58 | H | Advanced; reuse existing indexes first |
| 15 | Durable agents | Workflow snapshots exist; agent harness durability not adopted | A long research run reconnects after a dropped browser connection | No launch-critical owner needed | ⏸ | 45 | H | Defer on current Vercel shape |
| 16 | Observational memory | Not enabled; installed memory package is alpha and already has a known type drift | Long chats are compressed into durable observations | Upgrade/memory tasks first | ⏸ | 40 | H | Defer until package family is coherent |
| 17 | Scheduled workflows | Not adopted in Mastra; MDE already has committed database cron patterns | Nightly enrichment runs automatically | Existing job owners | ⏸ | 35 | M | Use only for a real scheduled AI need |
| 18 | Subagents/network | No production need proven | Concierge delegates research to specialists | None needed | ❌ | 30 | H | Do not add complexity yet |
| 19 | MCP | No MCP client/server in production | Agent queries a governed external tool server | None needed | ⏸ | 25 | H | Add only for a concrete external integration |
| 20 | Browser agent | No browser agent in production | Read a public external listing with a source URL | None needed | ⏸ | 20 | H | Keep external web data non-authoritative |
| 21 | Agent Builder / Channels | Not adopted | Internal agent prototype / Slack agent | None needed | ❌ | 15 | H | Not a launch need |

## 3. Errors, red flags and blockers + fixes

| Problem | Why it can fail | Fix |
| --- | --- | --- |
| Old docs/task bodies mix CopilotKit v1 and v2 | Bare v1 imports still resolve, so an AI agent can write code that compiles but violates MDE’s runtime contract | Application code must use **@copilotkit/react-core/v2** and **@copilotkit/runtime/v2**; keep the release audit |
| SAN-737 body says useCopilotReadable | It is the v1 equivalent of v2 useAgentContext | Rewrite the task body before implementation; preserve existing useAgentContext call sites |
| SAN-739 body says useCopilotAction | Current MDE already renders search tools with v2 useRenderTool | Treat current render code/tests as the baseline; close or narrow the task to a missing card behavior |
| SAN-741 body says useCoAgent and asks for a new mapPins schema | Current map state is already synchronized via v2 agent state plus the existing map contracts; a parallel schema risks drift | Reuse MapUiSync, ToolPinsSync and current contracts; verify behavior, then close/retarget |
| SAN-834 is a v1 running/nodeName task | useCoAgent is forbidden and a generic thinking indicator already exists | Merge the user outcome into SAN-609; do not build SAN-834 as written |
| Mastra workflow reference still maps HITL to renderAndWaitForResponse | The phrase is legacy v1-era terminology, but repository docs/checklists also use it to describe existing approval behavior; blindly replacing it could damage a working contract | Runtime source is already v2 useHumanInTheLoop. Before changing any existing approval flow, prove the current render/respond path and backend authorization end-to-end; then update only stale reference text |
| Canonical platform README carried a stale “audit is broken” claim on the PR base | Current package.json maps audit:copilotkit-v2 to dependency-cruiser + no-new-v1 and floor invokes it | Correct the README in this PR; SAN-1300 remains completed and must not be reopened |
| Sep-20 adoption plan says identity/thread authorization are open defects | SAN-547 and SAN-1358 are Done; current route derives a required resourceId and denies unsafe thread routes | Mark those sections historical/superseded |
| Current Mastra package family is mixed stable + alpha/beta | Memory/core type drift is already suppressed with ts-expect-error | Do not expand advanced memory features before SAN-1302/SAN-1338 certifies a coherent family |
| Native observability docs are newer than MDE’s installed setup | Latest docs show @mastra/observability; current package.json does not install it and Mastra({}) has no observability config | SAN-1003 must verify the version-compatible path before SAN-856 adds correlation |
| “Model fallbacks exist in current docs” does not prove core 1.35 supports the same shape | Latest docs can be ahead of MDE | SAN-1057 must inspect installed types/tagged source before adding a model array |
| useThreads is attractive but wrong for current architecture | CopilotKit thread-management features are tied to Intelligence-managed persistence; MDE intentionally owns thread persistence/authorization | Keep MDE’s /api/threads path and saved-thread replay |
| Current CopilotKit Mastra quickstart uses a remote MastraClient + InMemoryAgentRunner | Copying it would replace MDE’s proven in-process/authenticated runtime shape | Use it only as protocol reference; preserve current route |
| HITL can be mistaken for authorization | A user click only proves intent | Every publish/checkout/booking backend must re-check authenticated user, ownership, current version/state and idempotency |
| Progress can become fake | Invented percentages or candidate counts erode trust | Emit only states/counts the backend really knows; clear on Stop/failure/thread switch |
| SAN-1303 is partly implemented already | Re-applying pool code wastes time and risks changing a working storage contract | Narrow it to remaining Supavisor/SSL/load verification and measured pool behavior |
| SAN-597 and SAN-610 overlap | Two tasks could build two memory paths | SAN-597 owns resource-scoped durable memory infrastructure; SAN-610 owns preference extraction/use on top of it |
| Registered scorers are not the same as a release quality gate | “Scorer exists” does not prove every change is evaluated | SAN-1061 provides native Dataset/Experiment plumbing; SAN-611 supplies the golden corpus + CI gate |

## 4. Existing tasks that need correction

| Task | What it really should do | Correction |
| --- | --- | --- |
| SAN-609 — Show Users Useful Progress While MDE AI Is Working | Shared truthful progress over the existing AG-UI path | Keep. This is the owner of progress transport/state. Do not add SSE/queue/store |
| SAN-1032 — Show Renters Useful Search Progress | Rental wording/journey only | Keep blocked on shared SAN-609 behavior; remove obsolete repo/skill links from old synced body |
| SAN-1399 — Stop Resending Old Chat History | Add one shared provider messageFilter after measuring the actual wire | Keep. Server-side concierge trimming already exists; do not delete it in the same task |
| SAN-1398 — Smart Follow-Up Buttons | v2 useConfigureSuggestions, max 2–3 suggestions | Keep. Verify 1.75.0 installed type before implementation |
| SAN-595 — Require Approval Before Publish/Checkout | Shared product/security approval contract | Keep as parent/contract; backend authorization remains deterministic |
| SAN-738 — Event publish HITL | Current main already has v2 useHumanInTheLoop for preview_and_publish | Re-verify end-to-end and close/retarget; do not reimplement |
| SAN-740 — Booking/payment confirmation | Exact price/details confirmation before money movement | Keep for payment path; approval must bind to current price/version |
| SAN-737 — Page-specific AI context | Extend existing v2 useAgentContext only to proven missing pages | Rewrite body: delete useCopilotReadable/v1 skill references |
| SAN-739 — Generative rental card | Current v2 useRenderTool search render is already present | Verify acceptance against current card renderer; close or narrow to missing card action only |
| SAN-741 — Map/UI synchronization | Current map UI already pushes summary into agent state and tool results update pins | Verify browser journey and close/retarget; delete useCoAgent/v1 schema plan |
| SAN-834 — Running status badge | User wants useful progress, not a v1 nodeName badge | Mark duplicate/covered by SAN-609; preserve existing thinking indicator until replacement |
| SAN-1389 — Saved history replay | Already implemented | Keep Done; use as regression coverage |
| SAN-521 / SAN-522 — Mobile chat | Certify then fix only real keyboard/scroll issues | Finish before attachments/voice; simplify unrelated blockers |
| SAN-1400 — Screenshot/photo input | Add bounded image attachment path using current chat + existing media storage | Keep advanced; image is input evidence, never trusted inventory truth |
| SAN-1189 — Gemini Live voice | Full-duplex Live API concept | Keep canceled. Do not resurrect for simple dictation |
| SAN-1303 — Supabase/Mastra connection reliability | Verify remaining SSL/Supavisor/load behavior | Do not redo max=3, idle timeout or disableInit that current code already has |
| SAN-1368 — Fresh environment storage privacy | Reproducible schema + RLS/grants after exact Mastra initialization | Keep urgent; security foundation |
| SAN-1311 — Storage production certification | Independent PASS/FAIL only | Keep as final gate; never implement fixes inside certification |
| SAN-856 — AI cost/error ledger + trace correlation | Keep ai_runs lean and link it to native Mastra trace | Keep; depends on native observability owner |
| SAN-1003 — Native Mastra observability | Establish the version-compatible native trace path | Keep; do not build a second custom trace tree |
| SAN-396 — Grounded tool-output gate | Stop bad provenance before the model treats it as fact | Keep; reuse typed tool result boundary |
| SAN-597 — Resource-scoped durable preferences | Native resource memory infrastructure and isolation | Keep; infrastructure owner |
| SAN-610 — Preference extraction | Extract only allowlisted durable preferences into SAN-597 memory | Keep dependent on SAN-597; no second store |
| SAN-1061 — Rental evaluation pipeline | Native Dataset → Experiment → Scorer plumbing | Keep |
| SAN-611 — Golden-query evaluation suite | Canonical corpus + reproducible CI regression gate | Keep dependent on SAN-1061; no parallel dataset system |
| SAN-1057 — Rental model failure recovery | Deterministic path → primary → at most one proven fallback → degraded response | Keep. This should own fallback behavior; SAN-1060 stays canceled |
| SAN-601 — Safe checkout workflow | Use workflow only if multi-step orchestration/approval/resume is actually required | Keep conditional; do not wrap a single atomic RPC in workflow ceremony |
| SAN-607 — Workflow compensation | Add compensation only where a partial side effect can really occur | Keep conditional and side-effect-specific |
| SAN-598 — PII/business contact policy | Version-compatible processor/redaction at the right boundary | Keep; do not hide legitimate public business data |
| SAN-599 — Tool output shaping | Reduce model-facing payload without breaking UI result payload | Keep after measuring token/payload cost |
| SAN-594 — Cache/token cost control | Optimize only after observability baseline | Keep after SAN-1003/SAN-856 |
| SAN-600 — Background tasks | Move only proven slow/retryable non-interactive work | Keep advanced; no speculative queue |
| SAN-389 — Cross-domain retrieval | Combine trusted MDE domain sources | Keep advanced; do not add a second generic RAG stack first |

## 5. Missing tasks only

### No missing Core task is required

Every core requirement identified in this audit already has an owner. Correct those tasks instead of creating more.

### Optional Advanced task — only if voice dictation is wanted

**Title:** Let People Dictate a Chat Message With the Microphone

- Why: simple speech-to-text is a smaller, more useful first step than resurrecting a full Gemini Live voice agent.
- Real-world example: Sofia taps the microphone and says “quiet furnished 2BR in Laureles under 4M”; the transcript appears in the normal composer and she can edit it before sending.
- Class: Advanced.
- Value: 62/100.
- Dependencies: mobile chat certification; verify CopilotKit 1.75.0 transcription service/runtime route support; privacy/consent copy.
- Success:
  - microphone appears only when transcription is configured;
  - transcript is editable before send;
  - normal text send path is reused;
  - errors fall back to typing;
  - audio is not retained unless explicitly required and disclosed;
  - one mobile browser test proves permission, transcript, edit and send.

Do not create this task unless product actually wants voice input. Do not reuse SAN-1189’s Gemini Live scope for it.

## 6. Core priority order

| Order | What to do now | Why now | Existing owner | Dependencies / blockers | Real-world success | Score |
| ---: | --- | --- | --- | --- | --- | ---: |
| 1 | Run one exact Mastra package-family GO/NO-GO preflight | Every storage, memory and newer native API decision depends on a coherent version family | SAN-1302 | Isolated worktree/candidate only; do not ship the upgrade here | One candidate proves install, type surface, fresh-runtime chat and suspend/resume compatibility | 100 |
| 2 | Make fresh-environment Mastra storage security reproducible | New Mastra tables are unsafe if vendor initialization can outrun MDE RLS/grants | SAN-1368 | SAN-1302 exact candidate | Fresh environment creates the certified Mastra table set with safe RLS/FORCE RLS/grants | 100 |
| 3 | Finish production Postgres connection hardening | Pool/SSL/Supavisor failure can erase all higher-level reliability wins | SAN-1303 | Exact storage adapter/candidate | Representative concurrency does not exhaust the pool and failures are explicit | 99 |
| 4 | Ship the certified Mastra family with the smallest compatibility diff | Removes current stable/alpha type drift without mixing an upgrade into feature work | SAN-1338 | SAN-1302 GO; preserve CopilotKit and Google provider scope | Existing chat, tools, workflows, scorers and storage behave identically on the certified family | 99 |
| 5 | Prove fresh-runtime chat memory after the candidate upgrade | Persistence needs a real restart proof, not only unit tests | SAN-548 | Steps 1–4 | Deploy/restart occurs; Sofia’s thread still has the right context and another user cannot read it | 99 |
| 6 | Independently certify the exact production storage candidate | Prevent “works on my branch” production claims | SAN-1311 | Steps 1–5 and exact deployed SHA | Exact deployed SHA passes isolation, persistence and resume proof | 99 |
| 7 | Add provider messageFilter | Cheap latency/request-size win; current server workaround proves the need | SAN-1399 | Measure before/after | 30-message thread sends only newest turn; full transcript remains visible | 96 |
| 8 | Add truthful shared progress | Biggest visible latency UX improvement | SAN-609 then SAN-1032 | Existing AG-UI state/tool lifecycle probe | “Searching → 8 candidates → Ranking → Ready” appears before cards/map | 95 |
| 9 | Consolidate protected-action HITL | Publish/checkout are consequential writes | SAN-595 + SAN-738 + SAN-740 | Current backend authorization/idempotency | Human approves exact action; backend reauthorizes and writes once | 97 |
| 10 | Finish mobile chat | Core access path for renters | SAN-521 + SAN-522 | Real-device proof | Keyboard open, scroll/send/Stop all work normally | 96 |
| 11 | Establish native Mastra trace correlation | Needed before tuning latency/cost/cache | SAN-1003 + SAN-856 | Certified Mastra family and version-compatible observability package/API | Operator follows a slow ai_runs row into the exact native trace | 93 |
| 12 | Define minimal model failure policy | Single-model outage is still a reliability gap | SAN-1057 | Verify certified package types | Gemini 429 → proven fallback or clear degraded response, never fake results | 90 |
| 13 | Turn scorers into a release eval gate | Existing scorers currently do not stop regressions by themselves | SAN-1061 + SAN-611 | Native Dataset/Experiment APIs on certified package | Over-budget/fabricated answer fixture fails CI | 89 |
| 14 | Add cross-chat durable preferences | High UX value, but only after storage boundary is certified | SAN-597 → SAN-610 | Storage certification; SAN-1024 policy | Sofia’s budget/neighborhood follow her to a new chat, never another user | 89 |
| 15 | Clean page context task + smart suggestions | Useful UX after correctness/reliability | SAN-737 + SAN-1398 | Current v2 API verification | Agent knows the current page; next-step buttons reduce typing | 84–88 |

## 7. Advanced priority order

| Order | Capability | Owner | Dependency | Real-world success | Score | Verdict |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | Multimodal image/screenshot input | SAN-1400 | Core chat/mobile stable | Renter uploads a screenshot; AI compares it to grounded MDE data | 76 | Build post-core |
| 2 | Tool-output shaping / token control | SAN-599 then SAN-594 | Native observability baseline | Same cards, fewer model tokens and lower latency | 72 | Measure, then optimize |
| 3 | Workflow compensation | SAN-607 | A proven multi-side-effect flow | Mid-checkout failure leaves no half-completed protected action | 70 | Only where needed |
| 4 | Cross-domain retrieval | SAN-389 | Stable per-domain search contracts | One request combines rentals/events/places without inventing data | 58 | Advanced |
| 5 | Background tasks | SAN-600 | Measured slow retryable work | Enrichment retries without blocking chat | 60 | Measure first |
| 6 | Observational memory | Existing upgrade/memory program | Coherent Mastra package family + certified identity | Very long chats stay useful without replaying everything | 40 | Defer |
| 7 | Durable agents | No new task yet | Clear long-running agent need | Reconnect to the same long research run | 45 | Defer |
| 8 | Voice dictation | New only if product asks | Mobile + transcription verification | Speak into composer, edit transcript, send normally | 62 | Optional |
| 9 | Scheduled workflows | Existing domain job owners | A real recurring AI workload | Proven recurring enrichment runs on schedule | 35 | Defer |
| 10 | MCP | None | Concrete governed external system | Agent calls one approved external system with audit/allowlist | 25 | Defer |
| 11 | Browser agent | None | Concrete need + source governance | Read external facts with URL, never convert them into MDE truth automatically | 20 | Defer |
| 12 | Subagents / agent network | None | Single-agent/tool design proves insufficient | Measurable quality/latency win from delegation | 30 | Do not build now |
| 13 | Channels / Agent Builder | None | Separate product decision | — | 15 | Do not build now |

## 8. Best / faster implementation strategy

Use one shared rule for every task:

1. **Freeze current truth.** Record current main SHA and exact package versions.
2. **Trace the real user journey.** Start from browser → CopilotKit → AG-UI → Mastra → tool/workflow → Supabase.
3. **Measure before changing.** For payload, latency, model cost and progress, capture the current baseline.
4. **Use the existing seam.**
   - Copilot UI/state → current v2 provider, useAgent, useAgentContext, useRenderTool, useHumanInTheLoop.
   - Agent orchestration → current Mastra Agent/Tool/Workflow/Memory.
   - Durable truth/auth → current Supabase/RLS/RPC.
5. **Verify the installed API.** Current docs are discovery only. Before implementation, inspect the installed package type/source for MDE’s pinned version.
6. **Write one failing focused regression.**
7. **Make the smallest production change.** Avoid package upgrades inside feature tasks.
8. **Run focused proof first, then the existing release floor.**
9. **Use a real browser for visible behavior** such as progress, Stop, saved history, HITL and mobile keyboard behavior.
10. **Update or close stale Linear tasks immediately after proof** so the next coding agent does not repeat the work.

### Parallel work that is actually safe

These tracks can run independently once storage changes are not touching the same branch:

- CopilotKit messageFilter measurement/implementation.
- Progress UX transport probe.
- Native observability research/probe.
- Eval dataset inventory.
- Mobile browser certification.

Do not parallelize multiple tasks that all change the runtime route, Mastra package family or storage schema.

## 9. Production-ready success checklist

### Version/architecture

- [ ] Exact CopilotKit/Mastra package matrix recorded from the implementation checkout.
- [ ] No bare v1 CopilotKit application imports.
- [ ] No feature task upgrades CopilotKit/Mastra opportunistically.
- [ ] Same-origin runtime, auth, rate limits, RequestContext and agent allowlist remain intact.

### Chat/UX

- [ ] Saved thread replay still works.
- [ ] New Chat creates an isolated thread.
- [ ] Stop/cancel cannot leak an old run into a new thread.
- [ ] messageFilter keeps the visible transcript but bounds outbound history.
- [ ] Tool-call/result pairs and HITL remain valid after filtering.
- [ ] Progress is truthful, clears on failure/Stop/thread switch and never fabricates percentages/counts.
- [ ] Mobile keyboard, scroll, send and Stop are proven on a phone-sized viewport.

### Security/data

- [ ] Thread/resource identity is server-derived.
- [ ] User A cannot read/write User B’s threads or durable preferences.
- [ ] Fresh Mastra tables receive required RLS/FORCE RLS/grants reproducibly.
- [ ] No service-role credential reaches the browser.
- [ ] Human approval is followed by backend authorization, version/state validation and idempotency.
- [ ] Reject/cancel paths write nothing.

### Reliability

- [ ] Fresh runtime/deploy preserves intended memory.
- [ ] Postgres pool behavior is measured under representative concurrency.
- [ ] Model timeout/429/malformed output/total failure each has deterministic behavior.
- [ ] No model failure can create an unintended mutation.
- [ ] Consequential workflows prove retry/resume produces exactly one side effect.

### Quality/observability

- [ ] Native trace path is version-compatible and correlated with the lean ai_runs record.
- [ ] Sensitive content is not duplicated into trace/ledger data.
- [ ] Faithfulness and grounding scorers run against a canonical versioned dataset.
- [ ] A deliberately bad answer fails the release evaluation.
- [ ] Cache/token/output-shaping work happens only after baseline measurement.

### Completion

- [ ] Focused unit/integration tests pass.
- [ ] Relevant Playwright/browser journey passes.
- [ ] Security/isolation negative tests pass where applicable.
- [ ] npm run floor passes on the exact PR head.
- [ ] Linear task text matches the architecture actually shipped.

## 10. Official reference URLs — exactly how to use them

### Material evidence receipts

These are the sources that materially changed recommendations in this plan. Repository source and installed package versions remain authoritative when latest vendor docs differ.

| Evidence | Exact source / section | Decision informed | Version / commit inspected |
| --- | --- | --- | --- |
| MDE package contract | `package.json` — CopilotKit/Mastra versions; `audit:copilotkit-v2`; `floor` | The CopilotKit audit is active; do not reopen SAN-1300. Latest docs never override MDE's installed API surface. | PR pre-fix head `ddfb42ec51fde515f69ce5d308bb08364e948ab1`; CopilotKit 1.75.0; `@mastra/core` 1.35.0 |
| MDE current HITL source | `src/components/host/host-event-copilot-bridge.tsx` — `useHumanInTheLoop` registration for `preview_and_publish` | Existing event-publish UI is already on the v2 hook; verify behavior before retargeting SAN-738 or rewriting approval docs. | `ddfb42ec51fde515f69ce5d308bb08364e948ab1` |
| MDE legacy/compatibility references | `.claude/skills/mastra/references/workflows.md`, `checklist.md`, UI-verification docs | `renderAndWaitForResponse` references are migration debt, not permission to mechanically replace an existing tested flow. | `ddfb42ec51fde515f69ce5d308bb08364e948ab1` |
| CopilotKit v2 HITL | https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop — import + render/respond contract | Use `@copilotkit/react-core/v2` `useHumanInTheLoop` for new/current v2 approval UI; a click is still not backend authorization. | Current official docs inspected 2026-10-05; installed CopilotKit 1.75.0 must remain the compile-time authority |
| CopilotKit message history | https://docs.copilotkit.ai/backend/message-history — `messageFilter` | SAN-1399 should measure first, then use the provider filter to trim outbound history without deleting the visible transcript; tool-call/result repair stays CopilotKit-owned. | Current official docs inspected 2026-10-05; installed CopilotKit 1.75.0 must be verified before implementation |
| Mastra workflow HITL | https://mastra.ai/docs/workflows/human-in-the-loop and https://mastra.ai/docs/workflows/suspend-and-resume — suspend/resume schemas and run resume | Keep durable workflow suspension separate from CopilotKit's frontend approval renderer; do not turn frontend intent into authorization. | Current official docs inspected 2026-10-05; installed `@mastra/core` 1.35.0 remains authoritative |
| Mastra model fallback | https://mastra.ai/models — model fallback capability | SAN-1057 owns one minimal fallback policy; latest syntax is capability discovery only until 1.35.0 installed types/source prove compatibility. | Current official docs inspected 2026-10-05; installed `@mastra/core` 1.35.0 |
| Mastra observability | https://mastra.ai/docs/observability/overview — native tracing/observability | SAN-1003 must establish a version-compatible native trace path before SAN-856 correlates it to `ai_runs`; do not build a second custom trace tree. | Current official docs inspected 2026-10-05; no `@mastra/observability` package on inspected MDE head |

### Reference catalog

| Reference | URL | Use for MDE | Do not use it for |
| --- | --- | --- | --- |
| CopilotKit + Mastra | https://docs.copilotkit.ai/mastra | Current capability map and AG-UI integration concepts | Replacing MDE’s in-process/authenticated runtime with the sample remote runtime |
| CopilotKit v2 reference | https://docs.copilotkit.ai/reference | Exact current hook names; then verify installed 1.75.0 types | Copying bare v1 imports |
| Shared state | https://docs.copilotkit.ai/shared-state | useAgent state, progress/intermediate UI and bidirectional app/agent state | Creating a second state/event bus |
| Tool rendering | https://docs.copilotkit.ai/generative-ui/tool-rendering | useRenderTool and default tool-render behavior | Reintroducing useCopilotAction |
| Agent context | https://docs.copilotkit.ai/reference/v2/hooks/useAgentContext | v2 replacement for useCopilotReadable | Copying stale SAN-737 body |
| HITL | https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop | Interactive frontend approval/tool UI | Treating the click as backend authorization |
| Message history | https://docs.copilotkit.ai/backend/message-history | messageFilter semantics and tool-pair repair | Replacing Mastra memory or visible chat history |
| Suggestions | https://docs.copilotkit.ai/reference/v2/hooks/useConfigureSuggestions | Native quick follow-up buttons | Building a custom suggestion backend before testing native support |
| Attachments | https://docs.copilotkit.ai/multimodal-attachments | Attachment config, MIME/size limits and custom production upload | Sending large production files inline by default |
| Voice | https://docs.copilotkit.ai/voice | Current transcription UX/capability check | Assuming it provides a full Gemini Live duplex agent |
| CopilotKit source | https://github.com/CopilotKit/CopilotKit | Exact v1.75.0 source/tag and official Mastra/canvas examples | Copying latest-main wiring without a version check |
| CopilotKit Mastra example | https://github.com/CopilotKit/CopilotKit/tree/main/examples/integrations/mastra | Compare protocol integration patterns | Replacing MDE auth/RLS/runtime topology wholesale |
| CopilotKit Mastra canvas | https://github.com/CopilotKit/CopilotKit/tree/main/examples/canvas/mastra | Shared-state UI patterns | Adding a second runtime |
| CopilotKit generative UI examples | https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/generative-ui | Card/tool UI patterns | Rebuilding existing MDE card components |
| Mastra docs | https://mastra.ai/docs | Discover current framework capabilities | Assuming latest signatures match core 1.35.0 |
| Mastra source | https://github.com/mastra-ai/mastra | Verify exact version/tag source when installed docs/types are insufficient | Copying current main over pinned packages |
| Working memory | https://mastra.ai/docs/memory/working-memory | Scope/lifetime concepts; compare with installed alpha memory types | Enabling observational memory before package/identity certification |
| Evals | https://mastra.ai/docs/evals/overview | Native datasets/experiments/scorers design | Creating a second MDE eval database/runner |
| Observability | https://mastra.ai/docs/observability/overview | Native traces/logs/metrics/score correlation design | Duplicating every span into ai_runs |
| Workflow error handling | https://mastra.ai/docs/workflows/error-handling | Retry/compensation/restart patterns | Wrapping simple atomic tools in unnecessary workflows |
| Workflow HITL | https://mastra.ai/docs/workflows/human-in-the-loop | Suspend/resume semantics | Client-side authorization |
| Durable agents | https://mastra.ai/docs/harness/durable-agents | Evaluate future reconnectable long-running agents | Launch-critical infrastructure without a proven need |
| Subagents | https://mastra.ai/docs/subagents | Evaluate delegation after single-agent limits are measured | Adding agents because demos look impressive |
| MCP | https://mastra.ai/docs/connections/mcp | Governed external tool integration when a concrete system requires it | Replacing MDE’s normal internal tool calls |
| Models / fallbacks | https://mastra.ai/models | Discover fallback capability and provider support | Assuming the latest fallback signature exists in core 1.35.0 |
| Mastra official examples | https://github.com/mastra-ai/mastra/tree/main/examples | Search for a native pattern before custom code | Copying a different deployment architecture wholesale |

## Final recommendation

Treat the next milestone as **reliability + transport efficiency + truthful UX**, not an “agent capability” expansion.

The fastest safe sequence is:

**Mastra compatibility preflight → fresh-environment security → Postgres hardening → certified Mastra upgrade → fresh-runtime memory proof → final storage certification → messageFilter → progress → protected-action HITL → mobile → native trace correlation → model failure policy → eval gate → cross-chat preferences → suggestions → attachments.**

Everything after that should be pulled by a measured user problem. MDE already has enough agent infrastructure to ship a strong product; the value now comes from making the current system reliable, understandable and hard to regress.
