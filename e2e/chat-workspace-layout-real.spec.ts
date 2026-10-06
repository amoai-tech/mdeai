import { test, expect, type Page } from "@playwright/test";

/**
 * SAN-1414 · Make /chat fit the window like Mindtrip — the same contract as
 * `chat-workspace-layout.spec.ts`, proven on the REAL CopilotKit chat view (not the deterministic
 * stand-in).
 *
 * Run with `npm run test:e2e:chat-workspace-real`. It needs a dev server WITHOUT
 * NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT (the script sets fake public Supabase/Maps values and
 * E2E_BYPASS_AUTH). The AI runtime answers 401 there, which is fine: searches use the fast paths and
 * a free-form question gets the "assistant can't answer" notice.
 *
 * It is NOT part of the deterministic CI job (that server runs the stand-in chat), so wiring it into a
 * workflow is a separate, approved change.
 */

const PINNED_BOTTOM_TOLERANCE = 120;

const threads = Array.from({ length: 13 }, (_, index) => ({
  id: `thread-${index}`,
  title: "Untitled Thread",
  updatedAt: new Date(Date.UTC(2026, 9, 5, 12, 0, 0) - index * 3_600_000).toISOString(),
}));

const rentals = Array.from({ length: 10 }, (_, index) => ({
  id: `rnt_real_${index}`,
  title: `Real-view check ${index + 1}BR in Laureles`,
  neighborhood: "Laureles",
  nightly_price: 55 + index,
  currency: "USD",
  bedrooms: 1,
  wifi: true,
  amenities: ["wifi"],
  image: "",
  source_url: `https://mdeai.co/rentals/rnt_real_${index}`,
  can_schedule_viewing: true,
  schedule_viewing_url: "https://mdeai.co/x",
  host_name: "QA Host",
  availability: "Available now",
  tags: ["remote-work"],
  latitude: 6.25 + index * 0.001,
  longitude: -75.59,
}));

/**
 * Sends a message and waits until it shows in the transcript. CopilotKit hydrates after the box renders
 * and text typed earlier is lost, so a send that did not land is retried (no fixed sleeps).
 */
async function send(page: Page, text: string) {
  const input = page.getByPlaceholder(/type a message/i);
  const region = page.getByTestId("copilot-chat-region");
  await expect(async () => {
    if ((await region.innerText()).includes(text)) return;
    await input.click();
    await input.fill(text);
    await expect(page.getByTestId("copilot-send-button")).toBeEnabled({ timeout: 2_000 });
    await page.getByTestId("copilot-send-button").click();
    await expect(region).toContainText(text, { timeout: 4_000 });
  }).toPass({ timeout: 45_000 });
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/threads", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads }) }),
  );
  await page.route("**/api/rentals/search", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: rentals, total: rentals.length, source: "mock" }),
    }),
  );
  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/type a message/i).waitFor({ timeout: 120_000 });
  await expect(page.getByTestId("nav-thread-item")).toHaveCount(threads.length);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="chat-canvas"]');
    const box = document.querySelector('[data-testid="copilot-chat-input"]')?.getBoundingClientRect();
    return {
      windowHeight: window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      pageScrollY: window.scrollY,
      columns: canvas
        ? getComputedStyle(canvas)
            .gridTemplateColumns.split(" ")
            .map((value) => Math.round(parseFloat(value)))
        : [],
      composerBottom: box ? Math.round(box.bottom) : null,
    };
  });
}

test("the very first search after load scrolls its newest results into view", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, 1280, 800);
  // No earlier message: the results are the first thing in the transcript.
  await send(page, "1BR apartment in Laureles under 80 dollars per night");
  await expect(page.getByTestId("rental-card")).toHaveCount(10, { timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const cards = document.querySelectorAll('[data-testid="rental-card"]');
          let node: HTMLElement | null = cards[cards.length - 1] as HTMLElement | null;
          while (node) {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) {
              return Math.round(node.scrollHeight - node.clientHeight - node.scrollTop);
            }
            node = node.parentElement;
          }
          return -1;
        }),
      { timeout: 15_000, message: "pixels of results still hidden below the transcript's visible area" },
    )
    .toBeLessThanOrEqual(8);
});

