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
});
