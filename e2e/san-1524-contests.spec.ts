import { expect, test, type Page } from "@playwright/test";

/**
 * SAN-1524 · the public contest journey.
 *
 * These pages read `vote` through a service-role-only function, so nothing here can be proven by a
 * component test: the page either reaches the database or it does not.
 *
 * The assertions deliberately avoid a hardcoded contest slug — they follow whatever the list
 * renders, so the suite keeps working as contests come and go.
 */
/**
 * The contest pages read `vote` through a service-role-only function.
 *
 * The skip keys off the CREDENTIAL, never off the error banner. Deciding from `contests-error`
 * conflated "this environment has no key" with "the database read just failed" — and a real
 * outage, a broken RPC or a regression would then be quietly skipped instead of failing. Here a
 * present credential means every contest-read failure must fail the test.
 */
const hasContestCredential = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
);

function skipWithoutContestCredential() {
  if (!hasContestCredential) {
    test.skip(
      true,
      "contest reads need a service-role Supabase credential; this environment has none",
    );
    return true;
  }
  return false;
}

/** PR #377 reference widths — the approved design is verified at all four. */
const WIDTHS = [390, 768, 1024, 1440] as const;

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label + " must not scroll sideways").toBeLessThanOrEqual(1);
}

async function openFirstContest(page: Page): Promise<{ href: string | null; title: string }> {
  const card = page.locator('[data-testid^="contest-card-"]').first();
  await expect(card).toBeVisible();
  const title = (await card.locator('[data-testid="contest-name"]').innerText()).trim();
  const link = card.locator("a").first();
  const href = await link.getAttribute("href");
  // A cold dev server hydrates lazily; a <Link> clicked before hydration does nothing.
  await page.waitForLoadState("networkidle");
  await link.click();
  await expect(page).toHaveURL(/\/contests\/.+/, { timeout: 30_000 });
  await expect(page.getByTestId("contest-title")).toHaveText(title);
  return { href, title };
}

