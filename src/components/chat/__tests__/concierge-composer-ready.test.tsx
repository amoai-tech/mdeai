// @vitest-environment jsdom
/**
 * The chat composer is server-rendered. Before the page's JavaScript attaches, typing or pressing
 * Enter does nothing and the typed text is wiped on load, so a renter's first message was lost
 * (3 of 6 early sends on production). The textarea must be disabled in the server HTML and enabled
 * once the client has hydrated. These tests render the REAL ConciergeChatView wrapper; only the
 * CopilotKit view it hands the composer props to is replaced by a plain textarea.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

vi.mock("@copilotkit/react-core/v2", () => {
  const CopilotChatView = (props: { input?: { textArea?: Record<string, unknown>; onSubmitMessage?: (text: string) => void } }) => (
    <>
      <textarea placeholder="Type a message..." readOnly {...(props.input?.textArea ?? {})} />
      <button type="button" onClick={() => props.input?.onSubmitMessage?.("Italian restaurants?")}>Send test message</button>
    </>
  );
  return { CopilotChatView, CopilotChatMessageView: () => null };
});
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({ useConciergeSendHandlers: () => ({}) }));
vi.mock("@/components/chat/concierge-transcript-tail", () => ({
  ConciergeTranscriptTail: () => null,
  useTranscriptTailHasContent: () => false,
}));

vi.mock("@/lib/concierge-send-user-message", () => ({
  sendConciergeUserMessage: vi.fn(async () => true),
}));

import { ConciergeChatView, conciergeComposerInput } from "@/components/chat/concierge-copilot-chat-view";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
const mockedSend = vi.mocked(sendConciergeUserMessage);


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
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSend.mockResolvedValue(true);
  });

  async function mountComposer() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<ConciergeChatView />));
    const button = container.querySelector("button") as HTMLButtonElement;
    return {
      button,
      unmount: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  }

  it("coalesces two overlapping callbacks for one pending question into one submission", async () => {
    let finish!: () => void;
    mockedSend.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      finish = () => resolve(true);
    }));
    const { button, unmount } = await mountComposer();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0]?.[2]).toEqual(expect.any(String));
    await act(async () => { finish(); });
    await unmount();
  });

  it("lets deliberate identical questions submit again after the first completes", async () => {
    const { button, unmount } = await mountComposer();
    await act(async () => { button.click(); });
    await act(async () => { button.click(); });
    expect(mockedSend).toHaveBeenCalledTimes(2);
    const [first, second] = mockedSend.mock.calls;
    expect(first[2]).not.toBe(second[2]);
    await unmount();
  });

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
