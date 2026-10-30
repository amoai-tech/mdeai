// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * SAN-1531 — a discovery fast-path answer must be written to the same conversation the
 * history reader loads.
 *
 * The provider used to call only `agent.addMessages()`, which is browser-session state: after a
 * refresh the thread came back empty. These tests pin the durable half — the POST that carries both
 * messages — and that a signed-out guest never attempts it.
 */

const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const mocks = vi.hoisted(() => {
  const state: { agent: unknown } = {
    agent: { threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", addMessages: vi.fn() },
  };
  return { state };
});

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: mocks.state.agent }),
}));

import {
  EventLocalChatProvider,
  useEventLocalChat,
} from "@/components/chat/event-local-chat-context";

async function renderWith(agent: unknown) {
  mocks.state.agent = agent;
  await act(async () => {
    root.render(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(Probe, { onReady: (next) => (api = next) }),
      ),
    );
  });
}

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useEventLocalChat>) => void }) {
  const api = useEventLocalChat();
  onReady(api);
  return null;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let api: ReturnType<typeof useEventLocalChat> | null = null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  api = null;
  mocks.state.agent = { threadId: THREAD, addMessages: vi.fn() };
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ saved: 2 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(
        EventLocalChatProvider,
        null,
        React.createElement(Probe, { onReady: (next) => (api = next) }),
      ),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EventLocalChatProvider durable save", () => {
  it("POSTs both messages of a fast-path exchange to the conversation", async () => {
    await act(async () => {
      api!.showExchange("Find Italian restaurants in El Poblado.", "3 Italian spots in El Poblado.");
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/threads/${THREAD}/messages`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ id: string; role: string; content: string }>;
    };
    expect(body.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(body.messages[1].content).toBe("3 Italian spots in El Poblado.");
    // Every message carries an id, so a retry is idempotent instead of duplicated.
    expect(body.messages.every((m) => typeof m.id === "string" && m.id.length > 0)).toBe(true);
  });

  it("does not persist a signed-out sign-in prompt", async () => {
    await act(async () => {
      api!.showSignInPrompt("Find Italian restaurants in El Poblado.");
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the message on screen even when the save fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    await act(async () => {
      api!.showExchange("Which ones are affordable?", "Two under COP 60,000.");
    });

    expect(api!.messages.at(-1)?.content).toBe("Two under COP 60,000.");
  });

  it("still saves the exchange when publishing to the agent throws", async () => {
    await renderWith({
      threadId: THREAD,
      addMessages: () => {
        throw new Error("agent not ready");
      },
    });

    await act(async () => {
      api!.showExchange("Find Italian restaurants in El Poblado.", "3 Italian spots in El Poblado.");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(api!.messages).toHaveLength(2);
  });

  it("gives the conversation an id when the agent has none, and saves immediately", async () => {
    const agent = { threadId: undefined as string | undefined, addMessages: vi.fn() };
    await renderWith(agent);

    await act(async () => {
      api!.showExchange("Find Italian restaurants in El Poblado.", "3 Italian spots in El Poblado.");
    });

    // Without an id the answer was previously queued and never sent in a session where the
    // agent never connects (measured in the browser run), so the provider assigns one.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^\/api\/threads\/[0-9a-f-]{36}\/messages$/);
    expect(agent.threadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("retries a transient save failure once", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: 2 }), { status: 200 }));

    await act(async () => {
      api!.showExchange("Find Italian restaurants in El Poblado.", "3 Italian spots in El Poblado.");
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never uses a thread id that is not a uuid", async () => {
    const agent = { threadId: "../../evil", addMessages: vi.fn() };
    await renderWith(agent);

    await act(async () => {
      api!.showExchange("Hello", "Hi");
    });

    // An invalid id is replaced with a real one; it must never reach the request path.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^\/api\/threads\/[0-9a-f-]{36}\/messages$/);
    expect(url).not.toContain("evil");
    expect(agent.threadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("drops a queued save when New Chat starts a new conversation", async () => {
    // No agent at all: the batch can only be queued.
    await renderWith(undefined);
    await act(async () => {
      api!.showExchange("Find Italian restaurants in El Poblado.", "3 Italian spots in El Poblado.");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      api!.clearLocalMessages();
    });

    // A later agent must not resurrect the previous conversation's save.
    await renderWith({ threadId: THREAD, addMessages: vi.fn() });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
