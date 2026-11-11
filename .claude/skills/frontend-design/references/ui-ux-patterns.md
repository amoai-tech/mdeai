# MDE UI/UX Patterns

Read this reference when designing or materially reshaping an MDE product screen. It complements the visual-direction guidance in `SKILL.md`; it does not replace the repository design system.

## Source of truth

Before choosing colors, typography, spacing, radii, shadows, icons, or primitives:

1. Read `DESIGN.MD` and the relevant feature/domain documentation.
2. Inspect `src/app/globals.css` for the current semantic tokens.
3. Inspect `src/components/ui/` and existing feature components before proposing new primitives.
4. Preserve established behavior and canonical data contracts; design must not invent product truth.

Use the repository's actual tokens and components. Treat external examples and design-search results as inspiration, not authority.

## Information hierarchy

Give every screen one primary job and one primary action.

Order information by the decision the user must make:
1. identity/context — what am I looking at?
2. decision-critical facts — price, location, availability, status, dates, or equivalent
3. grounded explanation — why is this relevant?
4. supporting detail — amenities, metadata, secondary content
5. next action — a clear CTA matching the next workflow state

Prefer progressive disclosure for secondary or expert detail. Do not make users parse implementation terminology, internal IDs, tool names, ranking scores, or agent handoffs.

## Product and workspace patterns

For discovery workspaces such as rentals, events, restaurants, and places:
- keep active criteria visible and editable;
- keep results and map selection synchronized when a map is present;
- preserve useful context while opening detail;
- distinguish recommended results from other eligible results without manufacturing trust labels;
- keep AI assistance contextual rather than creating a second competing workspace;
- show short, user-facing progress states for meaningful waits.

For detail screens:
- lead with identity, imagery, decision facts, and the primary conversion action;
- group supporting content into predictable sections;
- keep the primary CTA reachable on long desktop and mobile pages;
- preserve return state where practical.

For multi-step commitment flows:
- separate choosing, reviewing, submitting, and confirmation;
- show authoritative values before the irreversible action;
- keep back/cancel routes clear;
- never let visual confidence imply an action succeeded before the backend confirms it.

## Responsive patterns

Design the same journey for mobile and desktop; do not treat mobile as a shrunken desktop.

On mobile:
- put the decision-critical content first;
- collapse secondary panels deliberately;
- keep primary actions reachable without obscuring focused content;
- avoid horizontal scrolling and hover-only disclosure;
- allow content to wrap before truncating meaningful labels;
- account for sticky/fixed UI and dynamic viewport height.

On desktop:
- use available viewport height intentionally for workspace screens;
- let independently useful panels remain visible when the interaction benefits from it;
- avoid arbitrary fixed-width panels when proportional layouts better preserve readability;
- keep text columns readable even when maps or media consume substantial space.

Validate intermediate widths as well as the smallest and largest target sizes.

## Loading, empty, error, and unavailable states

Every important screen or component needs an explicit state model.

Loading:
- preserve layout where possible to avoid content jumps;
- explain long or multi-stage waits in user language;
- never expose chain-of-thought, SQL, tool calls, agent names, embeddings, or similarity scores.

Empty:
- distinguish "nothing exists" from "nothing matches these filters";
- explain the state and provide the most useful recovery action.

Error:
- state what failed in plain language;
- preserve the user's work when safe;
- offer retry, back, edit, or another concrete recovery path.

Unavailable/not actionable:
- keep useful property/event/place information visible when appropriate;
- explain why the primary action is unavailable only when that reason is canonical;
- never manufacture "verified", freshness, availability, or match claims.

Success:
- show success only after the authoritative write succeeds;
- say what happened, what happens next, and where the user can continue.

## Typography

Treat typography as hierarchy first and personality second.

For MDE:
- use the type families and scale already defined by the active design system;
- keep body copy readable at mobile sizes;
- control line length on wide screens;
- use weight, size, spacing, and grouping before adding decorative labels;
- prefer sentence case and plain user-facing language;
- keep prices, statuses, and other decision facts visually scannable;
- do not introduce a new font solely because an external style recommendation suggests one.

## Interaction guidance

Every interactive element should communicate affordance, state, and result.

Design and verify:
- default, hover where relevant, focus, active/pressed, disabled, loading, success, and error states;
- visible keyboard focus and logical focus order;
- touch-friendly targets and spacing;
- accessible names for icon-only controls;
- no color-only meaning;
- reduced-motion behavior;
- safe interruption of animations and async operations.

Motion should explain state change or spatial continuity. Prefer a small number of meaningful transitions over decorative motion everywhere.

## MDE AI surfaces

The AI should feel persistent without exposing orchestration internals.

Show:
- what MDE understood;
- missing hard requirements;
- search/progress status;
- grounded recommendation reasons;
- clear next actions.

Do not show:
- chain-of-thought;
- internal agent or tool names;
- database/RPC details;
- vector scores or ranking weights;
- invented assumptions presented as facts.

When AI proposes a consequential action, give the user an explicit review/approval state before the authoritative mutation.

## Pre-delivery UX check

Before calling a screen complete:
- verify the primary task is obvious without reading every element;
- verify loading, empty, error, unavailable, and success states that apply;
- verify mobile, intermediate, and desktop layouts;
- verify keyboard/focus behavior and accessible labels;
- verify back navigation and relevant state preservation;
- verify the UI consumes canonical truth rather than deriving business rules locally;
- run the repository's web-design/accessibility review and browser verification skills when applicable.

## Provenance

This reference consolidates MDE-relevant patterns formerly covered by the local `ui-ux-pro-max` skill. It intentionally omits the generic style/palette/font/chart catalogs and stack-specific implementation database because those duplicate MDE's established design system and specialist implementation skills.

Upstream inspiration: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
