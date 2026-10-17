// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("thread-list-events (SAN-1412)", () => {
  it("tells every subscriber once, and stops after unsubscribe", async () => {
    const { notifyThreadListChanged, subscribeThreadListChanged } = await import("../thread-list-events");
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeThreadListChanged(a);
    subscribeThreadListChanged(b);
    notifyThreadListChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    notifyThreadListChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
});

describe("ensureThreadTitle (SAN-1412)", () => {
  it("PATCHes the chat (no title in the body) and announces the change on success", async () => {
    const { ensureThreadTitle } = await import("../ensure-thread-title");
    const { subscribeThreadListChanged } = await import("../thread-list-events");
    const heard = vi.fn();
    subscribeThreadListChanged(heard);
    fetchMock.mockResolvedValue(ok({ updated: true, title: "x" }));

    await expect(ensureThreadTitle("thread/with space")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/threads/thread%2Fwith%20space");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBeUndefined();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("also announces after a no-op success, because the chat moved to the top of the list", async () => {
    const { ensureThreadTitle } = await import("../ensure-thread-title");
    const { subscribeThreadListChanged } = await import("../thread-list-events");
    const heard = vi.fn();
    subscribeThreadListChanged(heard);
    fetchMock.mockResolvedValue(ok({ updated: false, title: "Weekend events" }));
    await ensureThreadTitle("t1");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("never throws and never announces on a failure", async () => {
    const { ensureThreadTitle } = await import("../ensure-thread-title");
    const { subscribeThreadListChanged } = await import("../thread-list-events");
    const heard = vi.fn();
    subscribeThreadListChanged(heard);

    fetchMock.mockResolvedValueOnce(ok({ error: "x" }, 500));
    await expect(ensureThreadTitle("t1")).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(ensureThreadTitle("t1")).resolves.toBe(false);
    expect(heard).not.toHaveBeenCalled();
  });

  it("stops asking after a signed-out 401, so a guest's chat makes one request, not one per message", async () => {
    const { ensureThreadTitle } = await import("../ensure-thread-title");
    fetchMock.mockResolvedValue(ok({ error: "Sign in required" }, 401));
    await expect(ensureThreadTitle("t1")).resolves.toBe(false);
    await expect(ensureThreadTitle("t1")).resolves.toBe(false);
    await expect(ensureThreadTitle("t2")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useNavThreads keeps the list when a quiet refresh fails (SAN-1412)", () => {
  it("does not replace the list with an error", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const { useNavThreads } = await import("../use-nav-threads");
    const { notifyThreadListChanged } = await import("../thread-list-events");
    let latest: { error: boolean; count: number } = { error: false, count: 0 };
    function Probe() {
      const { threads, error } = useNavThreads();
      latest = { error, count: threads.length };
      return null;
    }
    fetchMock
      .mockResolvedValueOnce(ok({ threads: [{ id: "t1", title: "A", updatedAt: "2026-10-16T12:00:00Z" }] }))
      .mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.render(<Probe />));
    expect(latest).toEqual({ error: false, count: 1 });
    await act(async () => notifyThreadListChanged());
    expect(latest).toEqual({ error: false, count: 1 });
    act(() => root.unmount());
    container.remove();
  });
});

describe("useNavThreads refreshes on a list change (SAN-1412)", () => {
  let root: Root;
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const list = (title: string | null) => ok({ threads: [{ id: "t1", title, updatedAt: "2026-10-16T12:00:00Z" }] });

  it("fetches once on mount, then once per announcement, quietly (no loading flash), and not after unmount", async () => {
    const { useNavThreads } = await import("../use-nav-threads");
    const { notifyThreadListChanged } = await import("../thread-list-events");
    const seen: Array<{ loading: boolean; title: string | null | undefined }> = [];
    function Probe() {
      const { threads, loading } = useNavThreads();
      seen.push({ loading, title: threads[0]?.title });
      return null;
    }
    fetchMock.mockResolvedValueOnce(list(null)).mockResolvedValueOnce(list("Find me a quiet 2BR"));

    await act(async () => root.render(<Probe />));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const before = seen.length;
    await act(async () => notifyThreadListChanged());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)?.title).toBe("Find me a quiet 2BR");
    // The refresh must not blank the list with the loading skeleton.
    expect(seen.slice(before).every((s) => s.loading === false)).toBe(true);

    await act(async () => root.unmount());
    notifyThreadListChanged();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    root = createRoot(container); // so afterEach's unmount has something to unmount
  });

  it("ignores an older response that arrives after a newer one, so a stale title never comes back", async () => {
    const { useNavThreads } = await import("../use-nav-threads");
    const { notifyThreadListChanged } = await import("../thread-list-events");
    let latestTitle: string | null | undefined;
    function Probe() {
      const { threads } = useNavThreads();
      latestTitle = threads[0]?.title;
      return null;
    }
    let releaseSlow!: (value: ReturnType<typeof list>) => void;
    const slow = new Promise<ReturnType<typeof list>>((resolve) => (releaseSlow = resolve));
    // 1st request (on mount) is slow; the 2nd (after a new message) answers first with the newer list.
    fetchMock.mockReturnValueOnce(slow).mockResolvedValueOnce(list("Newer title"));

    await act(async () => root.render(<Probe />));
    await act(async () => notifyThreadListChanged());
    expect(latestTitle).toBe("Newer title");

    await act(async () => releaseSlow(list("Older title")));
    expect(latestTitle).toBe("Newer title");
  });
});
