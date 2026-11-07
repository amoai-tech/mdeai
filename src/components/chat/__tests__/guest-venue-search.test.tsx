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
    // "quiet" is a preference, so the copy says these are ranked suggestions rather than
    // verified matches — the row is ordered by the quiet score, not proven to be quiet.
    expect((await screen.findByTestId("guest-venue-summary")).textContent).toContain(
      "Suggestions — 2 cafés ranked for quiet",
    );
  });

  it("says Search results for a name query, and Suggestions for a preference query", async () => {
    stubFetch(() => json({ kind: "cafe", results: [row("a")], total: 1 }));
    const { unmount } = render(<GuestVenueSearch options={{ kind: "cafe", onResults: vi.fn() }} />);
    ask("Pergamino");
    expect((await screen.findByTestId("guest-venue-summary")).textContent).toContain("Search results");
    unmount();

    stubFetch(() => json({ kind: "cafe", results: [row("a")], total: 1 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults: vi.fn() }} />);
    ask("date night");
    // A two-word preference phrase, which per-token parsing could never recognise.
    expect((await screen.findByTestId("guest-venue-summary")).textContent).toContain(
      "ranked for date night",
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

describe("Clear search", () => {
  it("restores the catalogue and drops the summary", async () => {
    const onResults = vi.fn();
    const onClear = vi.fn();
    stubFetch(() => json({ kind: "cafe", results: [row("a")], total: 1 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults, onClear }} />);

    ask("quiet");
    expect(await screen.findByTestId("guest-venue-summary")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("guest-venue-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("guest-venue-summary")).toBeNull();
  });

  it("stays available after a failed follow-up search, and focuses the field", async () => {
    // First search succeeds, second one 503s: the message clears but the results are still there,
    // so the visitor still needs a way back.
    let call = 0;
    stubFetch(() => {
      call += 1;
      return call === 1 ? json({ kind: "cafe", results: [row("a")], total: 1 }) : new Response("{}", { status: 503 });
    });
    const onClear = vi.fn();
    render(<GuestVenueSearch options={{ kind: "cafe", onResults: vi.fn(), onClear }} />);

    ask("quiet");
    await screen.findByTestId("guest-venue-clear");
    ask("another");
    await screen.findByRole("alert");
    // Results from the first search are still rendered, so clearing must remain possible.
    expect(screen.getByTestId("guest-venue-clear")).toBeTruthy();

    fireEvent.click(screen.getByTestId("guest-venue-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
    // Focus lands on the search field, not on <body>.
    expect(document.activeElement).toBe(screen.getByLabelText(/Search cafés/));
  });

  it("recovers when Clear is pressed while the fetch is still pending", async () => {
    // The regression the review found: aborting skips the `finally` that clears busy, so the
    // composer stayed dead until a remount. A pending fetch is the only way to reproduce it.
    // A mutable holder, because TS narrows a plain `let` to null across the closure.
    const pending: { resolve?: (value: Response) => void } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            pending.resolve = resolve;
          }),
      ),
    );
    const onClear = vi.fn();
    render(<GuestVenueSearch options={{ kind: "cafe", onResults: vi.fn(), onClear }} />);

    fireEvent.change(screen.getByLabelText(/Search cafés/), { target: { value: "quiet" } });
    const send = screen.getByTestId("guest-venue-send") as HTMLButtonElement;
    fireEvent.click(send);
    expect(send.disabled).toBe(true); // in flight

    // Clear is visible during the search only once results exist, so simulate a prior search.
    expect(onClear).not.toHaveBeenCalled();
    pending.resolve?.(json({ kind: "cafe", results: [row("a")], total: 1 }));
    await screen.findByTestId("guest-venue-summary");

    // Second search, still pending, then Clear mid-flight.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    fireEvent.change(screen.getByLabelText(/Search cafés/), { target: { value: "another" } });
    fireEvent.click(send);
    await waitFor(() => expect(send.disabled).toBe(true));
    fireEvent.click(await screen.findByTestId("guest-venue-clear"));

    expect(onClear).toHaveBeenCalledTimes(1);
    // The composer must be usable again: with text in the field, send is enabled once Clear has
    // released `busy`. Before the fix this stayed disabled forever.
    await waitFor(() =>
      expect((screen.getByTestId("guest-venue-send") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.change(screen.getByLabelText(/Search cafés/), { target: { value: "third" } });
    await waitFor(() =>
      expect((screen.getByTestId("guest-venue-send") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("is not rendered when the page cannot clear", async () => {
    stubFetch(() => json({ kind: "cafe", results: [row("a")], total: 1 }));
    render(<GuestVenueSearch options={{ kind: "cafe", onResults: vi.fn() }} />);
    ask("quiet");
    await screen.findByTestId("guest-venue-summary");
    expect(screen.queryByTestId("guest-venue-clear")).toBeNull();
  });
});
