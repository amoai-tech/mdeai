// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventBrowseDetailsPanel } from "../event-browse-details";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import type { PublicEventDetail } from "@/lib/events/types";

/**
 * SAN-1638 audit: prove the event panel's failure and price branches with controlled responses
 * instead of waiting for a real provider failure.
 *
 * The rules under test:
 *  - 404 (confirmed missing)  → "no longer available", no Full event page link, no Retry;
 *  - 503 / network            → retryable message with Retry, and the Full event page kept;
 *  - a zero-priced tier       → "Free", never "$0";
 *  - a tier with nothing left → "Sold out".
 */
const event: PublishedEventListItem = {
  id: "evt-1",
  eventId: "evt-1",
  slug: "salsa-night",
  title: "Salsa Night",
  venue: "Club Social",
  neighborhood: "Laureles",
  startsAt: "2026-06-13T03:00:00+00:00",
  pricePerTicket: 25,
  canBuyTickets: false,
  currency: "COP",
  ticketUrl: "/events/salsa-night",
  category: "music",
  status: "published",
};

const detail: PublicEventDetail = {
  id: "evt-1",
  slug: "salsa-night",
  name: "Salsa Night",
  description: "Live salsa band.",
  address: "Club Social, Laureles",
  city: "Medellín",
  startsAt: "2026-06-13T03:00:00+00:00",
  endsAt: null,
  imageUrl: null,
  currency: "COP",
  latitude: null,
  longitude: null,
  host: null,
  venue: null,
  tickets: [],
};

function stubFetch(handler: () => Response | Promise<Response>) {
  // `fetch` must resolve to a Response; wrapping keeps every stub thenable.
  const mock = vi.fn(async () => handler());
  vi.stubGlobal("fetch", mock);
  return mock;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const noop = () => undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EventBrowseDetails failure states", () => {
  it("hides the full event page and Retry for a confirmed 404", async () => {
    stubFetch(() => json({ error: "Event not found" }, 404));
    render(<EventBrowseDetailsPanel event={event} onClose={noop} />);

    expect(await screen.findByText("This event is no longer available.")).toBeTruthy();
    expect(screen.queryByTestId("event-browse-details-full-page")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps the full event page and offers Retry for a retryable 503, then recovers", async () => {
    const mock = stubFetch(() => json({ error: "Event temporarily unavailable" }, 503));
    render(<EventBrowseDetailsPanel event={event} onClose={noop} />);

    expect(await screen.findByText("Could not load event details.")).toBeTruthy();
    expect(screen.getByTestId("event-browse-details-full-page")).toBeTruthy();

    // A later success must clear the error rather than leaving a stale failure on screen.
    mock.mockImplementation(async () =>
      json({ event: { ...detail, tickets: [{ id: "t1", name: "GA", priceCents: 4000000, currency: "COP", qtyTotal: 10, qtySold: 2, position: 0 }] } }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.queryByText("Could not load event details.")).toBeNull());
    expect(await screen.findByTestId("event-browse-details-tiers")).toBeTruthy();
  });
});

describe("EventBrowseDetails ticket labels", () => {
  it("labels a zero-priced tier Free and a full tier Sold out", async () => {
    stubFetch(() =>
      json({
        event: {
          ...detail,
          tickets: [
            { id: "free", name: "Community", priceCents: 0, currency: "COP", qtyTotal: 50, qtySold: 10, position: 0 },
            { id: "gone", name: "VIP", priceCents: 12000000, currency: "COP", qtyTotal: 10, qtySold: 10, position: 1 },
          ],
        },
      }),
    );
    render(<EventBrowseDetailsPanel event={event} onClose={noop} />);

    const tiers = await screen.findByTestId("event-browse-details-tiers");
    expect(tiers.textContent).toContain("Community");
    expect(tiers.textContent).toContain("Free");
    expect(tiers.textContent).not.toContain("$0");
    expect(tiers.textContent).toContain("Sold out");
    expect(tiers.querySelector('[data-sold-out="true"]')?.textContent).toContain("VIP");
  });
});
