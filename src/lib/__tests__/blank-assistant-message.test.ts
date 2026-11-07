import { describe, expect, it } from "vitest";
import {
  isBlankAssistantMessage,
  messageText,
  seedBlankLedgerFromHistory,
  shouldReportBlankOnce,
} from "../blank-assistant-message";

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

describe("shouldReportBlankOnce", () => {
  it("reports a blank turn exactly once even when the effect re-runs", () => {
    const ledger = { threadId: "t-1", ids: new Set<string>() };
    expect(shouldReportBlankOnce(ledger, "msg-1")).toBe(true);
    // Every later render sees the same message and must stay quiet.
    expect(shouldReportBlankOnce(ledger, "msg-1")).toBe(false);
    expect(shouldReportBlankOnce(ledger, "msg-1")).toBe(false);
  });

  it("reports a NEW blank turn in the same thread", () => {
    const ledger = { threadId: "t-1", ids: new Set<string>() };
    expect(shouldReportBlankOnce(ledger, "msg-1")).toBe(true);
    expect(shouldReportBlankOnce(ledger, "msg-2")).toBe(true);
  });
});

describe("seedBlankLedgerFromHistory", () => {
  it("never reports a blank reply that was already there when the thread opened", () => {
    const ledger = { threadId: "t-1", ids: new Set<string>(), seeded: false };
    // Restored transcript from an earlier visit, ending on a blank assistant message.
    seedBlankLedgerFromHistory(ledger, ["m-1", "m-2"]);
    expect(shouldReportBlankOnce(ledger, "m-2")).toBe(false);
  });

  it("still reports a blank turn that arrives after the thread opened", () => {
    const ledger = { threadId: "t-1", ids: new Set<string>(), seeded: false };
    seedBlankLedgerFromHistory(ledger, ["m-1", "m-2"]);
    expect(shouldReportBlankOnce(ledger, "m-3")).toBe(true);
  });

  it("waits for the restored transcript before seeding", () => {
    const ledger = { threadId: "t-1", ids: new Set<string>(), seeded: false };
    seedBlankLedgerFromHistory(ledger, []);
    expect(ledger.seeded).toBe(false);
    seedBlankLedgerFromHistory(ledger, ["m-1"]);
    expect(ledger.seeded).toBe(true);
  });
});
