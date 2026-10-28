// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  messages: [] as Array<{ role?: string; content?: string; toolCalls?: Array<{ id: string; function: { name: string } }> }>,
  mergePinsByCategory: vi.fn(),
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent: { messages: testState.messages } }),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ mergePinsByCategory: testState.mergePinsByCategory }),
}));
vi.mock("@/lib/normalize-tool-envelope", () => ({ isFinishedToolPayload: () => true }));
vi.mock("@/platform/maps/normalize-tool-output", () => ({
  normalizeToolOutput: (_category: string, result: { pins: unknown[] }) => ({ pins: result.pins }),
}));
import { SearchToolResultScope } from "@/components/copilot/search-tool-result-ownership";
import { ToolPinsSync } from "@/components/copilot/tool-pins-sync";

let root: Root;
let element: HTMLDivElement;
const user = (text: string) => ({ role: "user", content: text });
const call = (id: string) => ({ role: "assistant", toolCalls: [{ id, function: { name: "searchEventsTool" } }] });
const rendered = (id: string, pins: unknown[]) => createElement(SearchToolResultScope, { toolCallId: id },
  createElement(ToolPinsSync, { category: "event", result: { pins } }));

beforeEach(() => {
  testState.messages = [];
  testState.mergePinsByCategory.mockReset();
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
});
afterEach(() => { act(() => root.unmount()); element.remove(); });

describe("SAN-1407 map source ordering", () => {
  it("keeps B pins after A arrives late or its old component remounts", () => {
    testState.messages = [user("salsa"), call("A")];
    act(() => root.render(rendered("A", [{ id: "event-salsa", lat: 6.2, lng: -75.5 }])));
    expect(testState.mergePinsByCategory).toHaveBeenLastCalledWith("event", [expect.objectContaining({ id: "event-salsa" })]);
    testState.messages = [...testState.messages, user("techno"), call("B")];
    act(() => root.render(rendered("B", [{ id: "event-techno", lat: 6.3, lng: -75.6 }])));
    expect(testState.mergePinsByCategory).toHaveBeenLastCalledWith("event", [expect.objectContaining({ id: "event-techno" })]);
    const count = testState.mergePinsByCategory.mock.calls.length;
    act(() => root.render(rendered("A", [{ id: "event-old-late", lat: 6.4, lng: -75.7 }])));
    expect(testState.mergePinsByCategory).toHaveBeenCalledTimes(count);
  });
  it("clears current empty B but rejects late empty A", () => {
    testState.messages = [user("salsa"), call("A"), user("techno"), call("B")];
    act(() => root.render(rendered("B", [])));
    expect(testState.mergePinsByCategory).toHaveBeenLastCalledWith("event", []);
    const count = testState.mergePinsByCategory.mock.calls.length;
    act(() => root.render(rendered("A", [])));
    expect(testState.mergePinsByCategory).toHaveBeenCalledTimes(count);
  });
});
