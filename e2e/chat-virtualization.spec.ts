import { test, expect, type JSHandle, type Page, type Route } from "@playwright/test";

/**
 * SAN-1357 — prove the real CopilotKit 1.75.0 chat view virtualizes a long conversation.
 *
 * Runs against the dev-only probe at `/dev/chat-virtualization`, which hands
 * `CopilotChatView` 500 static messages and never configures a runtime.
 *
 * TWO TRAPS THIS SPEC EXISTS TO AVOID
 *
 * 1. Measuring an un-hydrated page. `CopilotChatView.ScrollView` only publishes
 *    `ScrollElementContext` from its own mount effect, so server-rendered HTML shows its
 *    pre-mount branch: no context, no virtualization, all 500 rows present — and no
 *    warning, because the warning fires only when the context value exists but is
 *    zero-height. That produces a confident, entirely false "virtualization is broken"
 *    result. The spec therefore waits for the probe's `data-hydrated` marker, which is set
 *    from an effect — the same mechanism that gates virtualization.
 *
 * 2. Counting message text. Assistant content renders through `Streamdown` and the toolbar
 *    renders independently of it, so text counts do not track mounted rows. The virtualized
 *    branch is the only one that emits `[data-index]` (installed dist
 *    `copilotkit-CoWG8EAX.mjs`, `CopilotChatMessageView`), so that is the metric.
 */

const MESSAGE_COUNT = 500;
const LAST_INDEX = MESSAGE_COUNT - 1;
const ROW_TEXT = /Probe message \d+ of 500/;
const FIRST = "Probe message 1 of 500";

type ConsoleEntry = { type: string; text: string };
type InfoRequest = { url: string; method: string; postData: string | null };

let consoleMessages: ConsoleEntry[] = [];
let pageErrors: string[] = [];
let runtimeInfoRequests: InfoRequest[] = [];

/**
 * Safety net only. The probe registers its agent locally via `agents__unsafe_dev_only` and
 * configures no `runtimeUrl`, so it should issue no runtime-info request at all. These
 * stubs exist so that if the provider does probe a default endpoint, the run hits a stub
 * instead of MDE's authenticated route. Whether they fire is reported as evidence.
 *
 * Installed `@copilotkit/core` dist `index.mjs:2232-2271` can issue either shape:
 *   runtimeTransport "single" -> POST <runtimeUrl>      body {"method":"info"}
 *   runtimeTransport "auto"   -> GET  <runtimeUrl>/info, then the POST above
 *   runtimeTransport "rest"   -> GET  <runtimeUrl>/info
 * A pattern ending in `/**` cannot match the bare endpoint, and a bare pattern cannot match
 * `/info`, so both are registered.
 */
const fulfillRuntimeInfo = (route: Route) => {
  const request = route.request();
  runtimeInfoRequests.push({
    url: request.url(),
    method: request.method(),
    postData: request.postData(),
  });
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ agents: {} }),
  });
};

/** Ancestor chain of the message list, with the numbers that decide `shouldVirtualize`. */
async function readLayout(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="copilot-message-list"]');
    const chain: Array<Record<string, unknown>> = [];
    let node = list?.parentElement ?? null;
    while (node && chain.length < 10) {
      const style = getComputedStyle(node);
      chain.push({
        tag: node.tagName.toLowerCase(),
        cls: String(node.className),
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        overflowY: style.overflowY,
      });
      node = node.parentElement;
    }
    const indexes = list
      ? Array.from(list.querySelectorAll("[data-index]")).map((el) =>
          Number((el as HTMLElement).dataset.index),
        )
      : [];
    return {
      hydrated:
        document
          .querySelector('[data-testid="virtualization-probe"]')
          ?.getAttribute("data-hydrated") ?? "no-probe",
      mountedRows: indexes.length,
      mountedRange: indexes.length ? [Math.min(...indexes), Math.max(...indexes)] : null,
      listChildren: list ? list.children.length : -1,
      chain,
    };
  });
}

