# SAN-1341 Playwright Architecture Design

Source of truth: Linear SAN-1341.

Goal: replace the single slow Playwright configuration with explicit deterministic Chromium, selected cross-browser, and serialized production-smoke contracts while preserving MDE business journeys.

Constraints:
- Node 24.21.0 from `.nvmrc`.
- Keep `@playwright/test` and direct `playwright` dependency at the current repo version during this migration.
- Deterministic PR tests must not depend on production data.
- Production smoke remains real, Chromium-only, and serialized.
- No Supabase schema/RLS changes.
- No privileged Supabase credentials in browser state, traces, reports, or source control.
- Migrate the critical journeys first; do not rewrite all 72 specs.

Architecture:
- `local-chromium`: fast deterministic PR contract.
- `cross-browser-*`: selected stable UI contracts on Chromium, Firefox, WebKit.
- `prod-smoke`: existing live production certification with long timeout and one worker.
- Small helpers/fixtures replace catch-all behavior only as critical journeys move.
