# OpenMuse → MDE Concierge interaction (SAN-1554 / SAN-609 / SAN-1559)

**Pinned, reviewed reference:** https://github.com/CopilotKit/openmuse/commit/1ac68f3909f2478ab6280883f1ab5ea65eb5719d
Recorded by https://github.com/amoai-tech/mdeai/pull/426 . This is
a source-pattern baseline, NOT an installed OpenMuse runtime. Compare upstream
drift intentionally; never track floating main by default.

## Source → behavior → MDE destination → proof

1. **REFERENCE ONLY** https://github.com/CopilotKit/openmuse
   → identify upstream license, scope and pinned revision;
   destination this source map and SAN-1551. Verify reviewed SHA and no
   dependency/app installation.
2. **MODEL** https://github.com/CopilotKit/openmuse/blob/1ac68f3909f2478ab6280883f1ab5ea65eb5719d/docs/EXPERIENCE.md
   → one composer, retained draft, Stop, visible follow-up queue and durable
   tasks distinct from browser-held messages. Destinations
   src/components/chat/concierge-copilot-chat-view.tsx and
   src/components/chat/chat-center-panel.tsx; SAN-1559 fast-path hooks.
   Verify second concurrent prompt is processed/queued/visible (never dropped),
   Stop draft intact and 390px usable.
3. **MODEL ONLY** https://github.com/CopilotKit/openmuse/blob/1ac68f3909f2478ab6280883f1ab5ea65eb5719d/apps/mobile/src/chat.tsx
   → current chat/queue/mobile UX; destination existing Next.js chat components,
   **not** React Native imports/provider. Verify mounted thread ownership,
   navigation, keyboard, stop/retry and no duplicate chat runtime.
4. **MODEL** https://github.com/CopilotKit/openmuse/blob/1ac68f3909f2478ab6280883f1ab5ea65eb5719d/apps/mobile/src/search-tool-card.tsx
   → sourced result parsing and empty/loading/error. Destination
   src/components/copilot/search-tool-renders.tsx and existing map sync.
   Verify no invented URL, coordinates, count, listing availability or pin.
5. **ADAPT MDE CURRENT RUN EVENTS**, NOT OpenMuse timing: source
   https://github.com/CopilotKit/openmuse/blob/1ac68f3909f2478ab6280883f1ab5ea65eb5719d/docs/EXPERIENCE.md
   → model truthful activity statuses, destination
   src/components/chat/chat-workflow-context.tsx,
   src/components/chat/workflow-progress-strip.tsx,
   src/platform/copilot/workflow-steps.ts.
   Current MDE elapsedMs/900 is NOT proof a stage finished. Check actual
   installed CopilotKit v2 status/tool fields before changing code.
   Verify pending 10s stays pending, tool error visible, thread/run isolation.
6. **MODEL only** above docs/source result handling → SAN-1407/SAN-1429:
   destinations src/hooks/use-event-search-fast-path.ts,
   src/hooks/use-restaurant-search-fast-path.ts,
   src/hooks/use-grounded-search-fast-path.ts and
   src/components/copilot/search-tool-renders.tsx. Test delayed earlier
   search and virtualization re-mount never overwrite newest map result.
7. **MDE AUTHORITY (not upstream)** src/mastra/index.ts,
   src/app/api/copilotkit/[[...path]]/route.ts and domain Supabase/map tools
   own users, threads, searches, eligibility rules and real coordinates.
   SAN-737 adds selected-page hints only; server verifies all privileged data.
   Verify selected apartment A→B→clear and tenant denial.

Only make a change requested by the existing SAN owner. No OpenMuse app install,
parallel runtime, React Native, fake map data or development business gates.
