/**
 * SAN-878 · GND-002 — Maps attribution ToS on grounded cards.
 * The nightlife detail panel shows the same grounded summary as the card, so it carries the same
 * Google Maps source attribution.
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NightlifeDetailPanel } from "@/components/nightlife/nightlife-detail-panel";
import type { NightlifeVenueDetail } from "@/components/chat/rental-ui-context";

vi.mock("@/hooks/use-place-details", () => ({
  usePlaceDetails: () => ({ status: "error" as const }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({
    closeNightlifeDetail: vi.fn(),
    openNightlifeDetail: vi.fn(),
    openNightlifeBooking: vi.fn(),
  }),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ panToPin: vi.fn() }),
}));
vi.mock("@/components/venues/venue-booking-status-chip", () => ({
  VenueBookingStatusChip: () => null,
}));

const detail: NightlifeVenueDetail = {
  kind: "nightlife",
  pinId: "grounded-1",
  placeId: "ChIJNight1234567890",
  title: "Rooftop Salsa Bar",
  mapsUrl: "https://maps.google.com/?cid=7",
  formattedAddress: "Calle 10, El Poblado",
  summary: "Salsa and cocktails on a rooftop.",
};

describe("NightlifeDetailPanel Google Maps source (SAN-878)", () => {
  it("attributes the summary to Google Maps with the place name and URL", () => {
    const html = renderToStaticMarkup(<NightlifeDetailPanel detail={detail} siblings={[detail]} />);
    const source = html.indexOf('data-testid="grounding-attribution"');
    expect(source).toBeGreaterThan(-1);
    expect(html.indexOf("Salsa and cocktails")).toBeLessThan(source);
    const block = html.slice(source, html.indexOf("</p>", source));
    expect(block).toContain('href="https://maps.google.com/?cid=7"');
    expect(block).toContain("Google Maps");
    expect(block).toContain("Rooftop Salsa Bar");
    expect(block).toContain('translate="no"');
  });
});
