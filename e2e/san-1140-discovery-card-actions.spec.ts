import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitUntilInteractive } from "./helpers/rental-journey-steps";

/**
 * SAN-1140 — every discovery card owns its actions.
 *
 * The defect this pins: /restaurants rendered "Ask about this" and "View details" as siblings
 * *below* RestaurantCard, so they sat outside the bordered card and (on a phone) under the sticky
 * Ask MDE composer. Events, Rentals, Cafés and Nightlife already kept their actions inside.
 *
 * These assertions are DOM-containment plus real interaction, not page-render smoke: a passing
 * test here means a person can reach and use the action on the card they are looking at.
 *
 * Runs against any base URL (local worktree or the live app). It skips — with an explicit reason —
 * when the environment has no venue inventory, because the deterministic CI lane points at an
 * intentionally unreachable database and would otherwise "pass" against zero cards.
 *
 *   SMOKE_BASE_URL=http://localhost:3011 PW_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/san-1140-discovery-card-actions.spec.ts --project=chromium
 *   PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 MDE_REMOTE_DISCOVERY_CARDS=1 \
 *     npx playwright test e2e/san-1140-discovery-card-actions.spec.ts --project=prod-smoke
 */

type RouteSpec = {
  route: string;
  pageTestId: string;
  card: string;
  ask: string;
  /** Only routes with a real public details destination get one. */
  details?: string;
  /** Café/nightlife cards expose a coordinate-gated "View on map" control. */
  mapAction?: boolean;
};

const ROUTES: RouteSpec[] = [
  {
    route: "/restaurants",
    pageTestId: "restaurants-browse",
    card: '[data-result-kind="restaurant"]',
    ask: '[data-testid="restaurant-ask-select"]',
    details: '[data-testid^="restaurant-detail-link-"]',
  },
  {
    route: "/cafes",
    pageTestId: "cafes-browse",
    card: '[data-result-kind="cafe"]',
    ask: '[data-testid="venue-ask-select"]',
    mapAction: true,
  },
  {
    route: "/nightlife",
    pageTestId: "nightlife-page",
    card: '[data-result-kind="nightlife"]',
    ask: '[data-testid="venue-ask-select"]',
    mapAction: true,
  },
];

const WIDTHS = [320, 390, 768, 1440] as const;

/**
 * In the deterministic browser lane the app serves a labelled fixture
 * (`DETERMINISTIC_E2E_VENUES`), so inventory is guaranteed. A zero-card run there is a broken
 * fixture or a broken page, not a reason to skip — a green run made of skips proves nothing.
 * Against an arbitrary URL (local dev, production) a missing inventory still skips honestly.
 */
const DETERMINISTIC_FIXTURES =
  process.env.NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT === "1";

function skipOrFail(
  missing: boolean,
  spec: RouteSpec,
  reason: string,
): boolean {
  if (!missing) return false;
  if (DETERMINISTIC_FIXTURES) {
    throw new Error(
      `${spec.route}: ${reason}. The deterministic browser lane serves a fixture, so this must fail instead of skipping.`,
    );
  }
  test.skip(true, `${spec.route}: ${reason}`);
  return true;
}

async function openRoute(page: Page, spec: RouteSpec): Promise<Locator> {
  await page.goto(spec.route, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId(spec.pageTestId)).toBeVisible({ timeout: 60_000 });
  const cards = page.locator(spec.card);
  try {
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  } catch {
    /* Handled by the caller as an explicit skip. */
  }
  return cards;
}

