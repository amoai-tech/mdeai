// @vitest-environment jsdom
/**
 * SAN-1507 — the sign-in offer shown to a signed-out visitor must be a real link back to /chat
 * through the existing validated return path, and must not look like a "try again" error.
 */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: undefined, state: {}, setState: () => {} }),
}));

import { ConciergeSignInPrompt } from "@/components/chat/concierge-sign-in-prompt";
import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let show: (text: string) => void;
let clear: () => void;
function Probe() {
  const { showSignInPrompt, clearLocalMessages } = useEventLocalChat();
  useEffect(() => {
    show = showSignInPrompt;
    clear = clearLocalMessages;
  });
  return <ConciergeSignInPrompt />;
}

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

function mount() {
  act(() =>
    root.render(
      <EventLocalChatProvider>
        <Probe />
      </EventLocalChatProvider>,
    ),
  );
}

describe("ConciergeSignInPrompt", () => {
  it("renders nothing until a signed-out visitor asked the AI", () => {
    mount();
    expect(container.querySelector('[data-testid="concierge-sign-in-prompt"]')).toBeNull();
  });

  it("offers a real sign-in link that returns to /chat, and is not an error", () => {
    mount();
    act(() => show("What is a good day trip?"));
    const link = container.querySelector<HTMLAnchorElement>('[data-testid="concierge-sign-in-link"]');
    expect(link?.getAttribute("href")).toBe("/login?next=%2Fchat");
    expect(container.textContent).not.toMatch(/try again|went wrong|timed out/i);
  });

  it("goes away on New chat", () => {
    mount();
    act(() => show("hello"));
    act(() => clear());
    expect(container.querySelector('[data-testid="concierge-sign-in-prompt"]')).toBeNull();
  });
});
