import { describe, expect, it } from "vitest";
import { plainTurns, type AgentMessage } from "../rental-ask-tool-results";

/**
 * A tool-only assistant step has no text. Before this fix the transcript went
 * blank: the renter asked, the agent searched or tried to render, and nothing
 * appeared. These cases pin one honest line per tool-only step.
 */
const renderUiResult = (payload: unknown) => JSON.stringify(payload);

describe("plainTurns — tool-only steps always leave something readable", () => {
  it("reports a successful render", () => {
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", content: "show two apartments" },
      {
        id: "a1",
        role: "assistant",
        toolCalls: [{ id: "c1", function: { name: "render_ui" } }],
      },
      { id: "t1", role: "tool", toolCallId: "c1", content: renderUiResult({ status: "rendered", applied: 2, rejected: [] }) },
    ];
    const turns = plainTurns(messages);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(turns[1].text).toBe("Updated the recommendations.");
  });

  it("reports a rejected render instead of staying silent", () => {
    const messages: AgentMessage[] = [
      {
        id: "a1",
        role: "assistant",
        toolCalls: [{ id: "c1", function: { name: "render_ui" } }],
      },
      {
        id: "t1",
        role: "tool",
        toolCallId: "c1",
        content: renderUiResult({ status: "rendered", applied: 0, rejected: [{ index: 0, reason: 'operation needs "version":"1.0"' }] }),
      },
    ];
    const turns = plainTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("I couldn't display those cards. Try asking again.");
  });

  it("names a search and an opened detail", () => {
    const messages: AgentMessage[] = [
      {
        id: "a1",
        role: "assistant",
        toolCalls: [
          { id: "s1", function: { name: "searchRentalsTool" } },
          { id: "d1", function: { name: "openRentalDetails" } },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "s1", content: "{\"results\":[]}" },
      { id: "t2", role: "tool", toolCallId: "d1", content: "Opened details." },
    ];
    expect(plainTurns(messages).map((t) => t.text)).toEqual([
      "Searched the listings and updated the results.",
      "Opened the details for that apartment.",
    ]);
  });

  it("keeps a normal written answer and does not add a synthetic line", () => {
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", content: "which of these is best?" },
      { id: "a1", role: "assistant", content: "The Laureles one fits your budget." },
    ];
    expect(plainTurns(messages)).toEqual([
      { id: "u1", role: "user", text: "which of these is best?" },
      { id: "a1", role: "assistant", text: "The Laureles one fits your budget." },
    ]);
  });

  it("never emits an empty turn", () => {
    const messages: AgentMessage[] = [
      { id: "a1", role: "assistant", content: "   " },
      { id: "u1", role: "user", content: "" },
    ];
    expect(plainTurns(messages)).toEqual([]);
  });
});
