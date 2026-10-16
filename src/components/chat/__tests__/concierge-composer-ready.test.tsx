// @vitest-environment jsdom
/**
 * The chat composer is server-rendered. Before the page's JavaScript attaches, typing or pressing
 * Enter does nothing and the typed text is wiped on load, so a renter's first message was lost
 * (3 of 6 early sends on production). The textarea must be disabled in the server HTML and enabled
 * once the client has hydrated. These tests render the REAL ConciergeChatView wrapper; only the
 * CopilotKit view it hands the composer props to is replaced by a plain textarea.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

vi.mock("@copilotkit/react-core/v2", () => {
  const CopilotChatView = (props: { input?: { textArea?: Record<string, unknown> } }) => (
    <textarea placeholder="Type a message..." readOnly {...(props.input?.textArea ?? {})} />
  );
  return { CopilotChatView, CopilotChatMessageView: () => null };
});
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({ useConciergeSendHandlers: () => ({}) }));
vi.mock("@/components/chat/concierge-transcript-tail", () => ({
  ConciergeTranscriptTail: () => null,
  useTranscriptTailHasContent: () => false,
}));

import { ConciergeChatView, conciergeComposerInput } from "@/components/chat/concierge-copilot-chat-view";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("conciergeComposerInput", () => {
  const build = (base: unknown, hydrated: boolean) =>
    conciergeComposerInput(base as never, vi.fn(), hydrated) as unknown as { onSubmitMessage: unknown; textArea: Record<string, unknown> };

  it("locks the textarea until hydrated, and keeps the other props", () => {
    expect(build({ textArea: { className: "x" } }, false).textArea).toMatchObject({ disabled: true, className: "x", enterKeyHint: "send" });
    expect(build({ textArea: { className: "x" } }, true).textArea).toMatchObject({ disabled: false, className: "x", enterKeyHint: "send" });
  });

  it("keeps a composer the caller disabled for its own reasons disabled after hydration", () => {
    expect(build({ textArea: { disabled: true } }, true).textArea.disabled).toBe(true);
  });

  it("always wires our submit handler", () => {
    const onSubmit = vi.fn();
    const input = conciergeComposerInput(undefined, onSubmit, false) as unknown as { onSubmitMessage: unknown };
    expect(input.onSubmitMessage).toBe(onSubmit);
  });
});

describe("the real ConciergeChatView wrapper", () => {
  it("renders the composer disabled in the server HTML", () => {
    expect(renderToString(<ConciergeChatView />)).toMatch(/<textarea[^>]*\bdisabled(=""|\s|>)/);
  });

  it("enables the composer once the client has rendered", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<ConciergeChatView />));
    expect((container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(false);
    await act(async () => root.unmount());
    container.remove();
  });
});
