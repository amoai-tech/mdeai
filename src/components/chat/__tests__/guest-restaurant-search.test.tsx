// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuestRestaurantComposer } from "../guest-restaurant-search";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * Guest restaurant search is catalog search over the existing public, rate-limited endpoint.
 * It must render grounded rows, never claim an AI answer, and never let a slow response
 * replace a newer one.
 */
const row = (id: string): Restaurant => ({
  id,
  name: `Restaurant ${id}`,
  cuisine: "colombian",
  neighborhood: "Laureles",
  vibe: [],
  imageUrl: "https://example.com/x.jpg",
  sourceUrl: "https://mdeai.co/restaurants/x",
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const ask = (text: string) => {
  fireEvent.change(screen.getByLabelText("Search restaurants"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("guest-restaurant-send"));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GuestRestaurantComposer", () => {
  it("returns grounded rows and says how many matched", async () => {
    const onResults = vi.fn();
    stubFetch(() => json({ results: [row("a"), row("b")], total: 2, source: "catalog" }));
    render(<GuestRestaurantComposer options={{ onResults, neighborhood: "Laureles" }} />);

    ask("quiet restaurants");
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    expect(onResults.mock.calls[0][0]).toHaveLength(2);
    expect((await screen.findByTestId("guest-restaurant-summary")).textContent).toContain(
      "Showing 2 results for “quiet restaurants”.",
    );
  });

  it("says plainly when nothing matched", async () => {
    const onResults = vi.fn();
    stubFetch(() => json({ results: [], total: 0, source: "catalog" }));
    render(<GuestRestaurantComposer options={{ onResults }} />);

    ask("sushi in Envigado");
    await waitFor(() => expect(onResults).toHaveBeenCalledWith([], { total: 0, query: "sushi in Envigado" }));
    expect((await screen.findByTestId("guest-restaurant-summary")).textContent).toContain("No restaurants matched");
  });

  it("shows the rate-limit message instead of a fake empty result", async () => {
    const onResults = vi.fn();
    stubFetch(() => new Response("{}", { status: 429 }));
    render(<GuestRestaurantComposer options={{ onResults }} />);

    ask("café");
    expect((await screen.findByRole("alert")).textContent).toContain("Too many searches");
    expect(onResults).not.toHaveBeenCalled();
  });

  it("never sends two searches at once, so an older response cannot replace a newer one", async () => {
    const onResults = vi.fn();
    const mock = stubFetch(() => json({ results: [row("a")], total: 1 }));
    render(<GuestRestaurantComposer options={{ onResults }} />);

    fireEvent.change(screen.getByLabelText("Search restaurants"), { target: { value: "café" } });
    const send = screen.getByTestId("guest-restaurant-send");
    fireEvent.click(send);
    // The control is disabled while a search is in flight, so a second submit cannot start
    // a competing request that could land out of order.
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(send);

    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty query", () => {
    const onResults = vi.fn();
    const mock = stubFetch(() => json({ results: [], total: 0 }));
    render(<GuestRestaurantComposer options={{ onResults }} />);
    fireEvent.change(screen.getByLabelText("Search restaurants"), { target: { value: "   " } });
    expect((screen.getByTestId("guest-restaurant-send") as HTMLButtonElement).disabled).toBe(true);
    expect(mock).not.toHaveBeenCalled();
  });
});
