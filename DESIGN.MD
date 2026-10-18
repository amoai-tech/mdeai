# DESIGN.MD — MDE AI Design System and UI/UX Guide

> Updated 2026-10-17 · **Prelaunch development (Phase A)** · Next.js 16 / React 19 / Tailwind v4 / shadcn/ui / CopilotKit v2
>
> **Status:** This guide distinguishes **CURRENT (verified in repository code)** from **TARGET (recommended design standard)**. A target is not a claim that the live UI has passed visual, accessibility, or user-journey testing.

## How this guide is governed

- `AGENTS.md` is the repository-wide policy, including the development/launch separation. Actual design tokens live in `src/app/globals.css`; existing UI primitives live in `src/components/ui/`. Current routes/components own their implemented behavior.
- Use `.claude/skills/frontend-design/SKILL.md` and its `references/ui-ux-patterns.md` for UI work; `tasks/SKILL.md` for PR execution. Verify rather than copy outdated screen inventories or proposed component names.
- Reuse the existing Next.js application, UI components, Supabase data, CopilotKit/Mastra tools, maps and real action paths. No second search engine, booking flow, component library, or business-policy filter.
- **Phase A:** Business approval, verification, ownership/photo paperwork, rental eligibility, publication and viewing/booking certification **must not block development workflows**. Preserve technical safeguards: authentication, server-side authorization, RLS/private-data isolation, audit trails, integrity, idempotency, truthful provenance, and safe payment testing.
- **Phase B** real-world verification and public-launch certification must be explicitly initiated by the product owner; do not activate these prerequisites based on deployment URL or `NODE_ENV`.

## 1. Product and visual identity

**MDE should feel premium, sophisticated and locally knowledgeable.** Think beautiful Medellín editorial imagery, restrained slate/teal/warm accent, intelligible content hierarchy, grounded recommendations, responsive maps and effortless actions—not a generic SaaS dashboard, a black-and-gold “luxury” template, or another brand's copy.

**Experience principles**

1. **Place first:** identity, relevant photograph, location and decision facts appear before metadata.
2. **One primary action:** Details, Schedule viewing, Directions, Reserve or Buy tickets according to the real workflow.
3. **AI with evidence:** a relevant result, grounded reason where available, map and authorized action; never invented scores or status.
4. **Progressive disclosure:** supporting features in details rather than ten badges on a card.
5. **Complete mobile journey:** the same useful search, details, action and persisted confirmation as desktop.

**CURRENT:** `src/app/page.tsx` is a dedicated home/discovery surface. `/chat` is the AI workspace. Standalone discovery routes including `/restaurants`, `/rentals` and `/events` coexist with chat. **TARGET:** Connect these entry points with consistent cards, navigation, visual hierarchy and contextual AI. Do not prohibit browse pages.

## 2. Color tokens and theming

**CURRENT source of truth:** `src/app/globals.css` defines semantic OKLCH CSS variables and Tailwind mappings. Use `bg-background`, `bg-card`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `border-border` and the shared primitives instead of hardcoded color literals.

| Token | Current light `:root` | Current explicit `.dark` |
| --- | --- | --- |
| `--background` | `oklch(0.985 0.002 247)` | `oklch(0.208 0.042 265)` |
| `--foreground` | `oklch(0.208 0.042 265)` | `oklch(0.985 0.002 247)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.279 0.041 260)` |
| `--primary` | `oklch(0.508 0.118 175)` | `oklch(0.696 0.17 175)` |
| `--accent` | `oklch(0.795 0.184 86)` | `oklch(0.795 0.184 86)` |
| `--muted-foreground` | `oklch(0.554 0.046 257)` | `oklch(0.704 0.04 256)` |
| `--border` | `oklch(0.929 0.013 255)` | `oklch(1 0 0 / 10%)` |
| `--ring` | `oklch(0.508 0.118 175)` | `oklch(0.696 0.17 175)` |

Other actual variables include `--background-elevated`, `--secondary`, `--success`, `--destructive`, `--input`, and sidebar/popover pairs.

**CURRENT theme behavior:** root values are light, `prefers-color-scheme: dark` overrides selected values, and `.dark` supplies explicit dark values. Do not document dark-only behavior or assume a theme toggle is verified. Check provider/browser interactions before changing the implementation.

