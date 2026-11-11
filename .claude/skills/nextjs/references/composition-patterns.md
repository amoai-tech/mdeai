# React composition and state ownership

Use when a React/Next.js task changes reusable component APIs, shared UI state, provider boundaries, compound components, or prop-heavy variants.

This is a curated MDE reference adapted from Vercel's composition-pattern guidance. Apply it to the installed React/Next.js version and the nearest working MDE pattern; do not mechanically copy upstream examples.

## Architecture rules

1. **Prefer composition over boolean modes** — when flags create combinatorial behavior or impossible states, use explicit variants that compose shared primitives.
2. **Use compound components for cohesive complex UI** — share a narrow context when sibling pieces belong to one conceptual component. Do not introduce context for simple prop passing.
3. **Lift state to the lowest common owner** — visual nesting does not determine state ownership. Put state where every reader/action that must coordinate can reach it.
4. **Separate interface from implementation** — reusable UI should consume a typed state/actions contract rather than importing one storage or feature-specific hook.
5. **Prefer children for layout composition** — use render props only when the child must receive values or behavior from the parent.
6. **Make variants explicit** — names such as `RentalResultCard` and `SavedRentalCard` are clearer than one component with unrelated mode flags when the structures materially differ.

## MDE boundaries

- Preserve Server Component boundaries: do not move state or providers client-side unless interactivity requires it.
- URL-backed state stays URL-backed. Do not lift filters into a new client store merely to share them across components.
- Existing domain contexts (for example map selection) remain the owner of their domain state; do not create parallel providers.
- Canonical business truth stays outside presentation components. Composition must not manufacture eligibility, ranking, verification, currency conversion, or requestability.
- Prefer a local provider over global state when only one route/workspace needs the state.

## Review questions

- Is there one clear owner for each mutable state value?
- Can a component variant be understood without decoding multiple boolean combinations?
- Does context expose the smallest useful typed interface?
- Could this remain a Server Component?
- Did the change reduce prop complexity without creating a new global state surface?
- Are provider and component boundaries testable independently?

## Source provenance

Adapt/model only; do not copy wholesale:
- https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns
- Local source reviewed during consolidation: `vercel-composition-patterns/rules/`
