// @vitest-environment jsdom
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatProvider, useSavedThreadHistory } from "@/components/chat/chat-provider";
import { ThreadNavProvider, useThreadNav } from "@/lib/chat/thread-nav-context";

/**
 * SAN-1389 — a reopened saved chat replays its previous messages, once.
 *
 * Real ChatProvider and real thread-nav; only the CopilotKit agent (one fake,
 * shared object, as in the app) and `fetch` are faked, so the ordering rules —
 * not CopilotKit's transport — are what is under test.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Msg = { id: string; role: string; content: string };
class FakeAgent {
  threadId = "";
  isRunning = false;
  messages: Msg[] = [];
  private finalizers = new Set<() => void>();
  setMessages = vi.fn((m: Msg[]) => {
    this.messages = m;
  });
  subscribe(s: { onRunFinalized?: () => void }) {
    const fn = () => s.onRunFinalized?.();
    this.finalizers.add(fn);
    return { unsubscribe: () => this.finalizers.delete(fn) };
  }
  /** CopilotKit core connectAgent: a fresh restore clears the view, then the agent runs. */
  beginConnect() {
    this.messages = [];
    this.isRunning = true;
  }
  finishRun() {
    this.isRunning = false;
    [...this.finalizers].forEach((f) => f());
  }
}

const fakeAgent = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@copilotkit/react-core/v2", async (importOriginal) => {
  const real = await importOriginal<typeof import("@copilotkit/react-core/v2")>();
  return { ...real, useAgent: () => ({ agent: fakeAgent.current }) };
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const msgs = (prefix: string): Msg[] => [
  { id: `${prefix}-u`, role: "user", content: `${prefix} question` },
  { id: `${prefix}-a`, role: "assistant", content: `${prefix} answer` },
];

const seen = {} as {
  nav: ReturnType<typeof useThreadNav>;
  history: ReturnType<typeof useSavedThreadHistory>;
};
function Probe() {
  const nav = useThreadNav();
  const history = useSavedThreadHistory();
  useEffect(() => {
    seen.nav = nav;
    seen.history = history;
  });
  return null;
}

type Deferred = { resolve: (messages: Msg[]) => void; reject: () => void; signal: AbortSignal };
let requests: Record<string, Deferred>;
let agent: FakeAgent;
let container: HTMLDivElement;
let root: Root;

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** CopilotChat pins the thread on the shared agent and (async) starts agent/connect. */
const select = async (id: string | undefined, opts: { connect?: boolean } = {}) => {
  await act(async () => {
    if (id === undefined) seen.nav.clearActiveThread();
    else {
      agent.threadId = id;
      seen.nav.setActiveThreadId(id);
    }
  });
  if (id !== undefined && opts.connect !== false) agent.beginConnect();
};