**Corrections:** Old names `--foreground-subtle`, `--foreground-muted`, `--background-overlay` and `--map-pin-rental/event/restaurant/cafe` are **not** implemented tokens in this stylesheet. Remove them from code examples. New semantic tokens must be added to CSS and verified in light/dark mode in the same UI implementation PR.

**TARGET palette:** Midnight/slate for selective premium surfaces, porcelain/off-white for calm reading, existing MDE teal for primary actions, mist neutrals and sparing warm-gold highlights. These are conceptual roles, **not implemented hex/tokens**. Always check readable contrast in both themes.

## 3. Typography and language

**CURRENT:** `globals.css` uses system sans for `--font-sans` and `--font-heading`, platform monospace for `--font-mono`, and intentionally maps `--font-serif` to sans. The June draft's mandatory Geist stack does not match current CSS; don't introduce a new font package just for the guide.

| Purpose | TARGET starting point |
| --- | --- |
| Hero/page heading | Responsive `text-3xl`–`text-5xl`; concise, intentional weight |
| Section heading | `text-xl`–`text-2xl` |
| Card title | `text-base` / `text-lg`, `font-semibold` |
| Body and main controls | 16px or larger with comfortable line-height |
| Supporting labels | Around 14px; meaningful facts must remain legible |
| Minor metadata | 12px sparingly, with sufficient contrast |
| Prices/numbers | Clear currency/units; tabular numerals as useful, mono optional |

Keep long prose within readable measures (~60–75 characters), let card titles wrap and use sentence case. No decorative uppercasing, excessive italics, or 10px text for critical facts. Format actual COP amounts correctly and never guess the period, availability, fees or source. Write translatable text; don't ban Spanish because a 2026 plan deferred it.

## 4. Cards, components and media

**CURRENT owners**

| Element | Reuse |
| --- | --- |
| UI primitives | `src/components/ui/` |
| Card shell | `src/components/browse/venue-card-shell.tsx` |
| Rental result card | `src/components/copilot/rental-card.tsx` |
| Restaurant result card | `src/components/copilot/restaurant-card.tsx` |
| Concierge shell | `src/components/chat/geo-chat-shell.tsx` |
| Responsive columns | `src/components/chat/chat-canvas.tsx` |
| Mobile map sheet | `src/components/chat/map-mobile-sheet.tsx` |
| Nav rail/drawer | `src/components/chat/chat-nav-rail.tsx` / `chat-nav-drawer.tsx` |

**TARGET card order:** photo or neutral fallback → name and neighborhood → actual price/date/bedrooms/cuisine/rating when supplied → optional *grounded* relevance → one prominent CTA → quieter secondary action/source.

**Media standards**

- Use consistent 4:3 browse imagery and appropriate 16:9 editorial heroes when available; crop thoughtfully and maintain aspect ratio.
- Only use lawfully usable images; preserve provenance and alt text. Decorative images may have empty alt.
- **A missing photo must not hide a valid result.** Show an intentional non-deceptive fallback. A skeleton is for loading, not for permanently missing media.
- Reuse the app's existing media strategy and configured Next.js image optimization where appropriate; do not introduce speculative remote URLs.
- Don't require a generic AI `ai_reason` field or fabricate “verified,” review counts, availability or prices to populate a beautiful card.

**Interactions:** Whole-card click and Details actions must have a real owner; Save/Viewing/Booking/Checkout buttons must use real actions and confirmed persisted results. No decorative dead CTAs or client-only success messages.

## 5. Responsive layout

### Current chat layout (verified in source, not visual certification)

- **Below 1024px (`lg`):** the chat/results center is primary. A drawer provides navigation, and a separate map sheet is opened from chat.
- **At 1024px+ (`lg`):** `chat-canvas.tsx` renders a grid with a **208px navigation rail + two flexible `minmax(0,1fr)` chat/map columns**.
- **At 1280px+ (`xl`):** rail becomes **240px**; chat/map remain flexible.
- The mobile map in `map-mobile-sheet.tsx` is a **75–85dvh separate sheet**. There is no implemented three-snap, map-first “peek / half / full” results sheet.
- `chat-page-client.tsx` and `globals.css` provide `100dvh`/keyboard-aware chat behavior; `src/app/layout.tsx` sets `interactiveWidget: "resizes-content"`.

