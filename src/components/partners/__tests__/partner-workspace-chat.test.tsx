// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/react-core/v2", async () => {
  const React = await import("react");
  return {
    useAgentContext: vi.fn(),
    CopilotKitProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    CopilotChat: ({ threadId }: { threadId: string }) =>
      React.createElement("div", { "data-testid": "business-thread", "data-thread-id": threadId }),
  };
});

import { PartnerWorkspaceChat } from "../partner-workspace-chat";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const USER_A = "6b51e65f-f7b1-4ad7-9185-f2ecae22eb00";
const USER_B = "92361f88-f24f-4cb8-8025-05ec6c17bb44";
const CAFE_A = "6a9167cc-7cb6-4837-a7e0-2039654f138c";
const CAFE_B = "17243544-7b84-4f74-b631-f3a44c193e40";
let root: Root;
let container: HTMLDivElement;

async function show(userId: string, partnerId: string) {
  await act(async () => {
    root.render(
      <PartnerWorkspaceChat
        key={partnerId}
        userId={userId}
        partnerId={partnerId}
        businessName="Café"
        partnerType="restaurant"
      />,
    );
    await Promise.resolve();
  });
  const element = container.querySelector("[data-testid='business-thread']");
  if (!element) {
    throw new Error("Partner chat thread element was not rendered");
  }
  return element.getAttribute("data-thread-id");
}

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => {
    root.unmount();
  });
  container.remove();
});

describe("SAN-705 UI conversation boundary", () => {
  it("passes an explicit business-specific thread to the existing CopilotChat", async () => {
    const a = await show(USER_A, CAFE_A);
    const b = await show(USER_A, CAFE_B);
    expect(b).not.toBe(a);
    expect(await show(USER_A, CAFE_A)).toBe(a);
  });

  it("does not replay another signed-in user's partner chat in a shared tab", async () => {
    const a = await show(USER_A, CAFE_A);
    const b = await show(USER_B, CAFE_A);
    expect(a).not.toBe(b);
  });
});