beforeEach(async () => {
  agent = new FakeAgent();
  fakeAgent.current = agent;
  requests = {};
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      const match = /api\/threads\/([^/]+)\/messages/.exec(url);
      if (!match) return Promise.resolve(new Response("{}", { status: 503 }));
      return new Promise<Response>((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        requests[match[1]] = {
          signal,
          resolve: (messages) => resolve(Response.json({ messages })),
          reject: () => resolve(new Response("{}", { status: 500 })),
        };
      });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ThreadNavProvider>
        <ChatProvider>
          <Probe />
        </ChatProvider>
      </ThreadNavProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saved chat history", () => {
  it("shows loading, installs the saved messages, then releases the chat", async () => {
    await select(A);
    expect(seen.history.status).toBe("loading");
    expect(agent.setMessages).not.toHaveBeenCalled();

    await act(async () => requests[A].resolve(msgs("A")));
    await tick();
    expect(agent.setMessages).not.toHaveBeenCalled(); // CopilotKit is still connecting
    expect(seen.history.status).toBe("loading");

    await act(async () => agent.finishRun());
    await tick();
    expect(agent.messages).toEqual(msgs("A"));
    expect(seen.history.status).toBe("idle");
  });

  it("history that arrives BEFORE CopilotKit starts connecting is not wiped by it", async () => {
    // The real cold reopen: the fetch can win the race, and connectAgent then
    // clears the view as it starts. Watching "is it running right now" would have
    // installed at once and lost the messages.
    await select(A, { connect: false });
    await act(async () => requests[A].resolve(msgs("A")));
    await tick();
    expect(agent.setMessages).not.toHaveBeenCalled();

    agent.beginConnect(); // wipes the view, as CopilotKit's core does
    await act(async () => agent.finishRun());
    await tick();
    expect(agent.messages).toEqual(msgs("A"));
    expect(seen.history.status).toBe("idle");
  });

  it("a fresh New Chat never fetches history and stays empty", async () => {
    await act(async () => seen.nav.clearActiveThread());
    expect(Object.keys(requests)).toEqual([]);
    expect(seen.history.status).toBe("idle");
    expect(agent.setMessages).not.toHaveBeenCalled();
  });

  it("Guard 1 · a late response for A cannot overwrite B", async () => {
    await select(A);
    const lateA = requests[A];
    await select(B);
    expect(lateA.signal.aborted).toBe(true);

    await act(async () => requests[B].resolve(msgs("B")));
    await act(async () => agent.finishRun());
    await tick();
    expect(agent.messages).toEqual(msgs("B"));

    // A answers after B is already on screen: nothing may change.
    await act(async () => lateA.resolve(msgs("A")));
    await tick();
    expect(agent.messages).toEqual(msgs("B"));
    expect(agent.setMessages).toHaveBeenCalledTimes(1);
  });

  it("Guard 1 · even an un-aborted late A is dropped when the thread moved on", async () => {
    await select(A);
    // The agent has already moved to B before A's body is applied.
    agent.threadId = B;
    await act(async () => requests[A].resolve(msgs("A")));
    await tick();
    expect(agent.setMessages).not.toHaveBeenCalled();
  });

  it("Guard 2 · waits for CopilotKit's reconnect, and never duplicates a warm replay", async () => {
    await select(A);
    agent.isRunning = true; // CopilotChat's agent/connect is in flight

    await act(async () => requests[A].resolve(msgs("A")));
    await tick();
    expect(agent.setMessages).not.toHaveBeenCalled(); // still waiting
    expect(seen.history.status).toBe("loading");

    // The warm server replays A itself, then the connect finishes.
    agent.messages = msgs("A");
    await act(async () => agent.finishRun());
    await tick();

    expect(agent.setMessages).not.toHaveBeenCalled();
    expect(agent.messages).toEqual(msgs("A"));
    expect(seen.history.status).toBe("idle");
  });

  it("Guard 2 · a PARTIAL warm replay is completed from the durable history, each message once", async () => {
    const full: Msg[] = [
      { id: "A1", role: "user", content: "Laureles" },
      { id: "A2", role: "assistant", content: "rentals" },
      { id: "A3", role: "user", content: "which has parking?" },
      { id: "A4", role: "assistant", content: "the second" },
    ];
    await select(A);
    agent.isRunning = true;
    await act(async () => requests[A].resolve(full));
    await tick();

    agent.messages = full.slice(2); // the warm runner only remembers turns 3-4
    await act(async () => agent.finishRun());
    await tick();

    expect(agent.messages.map((m) => m.id)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(seen.history.status).toBe("idle");
  });

  it("Guard 2 · a warm replay under DIFFERENT ids is not shown twice", async () => {
    await select(A);
    agent.isRunning = true;
    await act(async () => requests[A].resolve(msgs("A")));
    await tick();

    agent.messages = [
      { id: "agui-1", role: "user", content: "A question" },
      { id: "agui-2", role: "assistant", content: "A answer" },
    ];
    await act(async () => agent.finishRun());
    await tick();

    expect(agent.messages).toEqual(msgs("A"));
  });

  it("a reconnect that never finishes is NOT treated as finished: nothing is installed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await select(A);
      agent.isRunning = true; // agent/connect stays in flight
      await act(async () => requests[A].resolve(msgs("A")));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(agent.setMessages).not.toHaveBeenCalled();
      expect(seen.history.status).toBe("loading");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(agent.setMessages).not.toHaveBeenCalled(); // timeout is not "done"
      expect(seen.history.status).toBe("error");

      // The reconnect finishing later does not make the failed load install.
      await act(async () => agent.finishRun());
      expect(agent.setMessages).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("installs after a cold reconnect that replayed nothing", async () => {
    await select(A);
    agent.isRunning = true;
    await act(async () => requests[A].resolve(msgs("A")));
    await tick();
    await act(async () => agent.finishRun());
    await tick();
    expect(agent.messages).toEqual(msgs("A"));
  });

  it("failure shows an error (not an empty chat) and Retry loads it", async () => {
    await select(A);
    await act(async () => requests[A].reject());
    await tick();
    expect(seen.history.status).toBe("error");
    expect(agent.setMessages).not.toHaveBeenCalled();

    await act(async () => agent.finishRun()); // the reconnect itself did finish
    await act(async () => seen.history.retry());
    expect(seen.history.status).toBe("loading");
    await act(async () => requests[A].resolve(msgs("A")));
    await tick();
    expect(agent.messages).toEqual(msgs("A"));
    expect(seen.history.status).toBe("idle");
  });
});
