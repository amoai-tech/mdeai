import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Concierge local fast-path transcript placement", () => {
  const center = readFileSync(
    resolve(process.cwd(), "src/components/chat/chat-center-panel.tsx"),
    "utf8",
  );
  const view = readFileSync(
    resolve(process.cwd(), "src/components/chat/concierge-copilot-chat-view.tsx"),
    "utf8",
  );

  it("does not render ConciergeLocalChatMessages in chat-center-panel (moved to view)", () => {
    expect(center).not.toContain("<ConciergeLocalChatMessages");
  });

  it("renders ConciergeLocalChatMessages inside the CopilotChat ScrollView", () => {
    expect(view).toContain("<ConciergeLocalChatMessages");
    expect(view).toContain("scrollView={ConciergeScrollView}");
  });

  it("renders local messages before CopilotKit children for chronological order", () => {
    const localIndex = view.indexOf("<ConciergeLocalChatMessages");
    const childrenIndex = view.indexOf("{children}");
    expect(localIndex).toBeGreaterThan(-1);
    expect(childrenIndex).toBeGreaterThan(-1);
    expect(localIndex).toBeLessThan(childrenIndex);
  });

  it("uses useConciergeLocalChat hook (not useEventLocalChat)", () => {
    expect(view).toContain("useConciergeLocalChat");
    expect(view).not.toContain("useEventLocalChat");
  });

  it("hides welcome screen when local messages exist", () => {
    expect(view).toContain("welcomeScreen={localMessages.length > 0 ? false : props.welcomeScreen}");
  });

  it("uses ConciergeScrollView to inject local messages into scroll view", () => {
    expect(view).toContain("ConciergeScrollView");
    expect(view).toContain("scrollView={ConciergeScrollView}");
  });

  it("wraps local messages in max-width container", () => {
    expect(view).toContain("cpk:max-w-3xl");
    expect(view).toContain("cpk:mx-auto");
  });

  it("uses useConciergeLocalChat for welcome screen logic", () => {
    expect(view).toContain("const { messages: localMessages } = useConciergeLocalChat()");
  });

  it("does not import useEventLocalChat", () => {
    expect(view).not.toContain("useEventLocalChat");
    expect(view).not.toContain("event-local-chat-context");
  });
});