| CSS viewport width | TARGET experience | Check |
| --- | --- | --- |
| 320–430px | Chat and cards first; easy map and menu access | No horizontal overflow; composer above keyboard |
| 431–767px | Same journey, wider cards and comfortable wrapping | Safe-area and touch controls |
| 768–1023px | Readable chat and map on demand | Do not force cramped tablet split |
| 1024–1279px | Current three-panel workspace; adapt only if tests show cramped content | Usable rail, cards and map |
| 1280–1440px | Balanced three-panel space | Independent scroll and legible typography |
| 1920px+ | Controlled reading widths | No huge stretched text or empty panels |

**TARGET rules:** mobile-first, flexible widths, sensible `min-w-0` and wrapping, dynamic viewport and safe-area handling, no hover-only functions or trapped scrolling. Allow readable zoom/reflow at 200% and 400%. Use component/container-aware responsiveness where it solves a real panel-width issue.

```text
Desktop: [Navigation] [Chat + Results + Composer] [Interactive Map]
Mobile:  [Menu / Chat header / Map action]
         [Chat and results]
         [Composer above keyboard] → Map opens in accessible sheet
```

**Deferred design decision:** If tests at 1024px prove the rail and equal columns are unusably narrow, use the existing chat shell to collapse the rail or adapt panels. This document is not permission to rebuild working navigation.

## 6. Map and detail UX

- **No validated coordinates = no map pin.** Do not add estimated pin skeletons, fake clusters, or map positions merely for visual density.
- An unmapped rental still appears in search, cards and Details and can follow appropriate development viewing actions. Missing data is not a business approval gate.
- Card and marker selection use the same real result identity. Tap a pin → reveal/highlight its card; select a card → highlight its real pin when available.
- Zoom/bounds must reflect grounded returned coordinates; when Maps fails, chat/cards remain usable with an honest map-unavailable state.
- Provide list-based/keyboard alternatives to map pin interaction; never rely on hover alone.
- Details prioritize media, name/location, real price/status, key facts, and a reachable primary CTA. Use existing sheets/dialogs with focus restore and visible Back/Close.
- For viewings, bookings, voting, checkout and tickets, keep **review → submit → pending → authoritative saved confirmation** distinct. No fake receipt or duplicate write on retry.

## 7. Accessibility and touch

