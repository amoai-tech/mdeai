import { describe, expect, it } from "vitest";
import { isCurrentDiscoveryToolCall } from "@/components/copilot/search-tool-result-ownership";

const call = (id: string, name = "searchEventsTool") => ({
  role: "assistant", toolCalls: [{ id, function: { name } }],
});
const user = (text: string) => ({ role: "user", content: text });

describe("SAN-1407 newest search owns results and pins", () => {
  it("allows A until B starts, then ignores A even when its result finishes last", () => {
    const a = [user("salsa"), call("call-a")];
    expect(isCurrentDiscoveryToolCall(a, "call-a")).toBe(true);
    const b = [...a, user("techno"), call("call-b")];
    expect(isCurrentDiscoveryToolCall(b, "call-b")).toBe(true);
    expect(isCurrentDiscoveryToolCall([...b, { role: "tool", toolCallId: "call-a", content: "{}" }], "call-a")).toBe(false);
  });
  it("blocks an old search when a newer user message is pending without its tool call", () => {
    expect(isCurrentDiscoveryToolCall([user("A"), call("call-a"), user("B")], "call-a")).toBe(false);
  });
  it("does not allow old-thread tool calls after switching to a new thread", () => {
    expect(isCurrentDiscoveryToolCall([user("fresh thread")], "old-call")).toBe(false);
  });
  it("ignores unrelated booking tools when choosing the current search", () => {
    const a = [user("events"), call("call-event"), call("booking", "bookVenueTool")];
    expect(isCurrentDiscoveryToolCall(a, "call-event")).toBe(true);
  });
  it("keeps different search types from the same user turn eligible", () => {
    const messages = [
      user("events and restaurants in Laureles"),
      call("events"),
      call("restaurants", "searchRestaurantsTool"),
    ];
    expect(isCurrentDiscoveryToolCall(messages, "events")).toBe(true);
    expect(isCurrentDiscoveryToolCall(messages, "restaurants")).toBe(true);
  });
  it("allows catalog results and web citations in one event-search turn", () => {
    const messages = [
      user("salsa this weekend"),
      call("events"),
      call("web-events", "searchWebGroundedEventsTool"),
    ];
    expect(isCurrentDiscoveryToolCall(messages, "events")).toBe(true);
    expect(isCurrentDiscoveryToolCall(messages, "web-events")).toBe(true);
  });
  it("supersedes earlier calls of the same search type, including legacy aliases", () => {
    const messages = [
      user("find events"),
      call("old", "search-events"),
      call("new", "searchEventsTool"),
    ];
    expect(isCurrentDiscoveryToolCall(messages, "old")).toBe(false);
    expect(isCurrentDiscoveryToolCall(messages, "new")).toBe(true);
  });
});
