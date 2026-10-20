---
name: openmuse
description: >-
  Use when adapting OpenMuse-inspired MDE AI conversation experiences: chat
  composer send/stop, draft retention, thread/queue behavior, streaming status,
  grounded result cards, chat-synchronized maps, or mobile chat layouts.
  Guide the smallest change to existing CopilotKit v2 UI, not an OpenMuse install.
---

# OpenMuse patterns for MDE

## Ownership and limits

Guide **chat/search/map/mobile interaction patterns** only. A known CopilotKit API
or transport bug belongs to [copilotkit](../copilotkit/SKILL.md); agent tools,
memory and workflows belong to [mastra](../mastra/SKILL.md). Domain policies and
SQL belong to [real-estate](../real-estate/SKILL.md),
[maps](../maps/SKILL.md), or [supabase](../supabase/SKILL.md).
An explicit product issue owns feature implementation; this skill does not
authorize unrelated feature changes.

MDE stays Next.js + CopilotKit v2/AG-UI + Mastra + Supabase. **Do not install
OpenMuse**, copy React Native components, add a parallel runtime/thread store,
or fabricate apartment coordinates, prices, sources, photos, or availability.

## Procedure

1. Verify the current issue, checkout/PR base and actual running user path.
   Read MDE's current chat, card and map implementations before comparing code.
2. Read [OpenMuse source map](references/source-map.md) for the **specific**
   behavior and exact upstream file. Compare its reviewed SHA with upstream;
   never treat floating `main` as installed-version proof.
3. Choose **reuse → configure → adapt**. Preserve the existing same-origin
   `/api/copilotkit` route, CopilotKit v2 hooks, Mastra tool-map names,
   saved threads, rate limits and user-context/tenant boundaries.
4. Model source-validated loading, running/stopped, empty, error and success
   cards. Keep unsent draft on stop/retry, explain queued vs durable work, and
   place map pins only for actually grounded coordinates.
5. Make the smallest change *only if the requested task owns that feature*.
   Test stream/stop/retry/refresh, source/card/map consistency and 390px mobile.
6. Report files changed, actual observed result, errors, tests and missing
   evidence. Never claim that reading the upstream example proves MDE works.

## Example

"Stop clears my apartment-search draft on mobile" → inspect the existing MDE
composer and thread state; model OpenMuse's stop/preserved-draft behavior;
fix only the real failing boundary; verify in a browser at 390px.

"Create a PostGIS distance index" → **not this skill**; use supabase/maps.

## References and checks

- [Source-to-destination map](references/source-map.md), loaded only for
  relevant OpenMuse behavior.
- [Behavior probes](evals/evals.json) and
  [Trigger / near-miss probes](evals/trigger-evals.json).
- Confirm results via targeted tests; `npm run check:skills` only proves
  skill layout, **not** frontend behavior or correct automatic triggering.