/** Every rendered card keeps exactly one Ask, and no Ask exists outside a card. */
async function expectAskContainment(page: Page, spec: RouteSpec) {
  const cards = page.locator(spec.card);
  const cardCount = await cards.count();
  expect(cardCount, `${spec.route} needs at least one card`).toBeGreaterThan(0);

  const totalAsks = await page.locator(spec.ask).count();
  expect(
    totalAsks,
    `${spec.route}: exactly one Ask toggle per card, and none outside a card`,
  ).toBe(cardCount);

  for (let i = 0; i < Math.min(cardCount, 5); i += 1) {
    const card = cards.nth(i);
    // A dev server can briefly mount a duplicate list during hydration, so a card
    // captured by index can disappear for a frame. Measure only a real, stable box:
    // if the card never gets one, this fails instead of measuring nothing.
    await expect
      .poll(async () => (await card.boundingBox())?.height ?? 0, {
        message: `${spec.route} card ${i} must render a measurable box`,
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    const asks = await card.locator(spec.ask).count();
    expect(asks, `${spec.route} card ${i} owns its Ask toggle`).toBe(1);
    // Geometric containment: the control is painted inside the card's own box,
    // not merely present in the page.
    const cardBox = await card.boundingBox();
    const askBox = await card.locator(spec.ask).boundingBox();
    expect(cardBox, `${spec.route} card ${i} card box`).not.toBeNull();
    expect(askBox, `${spec.route} card ${i} ask box`).not.toBeNull();
    if (cardBox && askBox) {
      expect(askBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(askBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);
      expect(askBox.x + askBox.width).toBeLessThanOrEqual(
        cardBox.x + cardBox.width + 1,
      );
      expect(askBox.y + askBox.height).toBeLessThanOrEqual(
        cardBox.y + cardBox.height + 1,
      );
      // SAN-1122: one action height across restaurants, cafés and nightlife.
      expect(
        askBox.height,
        `${spec.route} card ${i}: Ask must keep the 44px shared action height`,
      ).toBeGreaterThanOrEqual(44);
    }

    if (spec.mapAction) {
      const mapAction = card.locator('[data-testid="venue-map-select"]');
      if (await mapAction.count()) {
        const mapBox = await mapAction.boundingBox();
        expect(
          mapBox?.height ?? 0,
          `${spec.route} card ${i}: View on map must match the shared action height`,
        ).toBeGreaterThanOrEqual(44);
      }
    }
  }
}

async function expectNoHorizontalOverflow(page: Page, where: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `${where}: page must not scroll sideways (${scrollWidth} > ${clientWidth})`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

for (const spec of ROUTES) {
  test.describe(`SAN-1140 ${spec.route} card actions`, () => {
    test("every card owns its Ask action and nothing sits below the card", async ({
      page,
    }) => {
      const cards = await openRoute(page, spec);
      const count = await cards.count();
      if (skipOrFail(count === 0, spec, "rendered no cards")) return;
      await expectAskContainment(page, spec);
      await expectNoHorizontalOverflow(page, spec.route);
    });

    test("keeps actions inside the card at 320/390/768/1440 and at 200% zoom", async ({
      page,
    }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const cards = await openRoute(page, spec);
        const count = await cards.count();
        if (skipOrFail(count === 0, spec, "rendered no cards")) return;
        await expectAskContainment(page, spec);
        await expectNoHorizontalOverflow(page, `${spec.route} @ ${width}px`);
      }

      // Browser zoom is not scriptable in Playwright; document zoom re-flows the same way
      // and is the closest reproducible proxy for WCAG 2.2 reflow.
      await page.setViewportSize({ width: 1440, height: 900 });
      const zoomCards = await openRoute(page, spec);
      if (skipOrFail((await zoomCards.count()) === 0, spec, "rendered no cards at 200% zoom")) {
        return;
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "200%";
      });
      await expectAskContainment(page, spec);
      await expectNoHorizontalOverflow(page, `${spec.route} @ 200% zoom`);
    });

    test("Ask toggles from a real click and never sends an AI turn", async ({
      page,
    }) => {
      const agentTurns: string[] = [];
      page.on("request", (request) => {
        if (
          request.method() !== "POST" ||
          !request.url().includes("/api/copilotkit")
        ) {
          return;
        }
        // Only an agent/run starts a model turn. CopilotKit's own `info` and
        // context/resource sync posts are transport plumbing, not an answer.
        try {
          const envelope: unknown = request.postDataJSON();
          if (
            envelope &&
            typeof envelope === "object" &&
            "method" in envelope &&
            envelope.method === "agent/run"
          ) {
            agentTurns.push(request.url());
          }
        } catch {
          /* Non-JSON transport requests cannot be agent runs. */
        }
      });

      const cards = await openRoute(page, spec);
      const count = await cards.count();
      if (skipOrFail(count === 0, spec, "rendered no cards")) return;

      const ask = cards.first().locator(spec.ask);
      await ask.scrollIntoViewIfNeeded();
      await waitUntilInteractive(ask, `${spec.route} Ask about this`);
      await expect(ask).toHaveAttribute("aria-pressed", "false");
      // A real click also proves the control is not covered by the sticky composer.
      await ask.click();
      await expect(ask).toHaveAttribute("aria-pressed", "true");
      await expect(ask).toContainText("Clear selection");

      // The state flip above is the render+effect commit for this click. Selection is
      // context only, so no agent turn may exist at this point.
      expect(agentTurns, "selection must not auto-send an AI message").toEqual([]);

      // A second activation (clear) runs another handler + commit; still no run.
      await ask.click();
      await expect(ask).toHaveAttribute("aria-pressed", "false");
      expect(agentTurns).toEqual([]);
    });

    test("Ask is reachable and operable from the keyboard with visible focus", async ({
      page,
    }) => {
      const cards = await openRoute(page, spec);
      const count = await cards.count();
      if (skipOrFail(count === 0, spec, "rendered no cards")) return;

      const card = cards.first();
      const ask = card.locator(spec.ask);
      await waitUntilInteractive(ask, `${spec.route} Ask about this`);
      // Sequential Tab from the card's first footer control reaches the Ask toggle.
      const firstControl = card
        .locator('[data-slot="card-footer"] a, [data-slot="card-footer"] button')
        .first();
      await firstControl.focus();
      for (let step = 0; step < 5; step += 1) {
        if (await ask.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press("Tab");
      }
      await expect
        .poll(() => ask.evaluate((el) => el === document.activeElement))
        .toBe(true);
      // Keyboard focus must be visible, not just programmatic.
      expect(await ask.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
      const focusStyle = await ask.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return { outline: style.outlineStyle, shadow: style.boxShadow };
      });
      expect(
        focusStyle.outline !== "none" || focusStyle.shadow !== "none",
        "keyboard focus must render a visible indicator",
      ).toBe(true);

      await page.keyboard.press("Enter");
      await expect(ask).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Space");
      await expect(ask).toHaveAttribute("aria-pressed", "false");
    });

    if (spec.mapAction) {
      test(`${spec.route} View on map selects that card's own venue pin, switches and clears`, async ({
        page,
      }) => {
        const cards = await openRoute(page, spec);
        const count = await cards.count();
        if (skipOrFail(count === 0, spec, "rendered no cards")) return;
        const first = cards.first();
        const second = cards.nth(1);
        const firstMap = first.locator('[data-testid="venue-map-select"]');
        const secondMap = second.locator('[data-testid="venue-map-select"]');
        // A venue without grounded coordinates must not offer a map action at all.
        if (
          skipOrFail(
            (await firstMap.count()) === 0 || (await secondMap.count()) === 0,
            spec,
            "needs two coordinate-backed pins",
          )
        ) {
          return;
        }

        await firstMap.scrollIntoViewIfNeeded();
        await waitUntilInteractive(firstMap, `${spec.route} View on map`);
        await firstMap.click();
        await expect(firstMap).toHaveAttribute("aria-pressed", "true");
        await expect(first).toHaveAttribute("data-selected", "true");
        await expect(second).toHaveAttribute("data-selected", "false");

        // Card B selects pin B and releases pin A — never both, never the wrong one.
        await secondMap.scrollIntoViewIfNeeded();
        await secondMap.click();
        await expect(secondMap).toHaveAttribute("aria-pressed", "true");
        await expect(second).toHaveAttribute("data-selected", "true");
        await expect(first).toHaveAttribute("data-selected", "false");
        await expect(firstMap).toHaveAttribute("aria-pressed", "false");

        // Activating the selected control again clears the map selection.
        await secondMap.click();
        await expect(secondMap).toHaveAttribute("aria-pressed", "false");
        await expect(second).toHaveAttribute("data-selected", "false");
      });
    }

    if (spec.details) {
      const detailsSelector = spec.details;
      test(`${spec.route} View details is one real link inside the card and opens the record`, async ({
        page,
      }) => {
        const cards = await openRoute(page, spec);
        const count = await cards.count();
        if (skipOrFail(count === 0, spec, "rendered no cards")) return;

        const card = cards.first();
        const details = card.locator(detailsSelector);
        await expect(details).toHaveCount(1);
        // Chat-only duplicate Details control must not appear on a browse card.
        await expect(card.locator('[data-testid="restaurant-details-cta"]')).toHaveCount(0);

        const href = await details.getAttribute("href");
        // Internal record route, never an external or script URL.
        expect(href, "Details must use the internal public route").toMatch(
          /^\/restaurants\/[A-Za-z0-9_-]+$/,
        );
        const id = href?.split("/").pop();
        if (!DETERMINISTIC_FIXTURES) {
          // Live inventory uses canonical UUIDs; the CI fixture uses readable ids.
          expect(id, "live restaurant ids are canonical UUIDs").toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          );
        }

        await details.scrollIntoViewIfNeeded();
        await details.click();
        await expect
          .poll(() => new URL(page.url()).pathname, {
            message: "Details must open that restaurant's own route",
            // A cold Next dev compile of the detail route is legitimately slow.
            timeout: 30_000,
          })
          .toBe(`/restaurants/${id}`);
        await expect(page.locator("h1, h2").first()).toBeVisible();

        await page.goBack();
        await expect(page.locator(spec.card).first()).toBeVisible();
      });
    }
  });
}