for (const viewport of [
  { width: 1440, height: 900, sidebar: 240, column: 600 },
  { width: 1024, height: 768, sidebar: 208, column: 408 },
] as const) {
  test(`real chat view is a fixed workspace at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, viewport.width, viewport.height);

    const empty = await measure(page);
    expect(empty.pageHeight).toBeLessThanOrEqual(empty.windowHeight);
    expect(empty.columns).toEqual([viewport.sidebar, viewport.column, viewport.column]);

    // Short conversation: a question the fast path answers with a clarifying message.
    await send(page, "search rentals medellin");
    await expect(page.getByTestId("copilot-chat-region")).toContainText("What dates, budget", { timeout: 20_000 });
    const short = await measure(page);
    expect(short.pageHeight).toBeLessThanOrEqual(short.windowHeight);
    expect(short.composerBottom ?? Infinity).toBeLessThanOrEqual(short.windowHeight);
    expect(
      short.windowHeight - (short.composerBottom ?? 0),
      "short chat: the box stays pinned near the bottom (the gap above it is expected)",
    ).toBeLessThanOrEqual(PINNED_BOTTOM_TOLERANCE);

    // Tall conversation: ten rental cards.
    await send(page, "1BR apartment in Laureles under 80 dollars per night");
    await expect(page.getByTestId("rental-card")).toHaveCount(10, { timeout: 30_000 });
    // The transcript sticks to the newest result once the cards have laid out.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const cards = document.querySelectorAll('[data-testid="rental-card"]');
            let node: HTMLElement | null = cards[cards.length - 1] as HTMLElement | null;
            while (node) {
              const style = getComputedStyle(node);
              if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) {
                return node.scrollTop + node.clientHeight >= node.scrollHeight - 8;
              }
              node = node.parentElement;
            }
            return false;
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
    const tall = await measure(page);
    expect(tall.pageHeight, "ten cards: the page must not grow").toBeLessThanOrEqual(tall.windowHeight);
    expect(tall.pageScrollY).toBe(0);
    expect(tall.composerBottom ?? Infinity).toBeLessThanOrEqual(tall.windowHeight);

    const scroller = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="rental-card"]');
      const last = cards[cards.length - 1];
      let node: HTMLElement | null = last instanceof HTMLElement ? last : null;
      while (node) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) break;
        node = node.parentElement;
      }
      if (!node) return null;
      const input = document.querySelector('[data-testid="copilot-chat-input"]');
      const boxTop = () => Math.round(input?.getBoundingClientRect().top ?? -1);
      const startedAtBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 8;
      const before = boxTop();
      node.scrollTop = 0;
      const moved = node.scrollTop === 0;
      const boxMoved = boxTop() !== before;
      node.scrollTop = node.scrollHeight;
      return {
        startedAtBottom,
        moved,
        boxMoved,
        pageScrollY: window.scrollY,
        lastCardAboveBox: (last?.getBoundingClientRect().bottom ?? Infinity) <= boxTop() + 1,
      };
    });
    expect(scroller, "the real transcript must have its own scroller").not.toBeNull();
    expect(scroller?.startedAtBottom, "newest results are scrolled into view").toBe(true);
    expect(scroller?.moved).toBe(true);
    expect(scroller?.boxMoved, "the box must not move while the transcript scrolls").toBe(false);
    expect(scroller?.pageScrollY).toBe(0);
    expect(scroller?.lastCardAboveBox).toBe(true);

    // The sidebar keeps New chat and the fixed groups on screen; only the chat list scrolls.
    for (const testId of ["nav-new-chat", "nav-restaurants-link", "nav-saved-link"]) {
      const box = await page.getByTestId(testId).first().boundingBox();
      expect(box, `${testId} must be on screen`).not.toBeNull();
      expect((box?.y ?? -1) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    }
  });
}
