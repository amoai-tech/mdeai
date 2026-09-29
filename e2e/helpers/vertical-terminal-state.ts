/**
 * SAN-1366 — the terminal-state contract for a vertical's chat results.
 *
 * Why this exists
 * ---------------
 * `prod-synthetic-smoke.spec.ts` asserted `count() > 0` on four verticals. That is an
 * **inventory** assertion, not an application assertion: with a healthy app and zero published
 * listings it must fail, which is exactly what happened on every run from 2026-09-28 onward.
 * Zero published inventory is a valid product state, so the smoke was scoring a correct empty
 * marketplace as a broken application.
 *
 * The fix is to assert the rendered **terminal state** instead:
 *
 *   results  → result cards rendered
 *   empty    → the vertical's explicit empty state rendered
 *   neither  → fail (a search that settles on nothing is not a valid terminal state)
 *
 * The empty branch requires an *explicit* empty-state element. "No cards and no error" is NOT
 * empty — that is the guard which stops this from degenerating into "the smoke always passes".
 *
 * Every vertical already renders an explicit empty state in the chat surface, so this contract
 * needs no new UI:
 *   rentals      `rentals-empty`            search-tool-result-cards.tsx
 *   events       `events-empty`             search-tool-result-cards.tsx
 *   restaurants  `restaurant-card-empty`    domain-results.tsx (`${testId}-empty`)
 *   cafes        `grounded-empty`           search-tool-result-cards.tsx
 */
import { expect, type Page } from "@playwright/test";

export type VerticalName = "rentals" | "events" | "restaurants" | "cafes";

export type VerticalSnapshot = {
  /** Visible result-card elements. */
  results: number;
  /** Visible explicit empty-state elements. */
  empty: number;
  /**
   * Visible error surfaces. Diagnostic only — an error element never *grants* a pass, and never
   * fails a run by itself when real results rendered. See `classifyVerticalTerminalState`.
   */
  error: number;
};

export type VerticalVerdict =
  | { ok: true; state: "results" | "empty" }
  | { ok: false; reason: string };

export type VerticalSpec = {
  /** The concierge message the smoke sends. */
  query: string;
  /** Visible result cards. */
  cards: string;
  /** Visible explicit empty states — any-of, because one vertical can have several kinds. */
  empty: string[];
  /** Visible error surfaces, for diagnostics in the failure message. */
  error: string[];
  /**
   * Optional single retry nudge. Preserved verbatim from the pre-SAN-1366 helpers so this change
   * does not alter anti-flake behaviour: rentals and cafes had one, events and restaurants did not.
   * `ponytail:` that asymmetry is pre-existing and untouched; the ceiling is that a nudge can mask
   * a genuine intermittent agent failure, and the upgrade path is to remove the nudges once the
   * concierge turn is deterministic.
   */
  nudge?: string;
};

const SHARED_ERROR_SURFACES = ['[data-testid="map-env-error"]'];

export const VERTICALS: Record<VerticalName, VerticalSpec> = {
  rentals: {
    query: "1BR apartment in Laureles under 80 dollars per night",
    cards: '[data-testid="rental-card"]',
    empty: ['[data-testid="rentals-empty"]'],
    error: SHARED_ERROR_SURFACES,
    nudge: "Run search-rentals now for 1BR in Laureles under $80 per night.",
  },
  events: {
    query: "salsa events this weekend in Medellín",
    cards: '[data-testid="event-card"]',
    empty: ['[data-testid="events-empty"]'],
    error: SHARED_ERROR_SURFACES,
  },
  restaurants: {
    query: "suggest restaurants medellin",
    cards: '[data-testid="restaurant-card"]',
    // `DomainResults` renders `<DomainEmptyState testId={`${testId}-empty`} />` when a category
    // returns zero rows, and the chat passes `testId="restaurant-card"`.
    empty: ['[data-testid="restaurant-card-empty"]'],
    error: SHARED_ERROR_SURFACES,
  },
  cafes: {
    query: "good specialty coffee in Laureles",
    cards: '[data-testid="grounded-card"][data-result-kind="cafe"]',
    // The grounded list is shared across grounded kinds, so accept either the grounded empty
    // state or the cafes browse empty state.
    empty: ['[data-testid="grounded-empty"]', '[data-testid="cafes-empty"]'],
    error: SHARED_ERROR_SURFACES,
    nudge: "Show me quiet cafés near Laureles with photos and ratings on the map.",
  },
};

