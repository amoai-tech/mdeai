# App Router

Use for pages, layouts, route handlers, request APIs, metadata, proxy/middleware, and Server/Client Component boundaries.

- Inspect the nearest working pattern under `src/app` before introducing a new convention.
- Keep `use client` boundaries narrow; do not move privileged work client-side to bypass framework constraints.
- Authenticate and authorize route-handler/server-action mutations before privileged work.
- Resolve version-sensitive request APIs from the installed Next.js version and official docs.
- Do not add rewrites, middleware/proxy behavior, or forced dynamic rendering as a workaround for an unrelated bug.
- Prefer deterministic framework fixes over compatibility shims when the installed API contract is clear.
