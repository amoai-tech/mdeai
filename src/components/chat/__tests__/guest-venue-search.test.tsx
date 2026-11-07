// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuestVenueSearch, GuestVenueSearchScoped } from "../guest-venue-search";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

/**
 * Café/nightlife guest search is catalogue search: real rows, honest counts, honest failures.
 */
const row = (id: string): GroundedToolRow => ({
  id,
  title: `Venue ${id}`,
  latitude: 6.24,
  longitude: -75.59,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch(handler: () => Response) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    // Preserve the fetch call signature so tests can assert the submitted request body.
    void input;
    void init;
    return Promise.resolve(handler());
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const ask = (text: string) => {
  fireEvent.change(screen.getByLabelText(/Search (cafés|nightlife venues)/), { target: { value: text } });
  fireEvent.click(screen.getByTestId("guest-venue-send"));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuestVenueSearch", () => {
  it("sends the venue kind and returns grounded rows with an honest label", async () => {
    const onResults = vi.fn();
    const mock = stubFetch(() => json({ kind: "cafe", results: [row("a"), row("b")], total: 2 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults }} />);

    ask("quiet café in Laureles");
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ kind: "cafe", queryText: "quiet café in Laureles" });
    expect((await screen.findByTestId("guest-venue-summary")).textContent).toContain(
      "Search results — 2 cafés",
    );
  });

  it("labels nightlife results with the nightlife noun", async () => {
    const onResults = vi.fn();
    stubFetch(() => json({ kind: "nightlife", results: [row("a")], total: 1 }));
    render(<GuestVenueSearch options={{ kind: "nightlife", onResults }} />);

    ask("salsa clubs");
    expect((await screen.findByTestId("guest-venue-summary")).textContent).toContain(
      "Search results — 1 nightlife venue",
    );
  });

  it("reports a genuine empty answer as empty, not as a failure", async () => {
    const onResults = vi.fn();
    stubFetch(() => json({ kind: "cafe", results: [], total: 0 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults }} />);

    ask("nowhere at all");
    expect((await screen.findByTestId("guest-venue-summary")).textContent).toContain("No cafés matched");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows retry copy on 503 and never touches the results", async () => {
    const onResults = vi.fn();
    stubFetch(() => new Response("{}", { status: 503 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults }} />);

    ask("quiet");
    expect((await screen.findByRole("alert")).textContent).toContain("unavailable");
    expect(onResults).not.toHaveBeenCalled();
  });

  it("shows the rate-limit message on 429", async () => {
    stubFetch(() => new Response("{}", { status: 429 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults: vi.fn() }} />);
    ask("café");
    expect((await screen.findByRole("alert")).textContent).toContain("Too many searches");
  });

  it("allows only one search in flight", async () => {
    const onResults = vi.fn();
    const mock = stubFetch(() => json({ kind: "cafe", results: [row("a")], total: 1 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults }} />);

    fireEvent.change(screen.getByLabelText(/Search cafés/), { target: { value: "café" } });
    fireEvent.click(screen.getByTestId("guest-venue-send"));
    // A second click must not dispatch another request while the first is outstanding.
    fireEvent.click(screen.getByTestId("guest-venue-send"));
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("forgets the summary when the filter scope changes", async () => {
    const onResults = vi.fn();
    stubFetch(() => json({ kind: "cafe", results: [row("a")], total: 1 }));
    const { rerender } = render(
      <GuestVenueSearchScoped options={{ kind: "cafe", neighborhood: "Laureles", onResults }} />,
    );
    ask("quiet");
    expect(await screen.findByTestId("guest-venue-summary")).toBeTruthy();

    rerender(<GuestVenueSearchScoped options={{ kind: "cafe", neighborhood: "El Poblado", onResults }} />);
    expect(screen.queryByTestId("guest-venue-summary")).toBeNull();
  });
});