/**
 * The element CopilotKit hands to the virtualizer — i.e. the element carrying `scrollRef`,
 * which is a *height-constrained* scroll viewport. Requiring `scrollHeight > clientHeight`
 * matters: an `overflow-y: auto` box with no constrained height grows to fit its content
 * instead of scrolling, and picking that one makes every scroll assertion meaningless.
 */
async function findScroller(page: Page) {
  return page.evaluateHandle(() => {
    const list = document.querySelector('[data-testid="copilot-message-list"]');
    let node: HTMLElement | null = list?.parentElement ?? null;
    while (node) {
      const style = getComputedStyle(node);
      const scrollable = style.overflowY === "auto" || style.overflowY === "scroll";
      if (scrollable && node.clientHeight > 0 && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  });
}

/** True when the row for `index` is mounted *and* currently inside the scroller's viewport. */
function rowInViewport(scroller: JSHandle<HTMLElement | null>, index: number) {
  return scroller.evaluate((node, i) => {
    if (!node) return false;
    const row = node.querySelector(`[data-index="${i}"]`);
    if (!row) return false;
    const view = node.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    return box.bottom > view.top + 1 && box.top < view.bottom - 1;
  }, index);
}

test.describe(
  "SAN-1357 · CopilotChatView virtualizes a 500-message conversation",
  { tag: ["@critical", "@virtualization"] },
  () => {
    // The first dev-mode compile of this route pulls in CopilotKit, Streamdown and Lit.
    test.describe.configure({ timeout: 180_000 });

    test.beforeEach(async ({ page }) => {
      consoleMessages = [];
      pageErrors = [];
      runtimeInfoRequests = [];

      // Capture warnings too: CopilotKit's "virtualization disabled" notice is a
      // console.warn, so an errors-only collector would make that assertion vacuously true.
      page.on("console", (message) =>
        consoleMessages.push({ type: message.type(), text: message.text() }),
      );
      page.on("pageerror", (error) => pageErrors.push(String(error)));

      await page.route("**/api/copilotkit", fulfillRuntimeInfo);
      await page.route("**/api/copilotkit/**", fulfillRuntimeInfo);

      const response = await page.goto("/dev/chat-virtualization", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok(), "the probe route must exist in deterministic E2E mode").toBe(true);

      // The load-bearing precondition. Until this flips, the DOM is server-rendered HTML.
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="virtualization-probe"]')
            ?.getAttribute("data-hydrated") === "true",
        undefined,
        { timeout: 150_000 },
      );
    });

    test("hydrates, then mounts a bounded window of rows instead of all 500", async ({ page }) => {
      await expect(page.getByTestId("copilot-message-list")).toBeVisible({ timeout: 20_000 });

      const layout = await readLayout(page);
      const scroller = await findScroller(page);
      const scrollerMetrics = await scroller.evaluate((node: HTMLElement | null) =>
        node ? { clientHeight: node.clientHeight, scrollHeight: node.scrollHeight } : null,
      );

      const warnings = consoleMessages.filter((entry) => entry.type === "warning");
      console.log(
        [
          "── SAN-1357 virtualization evidence ────────────────────────",
          `logical messages      : ${MESSAGE_COUNT}`,
          `probe data-hydrated   : ${layout.hydrated}`,
          `mountedRows [data-idx]: ${layout.mountedRows}`,
          `mounted index range   : ${JSON.stringify(layout.mountedRange)}`,
          `listChildren          : ${layout.listChildren}`,
          `scroller metrics      : ${JSON.stringify(scrollerMetrics)}`,
          `runtimeInfoRequests   : ${JSON.stringify(runtimeInfoRequests)}`,
          `console warnings (${warnings.length}):`,
          ...warnings.map((entry) => `  - ${entry.text.slice(0, 200)}`),
          "ancestor chain:",
          ...layout.chain.map(
            (row) =>
              `  <${row.tag}> h=${row.clientHeight} sh=${row.scrollHeight} oy=${row.overflowY} .${row.cls}`,
          ),
          "────────────────────────────────────────────────────────────",
        ].join("\n"),
      );

      expect(layout.hydrated, "the probe must hydrate before any measurement").toBe("true");

      // The probe is designed to need NO runtime transport: the agent is registered locally,
      // so the provider configures no `runtimeUrl`. The stubs registered above exist only so
      // that an unexpected request can never reach MDE's authenticated route. This assertion
      // is what makes the intended architecture executable rather than merely logged —
      // without it, a future CopilotKit change could start runtime discovery, be quietly
      // satisfied by the stub, and leave the "no runtime transport required" claim false.
      expect(
        runtimeInfoRequests,
        "the virtualization probe must not require runtime transport",
      ).toEqual([]);

      // The virtualized branch is the only one that emits `data-index`.
      expect(layout.mountedRows, "mounted virtual rows ([data-index])").toBeGreaterThan(0);
      expect(layout.mountedRows, "mounted rows must be far below the logical count").toBeLessThan(
        MESSAGE_COUNT / 2,
      );

      expect(scrollerMetrics, "a height-constrained scroll viewport must exist").not.toBeNull();
      expect(scrollerMetrics!.clientHeight, "scroller clientHeight").toBeGreaterThan(0);
      expect(scrollerMetrics!.scrollHeight, "content must exceed the viewport").toBeGreaterThan(
        scrollerMetrics!.clientHeight,
      );

      // Real content reached the DOM, not just row shells.
      expect(await page.getByText(ROW_TEXT).count()).toBeGreaterThan(0);
    });

    test("both ends of the conversation are reachable by real scrolling", async ({ page }) => {
      await expect(page.getByTestId("copilot-message-list")).toBeVisible({ timeout: 20_000 });

      const scroller = await findScroller(page);
      expect(
        await scroller.evaluate((node: HTMLElement | null) => Boolean(node)),
        "scroll container",
      ).toBe(true);

      // Real wheel gestures, not scripted `scrollTop` assignments: the default
      // `autoScroll="pin-to-bottom"` view deliberately re-pins itself to the newest message,
      // and the underlying stick-to-bottom hook only releases that lock on genuine scroll
      // intent — so a programmatic `scrollTop = 0` is immediately undone. Measured, not
      // assumed: the programmatic version never brought row 0 into the viewport in 20s.
      const box = await scroller.evaluate((node: HTMLElement) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      await page.mouse.move(box.x, box.y);

      // Up: the first logical row must become reachable again, with its text rendered.
      await expect
        .poll(
          async () => {
            await page.mouse.wheel(0, -9000);
            return rowInViewport(scroller, 0);
          },
          { timeout: 30_000, intervals: [250] },
        )
        .toBe(true);
      await expect(page.getByText(FIRST, { exact: true })).toBeVisible({ timeout: 20_000 });

      // Down: the final logical row must become reachable again.
      await expect
        .poll(
          async () => {
            await page.mouse.wheel(0, 9000);
            return rowInViewport(scroller, LAST_INDEX);
          },
          { timeout: 30_000, intervals: [250] },
        )
        .toBe(true);
    });

    test("virtualization is enabled, the agent resolved, and the browser is clean", async ({
      page,
    }) => {
      await expect(page.getByTestId("copilot-message-list")).toBeVisible({ timeout: 20_000 });

      const { mountedRows, hydrated } = await readLayout(page);
      expect(hydrated, "the probe must hydrate").toBe("true");
      expect(mountedRows, "virtualization must engage, so fewer than 500 rows mount").toBeLessThan(
        MESSAGE_COUNT,
      );

      const allConsole = consoleMessages.map((entry) => entry.text).join("\n");
      expect(allConsole, "no virtualization-disabled warning").not.toMatch(
        /clientHeight\s*=\s*0|virtualization disabled|disables virtualization/i,
      );
      // The precise failure this probe was built to stop trusting: an agent that never
      // resolves aborts the client render and makes an unvirtualized DOM look authoritative.
      expect(allConsole, "useAgent must resolve, not throw").not.toMatch(/useAgent:.*not found/i);

      const errors = consoleMessages.filter((entry) => entry.type === "error");
      expect(errors.map((entry) => entry.text).join("\n"), "unexpected console errors").toBe("");
      expect(pageErrors.join("\n"), "unexpected page errors").toBe("");
    });
  },
);
