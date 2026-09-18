# Platform

Shared platform and infrastructure documentation.

Use this area for the current MDE stack such as Next.js, CopilotKit, Mastra, Supabase, Gemini, Maps, Stripe, Cloudinary, and shared runtime integrations.

Document only integrations verified in current code.

## Canonical platform guides

### Task 53 · MDE-AI-PLATFORM-DOCS-001 — CopilotKit + Mastra

- [Platform guide](copilotkit-mastra/README.md) — current MDE runtime architecture, ownership, HITL, persistence, security boundaries, and implementation rules.
- [Official reference pack](copilotkit-mastra/reference-pack.md) — exact CopilotKit/Mastra docs, examples, templates, Studio/CLI lookup order.
- [Technical roadmap](copilotkit-mastra/roadmap.md) — durable capability sequencing; Linear remains live execution truth.

The core rule is:

> Prefer the existing MDE implementation, Mastra Studio/CLI, official primitives, examples, and templates before custom platform code.

Related architecture: [`../02-architecture/system-overview.md`](../02-architecture/system-overview.md).
