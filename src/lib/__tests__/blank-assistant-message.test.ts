import { describe, expect, it } from "vitest";
import { isBlankAssistantMessage, messageText } from "../blank-assistant-message";

describe("messageText", () => {
  it("reads plain string content", () => {
    expect(messageText({ role: "assistant", content: "Hola" })).toBe("Hola");
  });

  it("joins text parts and ignores non-text parts", () => {
    expect(
      messageText({
        role: "assistant",
        content: [
          { type: "text", text: "Dos " },
          { type: "tool-call", text: undefined },
          { type: "text", text: "apartamentos" },
        ],
      }),
    ).toBe("Dos apartamentos");
  });

  it("returns nothing for a missing or unknown shape", () => {
    expect(messageText({ role: "assistant" })).toBe("");
    expect(messageText({ role: "assistant", content: { nope: 1 } })).toBe("");
  });
});

describe("isBlankAssistantMessage", () => {
  it("flags the B2 symptom: an assistant message that renders nothing", () => {
    expect(isBlankAssistantMessage({ role: "assistant", content: "" })).toBe(true);
    expect(isBlankAssistantMessage({ role: "assistant", content: [] })).toBe(true);
    expect(isBlankAssistantMessage({ role: "assistant", content: "   " })).toBe(true);
  });

  it("never flags a real answer", () => {
    expect(isBlankAssistantMessage({ role: "assistant", content: "Hay dos opciones" })).toBe(false);
  });

  it("never flags an AG-UI assistant tool-call message", () => {
    // { role: "assistant", content: "", toolCalls: [...] } is valid work, not a failure.
    expect(
      isBlankAssistantMessage({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", function: { name: "focusMapPin", arguments: "{}" } }],
      }),
    ).toBe(false);
    expect(
      isBlankAssistantMessage({ role: "assistant", content: "", toolCalls: [] }),
    ).toBe(true);
  });

  it("never flags user messages or tool-only answers", () => {
    expect(isBlankAssistantMessage({ role: "user", content: "" })).toBe(false);
    expect(
      isBlankAssistantMessage({
        role: "assistant",
        content: [{ type: "tool-result", text: "" }],
      }),
    ).toBe(false);
    expect(isBlankAssistantMessage(undefined)).toBe(false);
  });
});
