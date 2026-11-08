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
const STABLE_AGENT = { messages: [] as Msg[], isRunning: false, threadId: "" };
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
  STABLE_AGENT.threadId = THREAD;
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
    expect(lastBody().messages).toEqual([
      { id: "u1", role: "user", content: "Which rental leads need my attention?" },
    ]);
  });

  it("saves the question as it is sent, but claims reloadable only after the answer", async () => {
    agentMessages = [{ id: "u1", role: "user", content: "Which leads?" }];
    render(<BrokerThreadSaver threadId={THREAD} />);
    // Stamped at send time: the history reader orders by createdAt, so waiting for the reply
    // would place the question *after* the answer the runtime already wrote.
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    expect(lastBody().messages.map((m) => m.id)).toEqual(["u1"]);
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("never sends a streaming fragment, even while the run is in flight", async () => {
    agentRunning = true;
    agentMessages = [
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "partial…" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls().length).toBeGreaterThan(0));
    expect(lastBody().messages.map((m) => m.role)).toEqual(["user"]);
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("skips tool traffic in the body", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which leads?" },
      { id: "t1", role: "assistant", content: "" },
      { id: "a1", role: "assistant", content: "Zero leads." },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(lastBody().messages.map((m) => m.id)).toEqual(["u1"]);
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
    expect(lastBody().messages.map((m) => m.id)).toEqual(["u1"]);
  });

  it("saves a second turn through the same stable agent object", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "q1" },
      { id: "a1", role: "assistant", content: "a1" },
    ];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalled());
    const firstCount = markThreadSaved.mock.calls.length;

    agentMessages = [...agentMessages, { id: "u2", role: "user", content: "q2" }, { id: "a2", role: "assistant", content: "a2" }];
    rerender(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved.mock.calls.length).toBeGreaterThan(firstCount));
    expect(calls().some(([, opts]) => String(opts.body).includes('"u2"'))).toBe(true);
  });

  it("keeps each save within the endpoint's four-message limit, oldest first", async () => {
    // Six completed exchanges: each question is followed by its reply, and only the questions
    // are posted (the runtime stores the replies).
    agentMessages = Array.from({ length: 6 }, (_, i) => ([
      { id: `m${i}`, role: "user" as Msg["role"], content: `line ${i}` },
      { id: `r${i}`, role: "assistant" as Msg["role"], content: `answer ${i}` },
    ])).flat();
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(2));
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalled());
    const bodies = calls().map(([, opts]) => JSON.parse(String(opts.body)) as { messages: Msg[] });
    expect(bodies.every((body) => body.messages.length <= 4)).toBe(true);
    // Oldest first: the tail-slicing bug dropped these.
    expect(bodies[0].messages[0].id).toBe("m0");
    expect(bodies.flatMap((body) => body.messages).every((m) => m.role === "user")).toBe(true);
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


describe("broker thread saver: complete and correctly scoped history", () => {
  it("drains every question beyond the four-message API batch limit", async () => {
    agentMessages = Array.from({ length: 6 }, (_, i) => ([
      { id: `multi${i}`, role: "user" as Msg["role"], content: `message ${i}` },
      { id: `reply${i}`, role: "assistant" as Msg["role"], content: `reply ${i}` },
    ])).flat();
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(2));
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalled());
    const ids = calls().flatMap(([, opts]) => (JSON.parse(String(opts.body)) as { messages: Msg[] }).messages.map(m => m.id));
    expect(ids).toEqual(agentMessages.filter(m => m.role === "user").map(m => m.id));
  });

  it("starts fresh when the user selects a different thread", async () => {
    const second = "22222222-3333-4333-8333-555555555555";
    agentMessages = [
      { id: "u1", role: "user", content: "first question" },
      { id: "a1", role: "assistant", content: "first answer" },
    ];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    agentMessages = [
      { id: "u2", role: "user", content: "next conversation" },
      { id: "a2", role: "assistant", content: "next answer" },
    ];
    STABLE_AGENT.threadId = second;
    rerender(<BrokerThreadSaver threadId={second} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(second));
    expect(calls().at(-1)![0]).toBe(`/api/threads/${second}/messages`);
    expect(lastBody().messages.map(m => m.id)).toEqual(["u2"]);
  });

  it("waits for the agent to select the new thread rather than misfile old messages", async () => {
    const next = "33333333-4444-4333-8333-555555555555";
    agentMessages = [
      { id: "oldUser", role: "user", content: "old question" },
      { id: "oldAnswer", role: "assistant", content: "old answer" },
    ];
    STABLE_AGENT.threadId = THREAD;
    render(<BrokerThreadSaver threadId={next} />);
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(calls()).toHaveLength(0);
  });

  it("persists a reply even if three tool-only messages separate it from the question", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which leads need my attention?" },
      { id: "t1", role: "assistant", content: "" },
      { id: "t2", role: "assistant", content: "" },
      { id: "t3", role: "assistant", content: "" },
      { id: "a1", role: "assistant", content: "No pending leads" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    const ids = calls().flatMap(([, opts]) => (JSON.parse(String(opts.body)) as { messages: Msg[] }).messages.map(m => m.id));
    expect(ids).toEqual(["u1"]);
  });
});


describe("broker restored history is not re-saved", () => {
  it("waits for the owner-checked restore and writes only new turns", async () => {
    agentMessages = [
      { id: "savedU", role: "user", content: "saved question" },
      { id: "savedA", role: "assistant", content: "saved answer" },
    ];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} restoreMode="waiting" />);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(calls()).toHaveLength(0);

    rerender(<BrokerThreadSaver threadId={THREAD} restoreMode="restored"
      restoredMessageIds={["savedU", "savedA"]} />);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(calls()).toHaveLength(0);

    agentMessages = [
      ...agentMessages,
      { id: "newU", role: "user", content: "new question" },
      { id: "newA", role: "assistant", content: "new answer" },
    ];
    rerender(<BrokerThreadSaver threadId={THREAD} restoreMode="restored"
      restoredMessageIds={["savedU", "savedA"]} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(calls()).toHaveLength(1);
    expect(lastBody().messages.map(m => m.id)).toEqual(["newU"]);
  });
});


