# MDE AI

AI-first discovery, planning, booking, and local-commerce platform for Medellín.

Production: https://www.mdeai.co/  
Repository: https://github.com/amoai-tech/mdeai  
Linear project: https://linear.app/amo100/project/mde-ai-bb25cababf6c

## Start here

- [Documentation index](docs/INDEX.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current route inventory](sitemap.md)
- [Product requirements](prd.md)
- [Design system](DESIGN.MD)
- [Skills index](index-skills.md)

For live task status, priorities, and execution order, use the **MDE AI Linear project** rather than old markdown task snapshots.

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 16.2.6 · React 19.2.1 · TypeScript · Tailwind CSS 4 |
| AI UI | CopilotKit 1.55.2 |
| Agent runtime | Mastra + AG-UI |
| Models | Gemini through `@ai-sdk/google` |
| Data/Auth | Supabase |
| Maps/Places | Google Maps · `@vis.gl/react-google-maps` |
| Payments | Stripe |
| Testing | Vitest · Playwright |

## Product surfaces

The current application includes:

- AI concierge and map experience
- rentals browse + rental details
- restaurants, cafés, nightlife, and venues
- events discovery, event details, ticket checkout, and ticket wallet
- host event workflows, analytics, and rental-host surfaces
- partner signup and activation surfaces
- internal event-booking operations

See [`sitemap.md`](sitemap.md) for the source-backed page and API inventory generated from `src/app`.

## Source-of-truth rules

When sources disagree:

1. **Code, tests, and migrations** define implementation truth.
2. **`src/app`** defines Next.js route truth.
3. **Linear — MDE AI** defines live task status and priority.
4. Canonical docs explain architecture, product intent, and operating rules.
5. Historical status snapshots are reference material only.

See [`docs/INDEX.md`](docs/INDEX.md) for the documentation lifecycle and stale-doc cleanup map.

## Local development

Requirements:

- Node.js 20+
- npm
- required environment variables in `.env.local`

Install and run:

```bash
npm install
npm run dev
```

Development services:

- Next.js UI: `http://localhost:3001`
- Mastra dev server: port `4111`

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run floor
npm run test:e2e
```

`npm run floor` runs lint, typecheck, production build, Vitest, the Mastra check, and the critical npm-audit gate.

## Repository layout

```text
src/
├── app/          Next.js App Router pages and route handlers
├── components/   Product and shared UI
├── lib/          Application/domain helpers
├── mastra/       Agents, workflows, tools, and AI runtime
└── platform/     Shared platform contracts and cross-vertical infrastructure

docs/             Architecture, testing, design, evidence, and historical docs
plan/             Product/technical planning and PRD material
supabase/         Database migrations and edge functions
scripts/          Verification, smoke, audit, and maintenance scripts
e2e/              Playwright journeys and release gates
```

## Documentation policy

Do not maintain a second task tracker in Markdown.

- Current work → Linear
- Current routes → `src/app` + `sitemap.md`
- Current architecture → canonical docs linked from `docs/INDEX.md`
- Superseded status reports → archive, do not present as current truth

## License

MIT.
