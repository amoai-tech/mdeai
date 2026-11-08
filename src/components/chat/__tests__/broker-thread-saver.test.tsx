// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The broker chat runs on the shared chat provider but had no writer, so a broker's
 * conversation vanished on reload. These pin the writer, including the four ways it can
 * silently lose or corrupt a transcript: saving mid-stream, choking on tool traffic,
 * slicing the tail instead of batching, and never re-running because `agent` is stable.
 */
type Msg = { id: string; role: "user" | "assistant"; content: string };
let agentMessages: Msg[] = [];
let agentRunning = false;

// CopilotKit hands back ONE mutable agent object. A fresh object per render would mask a
// missing effect dependency, which is exactly the bug this had.
const STABLE_AGENT = { messages: [] as Msg[], isRunning: false };
const markThreadSaved = vi.fn();

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => {
    STABLE_AGENT.messages = agentMessages;
    STABLE_AGENT.isRunning = agentRunning;
    return { agent: STABLE_AGENT, isReady: true };
  },
  UseAgentUpdate: { OnMessagesChanged: "messages", OnRunStatusChanged: "run" },
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useThreadNav: () => ({ markThreadSaved }),
}));

import { BrokerThreadSaver } from "@/components/chat/chat-provider";

const THREAD = "11111111-2222-4333-8444-555555555555";
const calls = () => (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
const lastBody = () => JSON.parse(String(calls().at(-1)![1].body)) as { messages: Msg[] };

beforeEach(() => {
  markThreadSaved.mockReset();
  agentMessages = [];
  agentRunning = false;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("broker thread persistence", () => {
  it("saves a finished exchange and marks the thread reloadable", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which rental leads need my attention?" },
      { id: "a1", role: "assistant", content: "Zero leads need your attention." },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(calls().at(-1)![0]).toBe(`/api/threads/${THREAD}/messages`);
    expect(lastBody().messages).toEqual(agentMessages);
  });

  it("holds a question until its answer arrives", async () => {
    agentMessages = [{ id: "u1", role: "user", content: "Which leads?" }];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await new Promise((r) => setTimeout(r, 60));
    expect(calls()).toHaveLength(0);
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("waits for the run to finish, so a streamed chunk is not saved as the answer", async () => {
    agentRunning = true;
    agentMessages = [
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "partial…" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await new Promise((r) => setTimeout(r, 60));
    expect(calls()).toHaveLength(0);
  });

  it("skips tool traffic in the body", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which leads?" },
      { id: "t1", role: "assistant", content: "" },
      { id: "a1", role: "assistant", content: "Zero leads." },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(lastBody().messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("moves past a window of tool-only traffic instead of stalling", async () => {
    agentMessages = [
      { id: "t1", role: "assistant", content: "" },
      { id: "t2", role: "assistant", content: "" },
      { id: "t3", role: "assistant", content: "" },
      { id: "t4", role: "assistant", content: "" },
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "real answer" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(lastBody().messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("saves a second turn through the same stable agent object", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "q1" },
      { id: "a1", role: "assistant", content: "a1" },
    ];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledTimes(1));

    agentMessages = [...agentMessages, { id: "u2", role: "user", content: "q2" }, { id: "a2", role: "assistant", content: "a2" }];
    rerender(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledTimes(2));
  });

  it("keeps each save within the endpoint's four-message limit, oldest first", async () => {
    agentMessages = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as Msg["role"],
      content: `line ${i}`,
    }));
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls().length).toBeGreaterThan(0));
    const ids = lastBody().messages.map((m) => m.id);
    expect(ids.length).toBeLessThanOrEqual(4);
    // Oldest first: the tail-slicing bug dropped these.
    expect(ids[0]).toBe("m0");
  });

  it("never claims success when the server rejects the save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    agentMessages = [
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "a" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls().length).toBeGreaterThan(0));
    expect(markThreadSaved).not.toHaveBeenCalled();
  });
});
