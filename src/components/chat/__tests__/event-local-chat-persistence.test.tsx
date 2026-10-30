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

const mocks = vi.hoisted(() => ({
  addMessages: vi.fn(),
  getAgent: () => ({ threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", addMessages: vi.fn() }) as unknown,
}));

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: mocks.getAgent() }),
}));

import {
  EventLocalChatProvider,
  useEventLocalChat,
} from "@/components/chat/event-local-chat-context";

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
});