/**
 * The whole decision, as a pure function, so the four scenario rows can be proven without a
 * browser, a network, or production inventory.
 *
 * Rules, in order:
 *   1. an error surface with nothing rendered  → FAIL (a failure must not be reported as "empty")
 *   2. results and an empty state both visible → FAIL (ambiguous; cannot be both)
 *   3. results visible                         → OK "results"
 *   4. an explicit empty state visible         → OK "empty"
 *   5. nothing settled                         → FAIL (covers "results were returned but the cards
 *                                                never rendered")
 */
export function classifyVerticalTerminalState(
  vertical: VerticalName,
  snapshot: VerticalSnapshot,
): VerticalVerdict {
  const { results, empty, error } = snapshot;

  if (error > 0 && results === 0) {
    return {
      ok: false,
      reason:
        `${vertical}: an error surface rendered (${error}) with no result cards — ` +
        `this is an application failure, not an empty marketplace`,
    };
  }
  if (results > 0 && empty > 0) {
    return {
      ok: false,
      reason:
        `${vertical}: ${results} result card(s) and ${empty} empty-state element(s) are both ` +
        `visible — an ambiguous terminal state cannot be certified`,
    };
  }
  if (results > 0) return { ok: true, state: "results" };
  if (empty > 0) return { ok: true, state: "empty" };

  return {
    ok: false,
    reason:
      `${vertical}: no terminal state settled — neither result cards nor an explicit empty state ` +
      `became visible (results=${results}, empty=${empty}, error=${error})`,
  };
}

/** Count visible matches for each selector. `:visible` keeps hidden-but-mounted nodes out. */
async function countVisible(page: Page, selectors: string[]): Promise<number> {
  let total = 0;
  for (const selector of selectors) {
    total += await page.locator(`${selector}:visible`).count();
  }
  return total;
}

export async function readVerticalSnapshot(
  page: Page,
  vertical: VerticalName,
): Promise<VerticalSnapshot> {
  const spec = VERTICALS[vertical];
  return {
    results: await countVisible(page, [spec.cards]),
    empty: await countVisible(page, spec.empty),
    error: await countVisible(page, spec.error),
  };
}

export type TerminalResult = {
  state: "results" | "empty";
  snapshot: VerticalSnapshot;
};

/**
 * Poll until the vertical settles on a valid terminal state, then return which one.
 *
 * Uses the runner's own auto-retrying assertion (`expect.poll`) rather than a hand-rolled sleep
 * loop: SAN-1341's architecture contract bans fixed sleeps from the E2E suite, and a fixed interval
 * is both slower on the happy path and flakier at the boundary than the runner's backoff.
 *
 * Throws with the classifier's reason when the timeout expires, so a failure names its own layer
 * instead of reporting a bare locator timeout.
 */
export async function waitForVerticalTerminalState(
  page: Page,
  vertical: VerticalName,
  timeoutMs = 120_000,
): Promise<TerminalResult> {
  let snapshot: VerticalSnapshot = { results: 0, empty: 0, error: 0 };
  let reason: string | null = null;

  try {
    await expect
      .poll(
        async () => {
          snapshot = await readVerticalSnapshot(page, vertical);
          const verdict = classifyVerticalTerminalState(vertical, snapshot);
          reason = verdict.ok ? null : verdict.reason;
          return verdict.ok ? verdict.state : null;
        },
        { timeout: timeoutMs },
      )
      .not.toBeNull();
  } catch {
    throw new Error(
      `[terminal-state] ${reason ?? `${vertical}: no terminal state settled`} (after ${timeoutMs}ms)`,
    );
  }

  const verdict = classifyVerticalTerminalState(vertical, snapshot);
  if (!verdict.ok) {
    throw new Error(`[terminal-state] ${verdict.reason} (after ${timeoutMs}ms)`);
  }
  return { state: verdict.state, snapshot };
}

/**
 * Wait for a terminal state, retrying once with the vertical's nudge if it does not settle.
 * An empty marketplace settles immediately, so this never nudges on a legitimate empty state.
 */
export async function expectVerticalTerminalState(
  page: Page,
  vertical: VerticalName,
  sendNudge: (text: string) => Promise<void>,
  timeoutMs = 120_000,
): Promise<TerminalResult> {
  try {
    return await waitForVerticalTerminalState(page, vertical, timeoutMs);
  } catch (first) {
    const nudge = VERTICALS[vertical].nudge;
    if (!nudge) throw first;
    await sendNudge(nudge);
    try {
      return await waitForVerticalTerminalState(page, vertical, timeoutMs);
    } catch {
      // Report the first failure: it is the one that describes the un-nudged product behaviour.
      throw first;
    }
  }
}
