# Source map — where to look before you build

For each area: the **authoritative** source, what to look for in it, and the disposition that is
usually correct. Check the source before writing anything; check this file *only* to find the source.

Rules for this file:

- The `github.com/<org>/<repo>` entry is the ground truth, because it ships the code we actually
  depend on. Docs describe intent; the repository shows behavior.
- Confirm the URL still resolves when you use it, and confirm the version you read matches
  `package.json` (or the pinned CLI). A source read at the wrong version is a wrong source.
- If a link here is dead or has moved, fix it in the same PR that found it.
- `COPY` needs a license-compatible reason and its attribution; our default for any upstream example
  is `ADAPT` or `MODEL`, never `COPY`.

## Supabase (database, auth, RLS, migrations)

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/supabase/supabase | Platform behavior; SQL, RLS, and policy semantics | MODEL |
| https://github.com/supabase/cli | **What the CLI actually does** — e.g. `apps/cli-go/pkg/migration/` decides which migrations `db push` applies | ADAPT |
| https://supabase.com/docs | Guides, RLS patterns, CLI reference | MODEL |
| https://github.com/supabase/agent-skills | Upstream skill we already vendor; check it before writing new Supabase procedure | ADAPT |
| https://www.postgresql.org/docs/current/ | Postgres primitives **first**: window functions, CTEs, `ON CONFLICT`, generated columns, `jsonb` operators | ADAPT |
| https://pgtap.org/documentation.html | pgTAP assertion names for `supabase/tests/database/` | ADAPT |
| https://github.com/citusdata/pg_cron | `cron.schedule` / `cron.unschedule` semantics, named-job overwrite behavior | ADAPT |

## Next.js and Vercel

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/vercel/next.js | Router, caching, and RSC behavior as implemented; `examples/` for working shapes | ADAPT |
| https://nextjs.org/docs | App Router, `use cache`, revalidation, route handlers | MODEL |
| https://vercel.com/docs | Deploy config, environment variables, runtime limits, rollback | REFERENCE ONLY unless configuring |

## CopilotKit and AG-UI

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/CopilotKit/CopilotKit | v2 hooks, runtime wiring, working examples in the monorepo | ADAPT |
| https://docs.copilotkit.ai | Setup, hooks, generative UI, HITL | MODEL |
| https://github.com/ag-ui-protocol/ag-ui | Event types, message schemas, transport | ADAPT |
| https://docs.ag-ui.com | Protocol spec and integration guides | MODEL |

Never mix bare v1 imports with `/v2` imports — check the version in `package.json` first.

## Mastra

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/mastra-ai/mastra | Agent/tool/workflow implementations and tests in `packages/` | ADAPT |
| https://mastra.ai/docs | Concepts, storage, memory, streaming, suspend/resume | MODEL |
| https://github.com/mastra-ai/skills | Upstream skill we already vendor | ADAPT |

## UI and design system

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/shadcn-ui/ui | **Prebuilt components** — prefer `npx shadcn@latest add <component>` over hand-rolling | COPY (via CLI) |
| https://ui.shadcn.com/docs/components | The catalogue of what already exists before you build a new one | COPY (via CLI) |
| https://github.com/mui/base-ui | Unstyled accessible primitives we already install as `@base-ui/react` | ADAPT |
| https://github.com/facebook/react | Hook semantics, `use*` behavior, `Suspense` boundaries | MODEL |
| https://react.dev | Patterns, escape hatches, "you might not need an effect" | MODEL |
| https://github.com/tailwindlabs/tailwindcss | Utility and variant behavior | ADAPT |
| https://tailwindcss.com/docs | Utility reference | MODEL |
| https://github.com/lucide-icons/lucide | Icon names — do not hand-draw SVG when an icon exists | COPY |
| https://github.com/dcastil/tailwind-merge | Class-conflict resolution rules | ADAPT |
| https://github.com/joe-bell/cva | Variant API for component props | ADAPT |
| https://github.com/emilkowalski/sonner | Toasts (already installed) | ADAPT |
| https://github.com/pacocoursey/cmdk | Command palette (already installed) | ADAPT |
| https://github.com/davidjerleke/embla-carousel | Carousels (already installed) | ADAPT |

## Testing

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/vitest-dev/vitest | `vi.mock`, fake timers, coverage config, workspace setup | ADAPT |
| https://vitest.dev/api/ | Exact API shape before assuming | MODEL |
| https://github.com/microsoft/playwright | Locators, auto-waiting, tracing, fixtures | ADAPT |
| https://playwright.dev/docs/best-practices | Locator strategy and flake avoidance | MODEL |
| https://nodejs.org/api/test.html | `node:test` for `scripts/__tests__/*.test.mjs` (no framework) | ADAPT |

## Validation and typing

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://github.com/colinhacks/zod | Schemas, parsing, refinements — `zod` is installed; hand-written guards usually are not needed | ADAPT |
| https://zod.dev | API reference | MODEL |
| https://www.typescriptlang.org/docs/handbook/2/narrowing.html | Narrowing, discriminated unions | MODEL |

## Google Maps Platform

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://developers.google.com/maps/documentation/places/web-service/choose-fields | **Field masks** — required, and cost-bearing | ADAPT |
| https://github.com/visgl/react-google-maps | The React wrapper we already install | COPY |
| https://github.com/googlemaps/js-markerclusterer | Clustering (already installed) | COPY |
| https://developers.google.com/maps/documentation/javascript | Maps JS API, marker config, `mapId` requirements | MODEL |

## Gemini

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://ai.google.dev/gemini-api/docs/models | **Current model IDs** — never assert from memory | REFERENCE ONLY |
| https://ai.google.dev/gemini-api/docs | Structured output, tools, grounding, multimodal | MODEL |
| https://github.com/vercel/ai | The AI SDK Google provider we use | ADAPT |

## Stripe, Cloudinary, Medusa

| Source | Look for | Usual disposition |
| -- | -- | -- |
| https://docs.stripe.com/webhooks | Signature verification and idempotency | ADAPT |
| https://github.com/stripe/stripe-node | Node client behavior we depend on | ADAPT |
| https://docs.stripe.com/api/idempotent_requests | Idempotency keys for retry-safe writes | ADAPT |
| https://cloudinary.com/documentation | Transformations, delivery URLs, upload presets | ADAPT |
| https://github.com/cloudinary-community/next-cloudinary | The Next.js integration | COPY |
| https://github.com/medusajs/medusa | `@medusajs/js-sdk` behavior | ADAPT |
| https://docs.medusajs.com | Store API surface | MODEL |

## Finding a prebuilt answer when this map has no entry

Order matters — stop at the first that answers the question:

1. **`node_modules/<pkg>`** — the installed version is the ground truth for what we can call.
2. **The library's own repository** — `examples/`, `test/`, and `README` show working usage.
3. **Official docs** for that exact version.
4. **The platform's source** (Next.js, Supabase CLI, Postgres) when behavior is in question.
5. **Tutorials and recipes** — useful leads, never final authority. Trace them back to 1–4, and cite
   the primary source in the receipt, not the tutorial.
