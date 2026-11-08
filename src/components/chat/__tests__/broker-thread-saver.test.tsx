// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The broker chat runs on the shared chat provider but had no writer, so a broker's
 * conversation vanished on reload. This pins the writer: finished turns go to the same
 * history endpoint /chat replays, and only then is the thread marked reloadable.
 */
const markThreadSaved = vi.fn();
let agentMessages: { id: string; role: "user" | "assistant"; content: string }[] = [];
let agentRunning = false;

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({
    agent: { messages: agentMessages, isRunning: agentRunning },
    isReady: true,
  }),
  UseAgentUpdate: { OnMessagesChanged: "messages", OnRunStatusChanged: "run" },
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useThreadNav: () => ({ markThreadSaved }),
}));

import { BrokerThreadSaver } from "@/components/chat/chat-provider";

const THREAD = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  markThreadSaved.mockReset();
  agentMessages = [];
  agentRunning = false;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

const send = () =>
  (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock;

describe("broker thread persistence", () => {
  it("saves a finished exchange and marks the thread reloadable", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which rental leads need my attention?" },
      { id: "a1", role: "assistant", content: "Zero leads need your attention." },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));

    const [url, init] = send().calls.at(-1)!;
    expect(url).toBe(`/api/threads/${THREAD}/messages`);
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [
        { id: "u1", role: "user", content: "Which rental leads need my attention?" },
        { id: "a1", role: "assistant", content: "Zero leads need your attention." },
      ],
    });
  });

  it("does not save while only the question exists", async () => {
    agentMessages = [{ id: "u1", role: "user", content: "Which rental leads need my attention?" }];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(send().calls).toHaveLength(0);
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("never claims success when the server rejects the save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    agentMessages = [
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "a" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(send().calls.length).toBeGreaterThan(0));
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("waits for the run to finish, so a streamed first chunk is not saved as the answer", async () => {
    agentRunning = true;
    agentMessages = [
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "partial…" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await new Promise((r) => setTimeout(r, 60));
    expect(send().calls).toHaveLength(0);
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("skips tool traffic but still advances past it", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which leads?" },
      { id: "t1", role: "assistant", content: "" },
      { id: "a1", role: "assistant", content: "Zero leads." },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    const body = JSON.parse(String(send().calls.at(-1)![1].body)) as { messages: { id: string }[] };
    expect(body.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("keeps each save within the endpoint's four-message limit", async () => {
    agentMessages = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `line ${i}`,
    }));
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(send().calls.length).toBeGreaterThan(0));
    const body = JSON.parse(String(send().calls.at(-1)![1].body)) as { messages: unknown[] };
    expect(body.messages.length).toBeLessThanOrEqual(4);
  });
});
