// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RentalSearchApiParams } from "@/lib/rental-query-parser";

const THREAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THREAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const state = vi.hoisted(() => ({
  threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  history: {
    status: "idle" as "idle" | "loading" | "error",
    threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as string | undefined,
    lastRentalSearch: { neighborhood: "Laureles" } as RentalSearchApiParams | null,
  },
}));
vi.mock("@/components/chat/chat-provider", () => ({
  useSavedThreadHistory: () => ({ ...state.history, retry: vi.fn() }),
}));
vi.mock("@/lib/chat/thread-nav-context", () => ({
  useOptionalThreadNav: () => ({ sessionThreadId: state.threadId }),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useOptionalMapContext: () => null,
}));

import { RentalFastPathProvider, useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { SavedRentalResultsHydrator } from "@/components/chat/saved-rental-results-hydrator";

function Probe() {
  const { toolResult, searchFailure, retryFailedSearch, clearToolResults, setToolResult } = useRentalFastPath();
  const results = (toolResult as { results?: Array<{ id: string }> } | null)?.results ?? [];
  return (
    <div>
      <span data-testid="ids">{results.map((r) => r.id).join(",")}</span>
      <span data-testid="failure">{searchFailure?.status ?? "none"}</span>
      <button onClick={retryFailedSearch}>Retry</button>
      <button onClick={clearToolResults}>New Chat</button>
      <button onClick={() => setToolResult({ results: [{ id: "live-1" }] })}>Live search</button>
    </div>
  );
}

function mount() {
  return render(
    <RentalFastPathProvider>
      <SavedRentalResultsHydrator />
      <Probe />
    </RentalFastPathProvider>,
  );
}

const rental = (id: string) => ({
  id, title: `Real listing ${id}`, neighborhood: "Laureles",
  nightly_price: 100_000, price_monthly: 2_500_000, currency: "COP",
  latitude: null, longitude: null,
});

beforeEach(() => {
  state.threadId = THREAD_A;
  state.history = {
    status: "idle", threadId: THREAD_A, lastRentalSearch: { neighborhood: "Laureles" },
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SAN-1639 saved rental card hydration", () => {
  it("hydrates real server results, rather than fake card details from stored history", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/rentals/search");
      expect(init.method).toBe("POST");
      return Response.json({ results: [rental("grounded-1")] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { mount(); });
    await vi.waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("grounded-1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ neighborhood: "Laureles" });
  });

  it("works when AbortSignal.any is unavailable on an older mobile browser", async () => {
    // Browsers such as older Safari lack AbortSignal.any. The restored query
    // must still reach the normal API, not loop through a broken Retry notice.
    vi.spyOn(AbortSignal, "any").mockImplementation(() => {
      throw new TypeError("AbortSignal.any is unavailable");
    });
    const fetchMock = vi.fn(async () => Response.json({ results: [rental("older-mobile-1")] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { mount(); });
    await vi.waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("older-mobile-1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty state and exposes Retry if history rental fetch returns 503", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return calls === 1 ? new Response("unavailable", { status: 503 }) : Response.json({ results: [rental("recovered-1")] });
    }));
    await act(async () => { mount(); });
    await vi.waitFor(() => expect(screen.getByTestId("failure").textContent).toBe("503"));
    expect(screen.getByTestId("ids").textContent).toBe("");
    await act(async () => { fireEvent.click(screen.getByText("Retry")); });
    await vi.waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("recovered-1"));
    expect(calls).toBe(2);
  });

  it("never overwrites a newer live search with a delayed old-thread result", async () => {
    let finishOld: ((r: Response) => void) | undefined;
    const oldFetch = new Promise<Response>((resolve) => { finishOld = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => oldFetch));
    mount();
    fireEvent.click(screen.getByText("Live search"));
    await act(async () => { finishOld!(Response.json({ results: [rental("late-old-1")] })); });
    await vi.waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("live-1"));
    expect(screen.getByTestId("ids").textContent).not.toContain("late-old-1");
  });

  it("drops late response from thread A when selecting thread B", async () => {
    let finishOld: ((r: Response) => void) | undefined;
    const oldFetch = new Promise<Response>((resolve) => { finishOld = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const params = JSON.parse(String(init.body)) as { neighborhood: string };
      return params.neighborhood === "Laureles"
        ? oldFetch
        : Response.json({ results: [rental("thread-b-1")] });
    }));
    let screenRoot!: ReturnType<typeof mount>;
    await act(async () => { screenRoot = mount(); });
    state.threadId = THREAD_B;
    state.history = {
      status: "idle", threadId: THREAD_B, lastRentalSearch: { neighborhood: "El Poblado" },
    };
    screenRoot.rerender(
      <RentalFastPathProvider><SavedRentalResultsHydrator /><Probe /></RentalFastPathProvider>,
    );
    await vi.waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("thread-b-1"));
    await act(async () => { finishOld!(Response.json({ results: [rental("late-thread-a")] })); });
    await vi.waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("thread-b-1"));
    fireEvent.click(screen.getByText("New Chat"));
    expect(screen.getByTestId("ids").textContent).toBe("");
  });
});
