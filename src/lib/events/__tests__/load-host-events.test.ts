import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  HOST_EVENTS_LIMIT,
  loadHostEvents,
} from "@/lib/events/load-host-events";

type Result = { data: unknown; error: { message: string } | null };

/** Minimal PostgREST chain: the loader awaits `.limit()` last. */
function fakeClient(result: Result) {
  const calls: Array<[string, unknown]> = [];
  const limit = vi.fn(async () => result);
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push([column, value]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn((count: number) => {
      calls.push(["limit", count]);
      return limit();
    }),
  };
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database>, calls, from };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadHostEvents", () => {
  it("reads only this organizer's events, newest first, capped at 50", async () => {
    const rows = [
      { id: "e1", name: "Salsa Night", slug: "salsa", status: "published" },
    ];
    const { client, calls, from } = fakeClient({ data: rows, error: null });

    await expect(loadHostEvents(client, "organizer-a")).resolves.toEqual({
      ok: true,
      events: rows,
    });

    expect(from).toHaveBeenCalledWith("events");
    expect(calls).toContainEqual(["organizer_id", "organizer-a"]);
    expect(calls).toContainEqual(["limit", HOST_EVENTS_LIMIT]);
  });

  it("returns a distinct error instead of an empty list on a query failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(loadHostEvents(client, "organizer-a")).resolves.toEqual({
      ok: false,
      message: "permission denied",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[host-events] failed to load events:",
      "permission denied",
    );
  });

  it("maps a genuinely empty result to an empty list", async () => {
    const { client } = fakeClient({ data: [], error: null });
    await expect(loadHostEvents(client, "organizer-a")).resolves.toEqual({
      ok: true,
      events: [],
    });
  });
});
