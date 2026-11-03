// @vitest-environment jsdom
/**
 * SAN-1507 — the sign-in offer shown to a signed-out visitor must be a real link back to /chat
 * through the existing validated return path, and must not look like a "try again" error.
 */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const coagent = vi.hoisted(() => ({
  agent: undefined as { addMessages: ReturnType<typeof vi.fn> } | undefined,
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: coagent.agent, state: {}, setState: () => {} }),
}));

import { ConciergeSignInPrompt } from "@/components/chat/concierge-sign-in-prompt";
import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let show: (text: string) => void;
let clear: () => void;
let notice: (text: string) => void;
let localMessages: Array<{ role: string; content: string }> = [];
function Probe() {
  const { showSignInPrompt, clearLocalMessages, showNotice, messages } = useEventLocalChat();
  useEffect(() => {
    show = showSignInPrompt;
    clear = clearLocalMessages;
    notice = showNotice;
    localMessages = messages;
  });
  return <ConciergeSignInPrompt />;
}

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);
afterEach(() => {
  act(() => root.render(null));
  coagent.agent = undefined;
});

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

  it("keeps guest questions local even if CopilotKit exposes an agent instance", () => {
    const addMessages = vi.fn();
    coagent.agent = { addMessages };
    mount();
    act(() => show("Do I need an account for AI?"));
    expect(localMessages).toEqual([{ id: expect.any(String), role: "user", content: "Do I need an account for AI?" }]);
    expect(addMessages).not.toHaveBeenCalled();
  });

  it("never flushes a queued guest question when an agent becomes available later", () => {
    coagent.agent = undefined;
    mount();
    act(() => show("Guest question before sign in"));
    const addMessages = vi.fn();
    coagent.agent = { addMessages };
    mount();
    expect(addMessages).not.toHaveBeenCalled();
    expect(localMessages.map((m) => m.content)).toContain("Guest question before sign in");
  });

  it("goes away on New chat", () => {
    mount();
    act(() => show("hello"));
    act(() => clear());
    expect(container.querySelector('[data-testid="concierge-sign-in-prompt"]')).toBeNull();
  });

  it("goes away when a newer answer arrives, so it never sits under unrelated results", () => {
    mount();
    act(() => show("hello"));
    act(() => notice("Found 2 rentals"));
    expect(container.querySelector('[data-testid="concierge-sign-in-prompt"]')).toBeNull();
  });
});