test.describe("public contest discovery", { tag: ["@contests"] }, () => {
  test("skip link focuses the actual contest main landmark", async ({ page }) => {
    // This is the first test in the file: on a cold dev server it pays for the Next.js compile
    // of /contests plus the app providers, which can exceed the default 60s budget.
    test.setTimeout(180_000);
    await page.goto("/contests", { timeout: 120_000 });
    const target = page.locator("main#main-content");
    await expect(target).toHaveCount(1);
    await page.locator('a[href="#main-content"]').focus();
    await page.keyboard.press("Enter");
    await expect(target).toBeFocused();
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("restaurant directory links to contest discovery", async ({ page }) => {
    await page.goto("/restaurants");
    await expect(page.getByRole("link", { name: "Explore restaurant contests" })).toHaveAttribute("href", "/contests");
  });

  test("lists real contests and opens one", async ({ page }) => {
    const problems: string[] = [];
    // The local Maps key restricts referers, so the Google SDK can throw from its own script.
    // The map slot contains that failure (and the layout test proves the ballot survives), so it
    // must not fail the contest journey. Every other page error still does.
    const containedMapsError = /getRootNode|google\.maps|Google Maps/i;
    page.on("pageerror", (error) => {
      const text = String(error);
      if (containedMapsError.test(text)) return;
      problems.push(text.slice(0, 120));
    });
    page.on("response", (response) => {
      if (response.status() >= 500) problems.push("http " + response.status() + " " + response.url());
    });

    await page.goto("/contests");
    await expect(page.getByTestId("contests-page")).toBeVisible();
    // The editorial hero is real UI, not a decorator: it names the city and the primary action.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Medellín");
    await expect(page.locator('a[href="#contests"]')).toBeVisible();

    if (skipWithoutContestCredential()) return;

    // Either real contests or the honest empty state — never a blank page or an error.
    await expect(page.getByTestId("contests-error")).toHaveCount(0);
    const cards = page.locator('[data-testid^="contest-card-"]');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      await expect(page.getByTestId("contests-empty")).toBeVisible();
      expect(problems, "empty state must also be error-free").toEqual([]);
      return;
    }

    await expect(page.getByTestId("contest-name").first()).toBeVisible();
    const opened = await openFirstContest(page);
    expect(opened.href).toMatch(/^\/contests\/.+/);
    await expect(page.getByTestId("contest-error")).toHaveCount(0);
    // Hero, ballot and provisional standings are all present and separately labelled.
    await expect(page.getByTestId("contest-description")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Restaurants on the ballot" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Standings" })).toBeVisible();
    await expect(page.getByTestId("contest-standings")).toBeVisible();

    // Nominees, when present, must carry the contest identity into the restaurant page.
    const nomineeLinks = page.locator('[data-testid="contest-nominees"] a');
    if ((await nomineeLinks.count()) > 0) {
      const href = await nomineeLinks.first().getAttribute("href");
      expect(href).toContain("/restaurants/");
      const contestId = await page.getByTestId("contest-page").getAttribute("data-contest-id");
      expect(contestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(new URL(href!, "http://localhost").searchParams.get("contest_id")).toBe(contestId);
    } else {
      await expect(page.getByTestId("contest-nominees-empty")).toBeVisible();
    }

    expect(problems, "no console errors or 5xx while browsing").toEqual([]);
  });

  // Layout is asserted, not inferred from markup: a class name does not prove a rendered height,
  // and a stacking bug once shipped while every string assertion passed.
  test("the featured contest keeps a 4:3 cover on phones and sits beside its text on desktop", async ({
    page,
  }) => {
    await page.goto("/contests");
    const featured = page.locator('[data-featured="true"]');
    const cards = page.locator('[data-testid^="contest-card-"]');
    const cardCount = await cards.count();

    if (skipWithoutContestCredential()) return;

    expect(cardCount, "the public contest list must render at least one contest here").toBeGreaterThan(0);

    if (cardCount > 1) {
      // More than one contest: the grid is correct, and the featured treatment must NOT appear.
      await expect(page.getByTestId("contests-list")).toBeVisible();
      await expect(featured).toHaveCount(0);
      return;
    }

    const media = featured.getByTestId("contest-featured-media");
    const copy = featured.getByTestId("contest-featured-copy");

    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await media.boundingBox();
    expect(phone, "the cover must render on a phone").not.toBeNull();
    // A collapsed cover is the bug this guards: it rendered 64px before the explicit frame.
    expect(phone!.height, "the phone cover must not collapse").toBeGreaterThan(150);
    // PR #377 puts a 4:3 cover on the single-contest card at 390px.
    expect(phone!.width / phone!.height).toBeGreaterThan(1.25);
    expect(phone!.width / phone!.height).toBeLessThan(1.45);

    await page.setViewportSize({ width: 1440, height: 900 });
    const textBox = await copy.boundingBox();
    const visualBox = await media.boundingBox();
    expect(textBox && visualBox).toBeTruthy();
    const topGap = Math.abs(textBox!.y - visualBox!.y);
    expect(topGap, "desktop must place the cover beside the text, not under it").toBeLessThan(8);
    expect(visualBox!.x).toBeLessThan(textBox!.x);
  });

  test("the directory and a contest hold their layout at every approved width", async ({ page }) => {
    await page.goto("/contests");
    if (skipWithoutContestCredential()) return;

    const cards = page.locator('[data-testid^="contest-card-"]');
    if ((await cards.count()) === 0) {
      test.skip(true, "no public contest to measure in this environment");
      return;
    }

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/contests");
      await expectNoHorizontalOverflow(page, "/contests at " + width + "px");
      await page.screenshot({
        fullPage: true,
        path: "test-results/san-1524-contests-" + width + ".png",
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await openFirstContest(page);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("contest-title")).toBeVisible();
      await expectNoHorizontalOverflow(page, "contest detail at " + width + "px");
      // The primary action on every card stays visible at every width.
      const firstNominee = page.locator('[data-testid="contest-nominees"] a').first();
      if ((await firstNominee.count()) > 0) {
        await expect(firstNominee).toBeVisible();
      }
      await page.screenshot({
        fullPage: true,
        path: "test-results/san-1524-contest-detail-" + width + ".png",
      });
    }
  });

  test("status filters are real links that keep the directory usable", async ({ page }) => {
    await page.goto("/contests");
    if (skipWithoutContestCredential()) return;

    // Scoped to the filter group: a contest card's own link also contains the word "Draft".
    const draftFilter = page
      .getByTestId("contest-filters")
      .getByRole("link", { name: "Draft", exact: true });
    await expect(draftFilter).toBeVisible();
    await draftFilter.click({ noWaitAfter: true });
    await expect(page).toHaveURL(/\/contests\?status=draft$/);
    await expect(page.getByTestId("contests-error")).toHaveCount(0);

    // Either real drafts or the honest "nothing in this view" panel — never an error or a blank.
    const cards = page.locator('[data-testid^="contest-card-"]');
    if ((await cards.count()) === 0) {
      await expect(page.getByTestId("contests-filter-empty")).toBeVisible();
    }
    await expect(page.locator('[aria-current="page"]')).toHaveText("Draft");
  });

  test("a visitor can walk from a nominee back to the same contest", async ({ page }) => {
    await page.goto("/contests");
    if (skipWithoutContestCredential()) return;

    const cards = page.locator('[data-testid^="contest-card-"]');
    if ((await cards.count()) === 0) {
      test.skip(true, "no public contest to open");
      return;
    }
    const contest = await openFirstContest(page);
    const contestId = await page.getByTestId("contest-page").getAttribute("data-contest-id");
    const nominee = page.locator('[data-testid="contest-nominees"] a').first();
    if ((await nominee.count()) === 0) return;
    const nomineeHref = await nominee.getAttribute("href");
    expect(nomineeHref).toContain("/restaurants/");
    expect(new URL(nomineeHref!, "http://localhost").searchParams.get("contest_id")).toBe(contestId);

    // Follow the real link target. The map on this page keeps long-lived connections, so
    // waiting for "networkidle" here is a false-hang rather than a readiness signal.
    await page.goto(nomineeHref!);
    await expect(page).toHaveURL(/\/restaurants\//, { timeout: 30_000 });
    await expect(
      page.getByRole("region", { name: "Restaurant contest" }),
    ).toBeVisible();

    // Contest context survives the round trip: "All contests" is reachable and reopening the
    // contest keeps the same identity and title.
    await page.goto(contest.href ?? "/contests");
    await expect(page.getByTestId("contest-page")).toHaveAttribute("data-contest-id", contestId!);
    await expect(page.getByTestId("contest-title")).toHaveText(contest.title);
  });

  test("an unknown contest is a 404, not an empty page", async ({ page }) => {
    const response = await page.goto("/contests/san-1524-does-not-exist");
    // Without credentials the read fails, the page renders its error state and answers 200.
    if (skipWithoutContestCredential()) return;
    expect(response?.status()).toBe(404);
  });
});
