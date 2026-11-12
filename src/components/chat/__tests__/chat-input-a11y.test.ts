// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  CONCIERGE_CHAT_INPUT_ID,
  ensureConciergeChatInputAccessibility,
} from "../chat-input-a11y";

function mountComposer(placeholder = "Type a message..."): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.setAttribute("placeholder", placeholder);
  document.body.append(textarea);
  return textarea;
}

describe("ensureConciergeChatInputAccessibility", () => {
  it("adds an id, name and label to the CopilotKit composer", () => {
    const textarea = mountComposer();
    expect(ensureConciergeChatInputAccessibility()).toBe(true);
    expect(textarea.id).toBe(CONCIERGE_CHAT_INPUT_ID);
    expect(textarea.getAttribute("name")).toBe("message");
    expect(textarea.getAttribute("aria-label")).toBe("Message the concierge");
  });

  it("keeps values the composer already provides", () => {
    const textarea = mountComposer();
    textarea.id = "custom-input";
    textarea.setAttribute("name", "custom");
    ensureConciergeChatInputAccessibility();
    expect(textarea.id).toBe("custom-input");
    expect(textarea.getAttribute("name")).toBe("custom");
  });

  it("does nothing when the composer is not mounted", () => {
    document.body.innerHTML = "";
    expect(ensureConciergeChatInputAccessibility()).toBe(false);
  });
});
