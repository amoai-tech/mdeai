# MDE AI

MDE AI is an AI-native discovery and concierge platform for Medellín. It combines conversational AI, maps, local discovery, bookings, ticketing, rentals, events, venues, restaurants, cafés/nightlife, trips, and partner workflows in one application.

Production: https://www.mdeai.co

## Start here

| Need | Go to |
|---|---|
| Documentation | [`docs/README.md`](docs/README.md) |
| Current documentation audit/index | [`docs/index-docs.md`](docs/index-docs.md) |
| Product documentation | [`docs/01-product/`](docs/01-product/) |
| Architecture | [`docs/02-architecture/`](docs/02-architecture/) |
| Platform and integrations | [`docs/03-platform/`](docs/03-platform/) |
| Domain documentation | [`docs/04-domains/`](docs/04-domains/) |
| Design | [`docs/05-design/`](docs/05-design/) |
| Testing | [`docs/06-testing/`](docs/06-testing/) |
| Operations | [`docs/07-operations/`](docs/07-operations/) |
| Strategy | [`docs/08-strategy/`](docs/08-strategy/) |
| Live work and priorities | [Linear — MDE AI](https://linear.app/amo100/project/mde-ai-bb25cababf6c/issues) |

## Source of truth

Use these sources in this order:

1. **Linear** — live task status, priority, ownership, and execution order.
2. **Merged `main`** — shipped repository truth.
3. **`src/app`** — implemented page and API route truth.
4. **Code, migrations, package manifests, and tests** — implementation details and behavior.
5. **Documentation** — explanation and guidance; docs must follow the sources above when they disagree.

Do not use old task files, roadmap snapshots, stale commit SHAs, or archived documentation as current execution status.

## Product

MDE AI is built around a conversational concierge connected to structured product experiences rather than a standalone chatbot.

Current application areas include:

- AI concierge and chat
- map-based local discovery
- events and event detail flows
- rentals and host/broker workflows
- restaurants, cafés, and nightlife discovery
- venues and venue booking workflows
- trips and saved experiences
- ticket checkout and ticket wallet flows
- partner, sponsor, and business workflows

The repository also contains supporting APIs, agent tools, grounding/search flows, authentication, analytics, testing, and operational tooling.

## Core stack

The versions below are taken from the repository package manifest on this branch.

| Layer | Technology |
|---|---|
| Web app | Next.js `16.2.6`, React `19.2.1`, TypeScript |
| Styling/UI | Tailwind CSS 4, Base UI, shadcn, Lucide |
| AI UI/runtime bridge | CopilotKit `1.55.2`, AG-UI |
| Agent runtime | Mastra beta |
| Default AI model | Gemini `3.5 Flash` via `@ai-sdk/google` |
| Data/auth | Supabase |
| Maps/places | Google Maps via `@vis.gl/react-google-maps`, Google Places |
| Commerce | Medusa SDK where applicable |
| Payments | Stripe-backed application flows |
| Testing | Vitest + Playwright |

> Dependency versions change. Treat `package.json` and the lockfile as authoritative.

## Repository layout

```text
mdeai/
├── src/
│   ├── app/             # Next.js pages, layouts, route handlers and APIs
│   ├── components/      # shared product/UI components
│   ├── hooks/           # application hooks
│   ├── lib/             # domain and integration logic
│   └── mastra/          # agents, tools, model/runtime configuration
├── supabase/            # database migrations and Supabase configuration
├── e2e/                 # Playwright end-to-end tests
├── scripts/             # verification, smoke, audit and maintenance scripts
├── docs/                # product, architecture, platform and domain documentation
├── public/              # static assets
├── package.json
└── README.md
```

## Local development

### Requirements

- Node.js 20 or newer
- npm
- required environment variables in `.env.local`

Install dependencies:

```bash
npm install
```

Run the application and Mastra development runtime together:

```bash
npm run dev
```

Default local services:

```text
Next.js UI     http://localhost:3001
Mastra         http://localhost:4111
```

Run only the UI:

```bash
npm run dev:ui
```

## Verification

Use the repository checks before considering a change complete:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Full verification floor:

```bash
npm run floor
```

Useful focused commands include:

```bash
npm run test:mastra
npm run test:lib
npm run test:api
npm run test:e2e
npm run test:e2e:prod-synthetic
```

See [`docs/06-testing/`](docs/06-testing/) for the testing documentation as it is migrated into the canonical structure.

## Documentation structure

The documentation is being consolidated into:

```text
docs/
├── README.md
├── 01-product/
├── 02-architecture/
├── 03-platform/
├── 04-domains/
├── 05-design/
├── 06-testing/
├── 07-operations/
├── 08-strategy/
└── _archive/
```

Legacy documentation remains in place during the migration so useful history and evidence are not lost. Files are moved, merged, rewritten, or archived only after they are audited.

## Development workflow

- Use a dedicated branch/worktree for scoped work.
- Keep `main` clean and synchronized with `origin/main`.
- Keep PRs focused and reviewable.
- Put live task status in Linear rather than duplicating it in Markdown.
- Verify behavior with tests and runtime evidence, not documentation claims alone.
- Preserve historical evidence before cleanup or archival.

## Project tracking

Live MDE AI work is tracked in Linear:

https://linear.app/amo100/project/mde-ai-bb25cababf6c/issues

Documentation migration work currently follows:

```text
Task 44 · Define Documentation Architecture
Task 45 · Audit Docs Against Current Code
Task 46 · Rewrite Core MDE Documentation
Task 47 · Rewrite Domain Documentation
Task 48 · Consolidate and Archive Legacy Docs
Task 49 · Add Documentation Drift Prevention
```

The sequence above describes the documentation migration only. Linear remains authoritative for each task's actual current status.
