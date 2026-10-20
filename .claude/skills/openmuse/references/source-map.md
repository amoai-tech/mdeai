# OpenMuse → MDE source map (SAN-1554)

**Reference status:** OpenMuse is a **source of interaction patterns**, not an
installed runtime. SAN-1551's [upstream tracking PR #426](https://github.com/amoai-tech/mdeai/pull/426)
records reviewed reference commit
[`1ac68f3909f2478ab6280883f1ab5ea65eb5719d`](https://github.com/CopilotKit/openmuse/commit/1ac68f3909f2478ab6280883f1ab5ea65eb5719d).
Confirm its actual merged status and current source before acting.

- **REFERENCE ONLY:** https://github.com/CopilotKit/openmuse
  → upstream scope, version and license; destination *this map*.
  Verify git SHA and comparison; never install repo as a package.
- **MODEL:** https://github.com/CopilotKit/openmuse/blob/main/docs/EXPERIENCE.md
  → composer send/stop, queue, retained draft, scroll, status and mobile.
  Destination: `src/components/chat/concierge-copilot-chat-view.tsx`,
  `src/components/chat/chat-center-panel.tsx`. Verify stop/queue/retry/
  refresh and 390px UI with Playwright before claiming parity.
- **MODEL / ADAPT behavior only:** https://github.com/CopilotKit/openmuse/blob/main/apps/mobile/src/chat.tsx
  → read current event handling and thread state; destination same chat files.
  Do **not** copy React Native imports or mount a second thread/provider.
  Verify installed `@copilotkit/react-core/v2` hooks, same-origin runtime and
  actual before/after browser behavior.
- **MODEL:** https://github.com/CopilotKit/openmuse/blob/main/apps/mobile/src/search-tool-card.tsx
  → parse real search result, validate source URLs, distinguish loading,
  stopped, error and empty from actual sourced results.
  Destination: `src/components/copilot/search-tool-renders.tsx` and existing
  search/map renderers. Verify no invented links/pins or unsourced assertions.
- **MDE authoritative:** `src/mastra/index.ts`, `src/app/api/copilotkit/[[...path]]/route.ts`;
  domain maps + apartment RPCs retain existing auth/tenant/coordinate truth.
  A runtime/map/business logic task belongs to the corresponding domain owner.

Every adoption uses **source file → concrete gap → smallest MDE target →
test command + real browser result**. This skill PR changes no runtime.