describe("broker history recovery during restore", () => {
  it("saves a new exchange that was sent before the history GET finished", async () => {
    agentMessages = [
      { id: "savedU", role: "user", content: "previous question" },
      { id: "savedA", role: "assistant", content: "previous answer" },
      { id: "newU", role: "user", content: "new question" },
      { id: "newA", role: "assistant", content: "new answer" },
    ];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} restoreMode="waiting" />);
    expect(calls()).toHaveLength(0);
    rerender(<BrokerThreadSaver threadId={THREAD} restoreMode="restored"
      restoredMessageIds={["savedU", "savedA"]} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(calls()).toHaveLength(1);
    expect(lastBody().messages.map(m => m.id)).toEqual(["newU"]);
  });

  it("a failed history GET does not block saving a later successful turn", async () => {
    agentMessages = [
      { id: "userAfterError", role: "user", content: "Can you still help?" },
      { id: "answerAfterError", role: "assistant", content: "Yes, here is your answer" },
    ];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} restoreMode="waiting" />);
    expect(calls()).toHaveLength(0);
    rerender(<BrokerThreadSaver threadId={THREAD} restoreMode="failed" />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(lastBody().messages.map(m => m.id)).toEqual(["userAfterError"]);
  });
});

describe("the runtime already stores replies", () => {
  it("posts questions only, so one answer is not stored twice", async () => {
    agentMessages = [
      { id: "u1", role: "user", content: "Which rental leads need my attention?" },
      { id: "a1", role: "assistant", content: "You have no viewing requests that need attention." },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    // Mastra persists the reply as `<id>-agui-text`; posting the plain id as well made the
    // restored transcript show the same answer twice.
    expect(lastBody().messages.map((m) => m.role)).toEqual(["user"]);
  });
});

describe("a finished answer makes the thread reloadable", () => {
  it("marks the thread saved when the question was posted before the answer existed", async () => {
    agentRunning = true;
    agentMessages = [{ id: "u1", role: "user", content: "Which leads?" }];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    // The question is posted at send time; the answer does not exist yet, so nothing is claimed.
    expect(markThreadSaved).not.toHaveBeenCalled();

    agentMessages = [
      { id: "u1", role: "user", content: "Which leads?" },
      { id: "a1", role: "assistant", content: "No leads need your attention." },
    ];
    agentRunning = false;
    rerender(<BrokerThreadSaver threadId={THREAD} />);

    // Nothing new to post, so the claim must not depend on another POST happening.
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
    expect(calls()).toHaveLength(1);
  });

  it("does not mark the thread saved when the latest question has no answer yet", async () => {
    // u1 answered, then a second question whose run has not produced an answer.
    agentMessages = [
      { id: "u1", role: "user", content: "first" },
      { id: "a1", role: "assistant", content: "answer one" },
      { id: "u2", role: "user", content: "second" },
    ];
    render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 60));
    // An earlier answer must not label the unanswered question as restorable.
    expect(markThreadSaved).not.toHaveBeenCalled();
  });

  it("retries a rejected question once per run, not on every streamed chunk", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    agentRunning = true;
    agentMessages = [{ id: "u1", role: "user", content: "q" }];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(1));

    // The reply streams in: several renders, none may re-send the rejected question.
    for (const chunk of ["par", "partial", "partial answer"]) {
      agentMessages = [
        { id: "u1", role: "user", content: "q" },
        { id: "a1", role: "assistant", content: chunk },
      ];
      rerender(<BrokerThreadSaver threadId={THREAD} />);
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(calls()).toHaveLength(1);
  });

  it("retries a failed question exactly once when the run ends", async () => {
    // First save fails, the reply finishes, then the retry succeeds.
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempt += 1;
      return new Response("{}", { status: attempt === 1 ? 503 : 200 });
    }));
    agentRunning = true;
    agentMessages = [{ id: "u1", role: "user", content: "q" }];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(1));

    agentMessages = [
      { id: "u1", role: "user", content: "q" },
      { id: "a1", role: "assistant", content: "the answer" },
    ];
    agentRunning = false;
    rerender(<BrokerThreadSaver threadId={THREAD} />);

    // The advertised retry has to actually happen, not just be promised in a comment.
    await vi.waitFor(() => expect(calls()).toHaveLength(2));
    await vi.waitFor(() => expect(markThreadSaved).toHaveBeenCalledWith(THREAD));
  });

  it("stops after one post-run retry when the server keeps failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    agentRunning = true;
    agentMessages = [{ id: "u1", role: "user", content: "q" }];
    const { rerender } = render(<BrokerThreadSaver threadId={THREAD} />);
    await vi.waitFor(() => expect(calls()).toHaveLength(1));

    for (let i = 0; i < 4; i++) {
      agentMessages = [
        { id: "u1", role: "user", content: "q" },
        { id: "a1", role: "assistant", content: `chunk ${i}` },
      ];
      rerender(<BrokerThreadSaver threadId={THREAD} />);
      await new Promise((r) => setTimeout(r, 30));
    }
    agentRunning = false;
    rerender(<BrokerThreadSaver threadId={THREAD} />);
    await new Promise((r) => setTimeout(r, 120));

    // Two attempts total: the original and the single post-run retry. No loop.
    expect(calls()).toHaveLength(2);
    expect(markThreadSaved).not.toHaveBeenCalled();
  });
});