**TARGET: WCAG 2.2 AA** ([W3C](https://www.w3.org/TR/WCAG22/)). WCAG 2.2 criterion 2.5.8 provides a **24×24 CSS-pixel minimum with specific exceptions**. MDE's **44×44px goal for important touch targets** is a usability best practice, not the WCAG AA minimum.

Verify focus visibility and order, color contrast, semantic labels, accessible modals, Enter/Space/Escape operation, non-color status indicators, useful alt text, reduced motion, and screen reader announcements of loading/errors/outcomes. Drag/swipe actions need a non-drag alternative. Fixed chat composer and sheets must not hide the focused element or primary CTA.

## 8. Loading, error, empty and confirmation

| State | Expected UI |
| --- | --- |
| Initial | Clear search/browse invitation; no invented content |
| Loading | Stable skeleton/progress, no speculative map markers |
| No match | “No results match these filters” + edit/remove criteria |
| No data | Truthful empty-state explanation + next useful action |
| Missing photo/map | Neutral fallback or no pin, without dropping the record |
| Provider/action error | Plain-English failure and safe retry; preserve input |
| Awaiting mutation | Progress/disabled repeat submission; no premature success |
| Persisted success | Actual receipt/ID/status and next steps |
| Unauthorized | Sign-in/access message with safe return route |
| Cancelled/failed payment | Accurate state and recovery without duplicate charges |

**Example:** On a 390px phone, a renter selects an apartment, opens Details, requests a viewing, and sees “Request received” *only after* one real lead/showing is persisted. A failed write preserves the form and does not claim the booking succeeded.

## 9. Spacing, depth and motion

- Premium ≠ excessive padding. Start with 4–8px icon gaps, 12–20px card padding, 24–40px section rhythm and viewport-appropriate gutters.
- Use existing radius, elevation and border primitives until a concrete redesign proves additional tokens are useful.
- Give hierarchy to imagery, titles and primary actions; reduce secondary badges, borders and metadata density.
- Use motion to show selection, panel opening or confirmation, not constant bounce, delayed card waterfalls or synthetic typing.
- Honor `prefers-reduced-motion` in CSS and component animation logic. Avoid z-index fixes that make maps obscure dialogs or chat.

## 10. Real MDE user journeys

| Journey | What users must actually achieve during development |
| --- | --- |
| Rentals | Search → grounded cards + real map pins → Details → Schedule viewing or original source → exactly one persisted lead/showing |
| Restaurants | Browse/search → Details → real available booking/directions pathway, not pretend reservations |
| Events & tickets | Discover → create/publish where authorized → safe checkout/test payment → persisted ticket/QR |
| AI Concierge | Intent → grounded results/cards/map → authorized action → persisted confirmation |
| Super Admin | Manage users, roles, imports, media, listings, approvals, events, bookings and tickets with audited server actions |

Business approval, ownership evidence, publishing certification and photo paperwork are **not** Phase A development prerequisites. Preserve truthful representation, authorized access, privacy, persistence and safe financial handling.

## 11. Surface inventory and current ownership

This replaces obsolete June 2026 SCREEN/SAN “Not Started” status rows. **Route/component existence does not certify live functionality.** Verify current Linear titles/status and exact PRs when reporting progress.

| Surface | Existing source/route |
| --- | --- |
| Public home | `src/app/page.tsx` and `src/components/home/` |
| Concierge | `src/app/chat/page.tsx` and `src/components/chat/` |
| Rentals | `/rentals` and `src/components/copilot/rental-card.tsx` |
| Restaurants | `/restaurants` and `src/components/copilot/restaurant-card.tsx` |
| Cafés / nightlife | `/cafes`, `/nightlife` |
| Events | `/events` and existing events UI |
| Saved, trips, tickets | `/saved`, `/trips`, `/me/tickets` where present |
| Management | Existing authenticated admin/host/operator surfaces |

## 12. Skills and verification

Use **present repository skills**, not June 2026 slugs that no longer exist:

- `.claude/skills/frontend-design/SKILL.md` and `frontend-design/references/ui-ux-patterns.md` — visual/UX standards.
- `.claude/skills/tasks/SKILL.md` — task lifecycle, working branch, PR, review and verification.
- `.claude/skills/implement/SKILL.md` — smallest safe change.
- `.claude/skills/code-review/SKILL.md` — evidence-based source/spec review.
- `.claude/skills/testing/` or `e2e/` plus domain specialist (CopilotKit, maps, real estate, events, Supabase) **only** when relevant. Never claim an unread skill was loaded.

**TARGET browser matrix:** 320×720, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900 and 1920×1080. Verify keyboard/focus, 200%/400% zoom, map failure, dark/light mode, errors, missing fields, real persisted confirmation and mobile on-screen keyboard. Use existing Playwright and test commands; `npm run floor` is the canonical repository gate when applicable.

**Docs-only verification:** Re-read the replacement, check Markdown/links/reference paths and exact GitHub diff. Do not claim visual/browser, database or production tests were run because a Markdown file changed.

## 13. References and implementation priorities

**External best practice references:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [target size explanation](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [web.dev responsive design](https://web.dev/articles/responsive-web-design-basics), [container queries](https://web.dev/articles/baseline-in-action-container-queries), [Next.js Image API](https://nextjs.org/docs/app/api-reference/components/image).

**Competitor lessons:** Card–map synchronization, contextual conversation and attractive media are useful inspirations from Mindtrip-style journeys. Do not copy third-party brands, assets, wording or route architecture; previous 2026-06-02 observations are historical, not current validation.

**Separate future implementation work** (not changed by updating this file):

| Priority | Candidate fix | Existing owner | Proof |
| --- | --- | --- | --- |
| P0 | Check theme and typography consistency | `src/app/globals.css` / theme provider | Light/dark screenshots, contrast |
| P0 | Review homepage's hardcoded “14 venues · open now” demo-looking text | `src/components/home/home-hero.tsx` | Remove or clearly label unsupported status |
| P1 | Optimize chat/map widths if 1024px is cramped | `src/components/chat/chat-canvas.tsx` | 1024/1280 desktop browser test |
| P1 | Polish map sheet + composer on mobile | `src/components/chat/map-mobile-sheet.tsx` | 390px keyboard, sheet and focus tests |
| P1 | Improve 32px nav targets and small card text | `chat-nav-rail.tsx`, rental/restaurant cards | Touch/keyboard and readability |
| P1 | Polish media/fallback and action hierarchy | Existing browse/card shells | Real-card/mobile and error journeys |

**Definition of done for this guide:** No stale CopilotKit v1 implementation rule, invented CSS token requirements, dark-only claim, chat-only navigation mandate, fake map marker skeletons, outdated mobile snap model or old task statuses passed off as current. Current facts and future design improvements remain clearly separated.
