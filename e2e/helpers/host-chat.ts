import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Host chat helpers. The host surfaces (event wizard, Host OS shell) render
 * CopilotKit's own chat inside their own region, so these scope every lookup
 * to that region and use CopilotKit 1.75.0's built-in test ids
 * (`copilot-chat-textarea`, `copilot-send-button`, `copilot-assistant-message`).
 * Do not reuse the public-chat helpers here: they target `copilot-chat-region`
 * and the concierge's fast paths, which the host pages do not have.
 */
export function hostChatRegion(page: Page): Locator {
  return page
    .locator(
      '[data-testid="host-copilot-chat-region"], [data-testid="host-ops-chat-region"], [data-testid="host-os-chat-region"]',
    )
    .first();
}

/**
 * Type into the host chat, wait for Send to enable, and submit. Returns a
 * function that resolves once a NEW assistant message has rendered and the
 * run's stream has finished, so pre-existing page text never counts as the reply.
 */
export async function sendHostChatMessage(page: Page, text: string): Promise<() => Promise<string>> {
  const region = hostChatRegion(page);
  const input = region.getByTestId("copilot-chat-textarea");
  await input.waitFor({ state: "visible", timeout: 90_000 });
  const replies = region.getByTestId("copilot-assistant-message");
  const before = await replies.count();

  // Real key events: CopilotKit enables Send from its keyboard/input handling,
  // and `fill()` + a synthetic input event left Send disabled on localhost.
  // Retype until the text sticks: on a cold page (the event wizard) keys typed
  // before hydration finishes are wiped by the first client render.
  const sendBtn = region.getByTestId("copilot-send-button");
  await expect(async () => {
    await input.click();
    await input.press("ControlOrMeta+A");
    await input.press("Backspace");
    await input.pressSequentially(text, { delay: 10 });
    await expect(input).toHaveValue(text, { timeout: 2_000 });
    await expect(sendBtn).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });

  const run = page.waitForResponse(
    (r) =>
      r.url().includes("/api/copilotkit") &&
      (r.request().postData() ?? "").includes('"agent/run"'),
    { timeout: 60_000 },
  );
  // A caller that never awaits the returned waiter must not leave an
  // unhandled rejection behind (e.g. the 60s timeout firing after the test).
  run.catch(() => undefined);
  await sendBtn.click();

  return async () => {
    const response = await run;
    expect(response.status(), "host agent/run status").toBe(200);
    await response.finished();
    await expect
      .poll(() => replies.count(), { timeout: 120_000, message: "a new host assistant reply" })
      .toBeGreaterThan(before);
    return replies.last().innerText();
  };
}
