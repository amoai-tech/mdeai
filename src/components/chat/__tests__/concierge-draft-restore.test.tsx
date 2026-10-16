// @vitest-environment jsdom
/**
 * SAN-1507 — a visitor who asked the AI while signed out, signed in, and came back to /chat finds the
 * question in the composer: editable, not sent, and only once.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
const setText = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: session.user, loading: false }) }));
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatView: (props: { onInputChange?: (v: string) => void }) => {
    setText.mockImplementation(() => undefined);
    return <div data-has-setter={String(Boolean(props.onInputChange))} />;
  },
  CopilotChatMessageView: () => null,
}));
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({ useConciergeSendHandlers: () => ({}) }));
vi.mock("@/components/chat/concierge-transcript-tail", () => ({
  ConciergeTranscriptTail: () => null,
  useTranscriptTailHasContent: () => false,
}));

import { ConciergeChatView } from "@/components/chat/concierge-copilot-chat-view";
import { stashConciergeDraft } from "@/lib/concierge-draft-store";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  window.sessionStorage.clear();
  session.user = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (onInputChange: (v: string) => void) =>
  act(() => root.render(<ConciergeChatView onInputChange={onInputChange} />));

describe("restoring a stashed question after sign-in", () => {
  it("puts it in the composer once the visitor is signed in, and does not send it", () => {
    stashConciergeDraft("What is a good day trip?");
    session.user = { id: "u1" };
    const onInputChange = vi.fn();
    mount(onInputChange);
    expect(onInputChange).toHaveBeenCalledTimes(1);
    expect(onInputChange).toHaveBeenCalledWith("What is a good day trip?");
    expect(window.sessionStorage.getItem("mde.concierge.draft")).toBeNull();
  });

  it("keeps it while the visitor is still signed out (back button from /login)", () => {
    stashConciergeDraft("still here");
    const onInputChange = vi.fn();
    mount(onInputChange);
    expect(onInputChange).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("mde.concierge.draft")).not.toBeNull();
  });

  it("does nothing when there is no stashed question", () => {
    session.user = { id: "u1" };
    const onInputChange = vi.fn();
    mount(onInputChange);
    expect(onInputChange).not.toHaveBeenCalled();
  });
});
