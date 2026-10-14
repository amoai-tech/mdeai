// @vitest-environment jsdom
/**
 * The chat composer is server-rendered. Before the page's JavaScript attaches, typing or pressing
 * Enter does nothing and the typed text is wiped on load, so a renter's first message was lost
 * (3 of 6 early sends on production). The textarea must be disabled in the server HTML and enabled
 * once the client has hydrated.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { conciergeComposerInput } from "@/components/chat/concierge-copilot-chat-view";
import { useHydrated } from "@/hooks/use-hydrated";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function textAreaOf(hydrated: boolean) {
  const input = conciergeComposerInput({ textArea: { className: "x" } } as never, vi.fn(), hydrated) as unknown as {
    onSubmitMessage: unknown;
    textArea: Record<string, unknown>;
  };
  return input;
}

describe("conciergeComposerInput", () => {
  it("locks the textarea until hydrated, and keeps the other props", () => {
    expect(textAreaOf(false).textArea).toMatchObject({ disabled: true, className: "x", enterKeyHint: "send" });
    expect(textAreaOf(true).textArea).toMatchObject({ disabled: false, className: "x", enterKeyHint: "send" });
  });

  it("always wires our submit handler", () => {
    const onSubmit = vi.fn();
    const input = conciergeComposerInput(undefined, onSubmit, false) as unknown as { onSubmitMessage: unknown };
    expect(input.onSubmitMessage).toBe(onSubmit);
  });
});

function Probe() {
  const hydrated = useHydrated();
  const { textArea } = textAreaOf(hydrated);
  return <textarea placeholder="Type a message…" disabled={textArea.disabled as boolean} readOnly />;
}

describe("composer in the server HTML versus after the client takes over", () => {
  it("is disabled in the server-rendered HTML", () => {
    expect(renderToString(<Probe />)).toMatch(/<textarea[^>]*\bdisabled(=""|\s|>)/);
  });

  it("is enabled once the client has rendered", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Probe />));
    expect((container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(false);
    await act(async () => root.unmount());
    container.remove();
  });
});
