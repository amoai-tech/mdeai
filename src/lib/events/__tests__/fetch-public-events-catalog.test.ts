import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listPublishedEvents: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/events/list-published-events", () => ({ listPublishedEvents: mocks.listPublishedEvents }));

import { fetchPublicEventsCatalog } from "../fetch-public-events-catalog";

describe("Events server catalog — protected Vercel deployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: "public-rls-server-client" });
  });

  it("uses the canonical Supabase query directly and never fetches its own HTTP API", async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(() => { throw new Error("self HTTP fetch must not occur"); });
    globalThis.fetch = fetchSpy as typeof fetch;
    const query = { category: "culture" as const, limit: 24 };
    const rows = [{ id: "public-event-id", title: "Feria de las Flores Preview Parade" }];
    mocks.listPublishedEvents.mockResolvedValue({ results: rows, total: 1, error: null });
    try {
      await expect(fetchPublicEventsCatalog(query)).resolves.toEqual({ results: rows, total: 1, error: null });
      expect(mocks.createClient).toHaveBeenCalledTimes(1);
      expect(mocks.listPublishedEvents).toHaveBeenCalledWith(
        { from: "public-rls-server-client" }, query,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves errors from the canonical catalog query", async () => {
    mocks.listPublishedEvents.mockResolvedValue({
      results: [], total: 0, error: "Could not load events. Try again in a moment.",
    });
    await expect(fetchPublicEventsCatalog({ limit: 24 })).resolves.toMatchObject({
      results: [], total: 0, error: "Could not load events. Try again in a moment.",
    });
  });
});
