import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicEventDetail } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  getPublicEventResult: vi.fn(),
  getSiteOrigin: vi.fn(),
  getEventInterest: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("NEXT_HTTP_ERROR_FALLBACK;404"); }),
}));

vi.mock("@/lib/events/get-public-event", () => ({
  getPublicEventResult: mocks.getPublicEventResult,
}));
vi.mock("@/lib/auth/site-url", () => ({ getSiteOrigin: mocks.getSiteOrigin }));
vi.mock("@/lib/events/event-interest-server", () => ({ getEventInterest: mocks.getEventInterest }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/events/event-checkout-notice", () => ({
  EventCheckoutNotice: () => null,
}));
vi.mock("@/components/events/event-detail-view", () => ({
  EventDetailView: () => <main>Event detail</main>,
}));
vi.mock("@/components/events/event-unavailable", () => ({
  EventUnavailable: () => <main>Unavailable</main>,
}));

import EventDetailPage from "./page";

const event = {
  id: "a1b2c3d4-0001-0001-0001-000000000003",
  slug: "feria",
  name: "Festival </script><img src=x onerror=alert(1)>",
  description: null,
  address: null,
  city: "Medellín",
  startsAt: "2026-12-06T19:00:00+00:00",
  endsAt: null,
  imageUrl: null,
  currency: "COP",
  latitude: null,
  longitude: null,
  host: null,
  venue: null,
  tickets: [],
} as PublicEventDetail;
const props = {
  params: Promise.resolve({ slug: "feria" }),
  searchParams: Promise.resolve({}),
};

beforeEach(() => {
  mocks.getPublicEventResult.mockReset();
  mocks.getSiteOrigin.mockReset().mockResolvedValue("https://www.mdeai.co");
  mocks.getEventInterest.mockReset().mockResolvedValue({ signedIn: false, following: false });
  mocks.notFound.mockClear();
});

describe("event page structured data integration", () => {
  it("renders one parseable, script-safe Event JSON-LD only for a real event", async () => {
    mocks.getPublicEventResult.mockResolvedValue({ status: "ok", event });
    const html = renderToStaticMarkup(await EventDetailPage(props));
    expect(mocks.getEventInterest).toHaveBeenCalledWith(event.id);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)];
    expect(blocks).toHaveLength(1);
    const jsonLd = JSON.parse(blocks[0][1]);
    expect(jsonLd["@type"]).toBe("Event");
    expect(jsonLd.name).toBe(event.name);
    expect(jsonLd).not.toHaveProperty("offers");
    expect(jsonLd).not.toHaveProperty("location");
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain("\\u003c");
  });

  it("emits no JSON-LD on temporary read failures", async () => {
    mocks.getPublicEventResult.mockResolvedValue({ status: "unavailable" });
    const html = renderToStaticMarkup(await EventDetailPage(props));
    expect(html).not.toContain("application/ld+json");
    expect(html).toContain("Unavailable");
  });

  it("emits no JSON-LD for absent events", async () => {
    mocks.getPublicEventResult.mockResolvedValue({ status: "not-found" });
    await expect(EventDetailPage(props)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mocks.getSiteOrigin).not.toHaveBeenCalled();
  });
});
