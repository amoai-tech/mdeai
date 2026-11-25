// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrokerViewingRequests } from "@/components/host/rentals/broker-viewing-requests";
import { RentalsDynamicWorkspace } from "@/components/host/rentals/rentals-dynamic-workspace";
// The actions island calls the App Router; these tests assert markup, not navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/host/rentals",
  useSearchParams: () => new URLSearchParams(),
}));

import type {
  BrokerDashboardView,
  BrokerViewingRequest,
} from "@/lib/rentals/broker-dashboard-types";

// skipcq: JS-0067 - module-local test helper; not browser global scope
function request(over: Partial<BrokerViewingRequest> = {}): BrokerViewingRequest {
  return {
    leadId: "lead-1",
    showingId: "showing-1",
    apartmentId: "apt-1",
    apartmentTitle: "Apartamento en Laureles",
    apartmentNeighborhood: "Laureles",
    renterName: "Ana Restrepo",
    scheduledAt: "2026-11-11T15:00:00.000Z",
    scheduledLabel: "11 Nov · 10:00",
    scheduledTimeLabel: "10:00 AM",
    createdAt: "2026-11-10T15:00:00.000Z",
    status: "requested",
    ...over,
  };
}

// skipcq: JS-0067 - module-local test helper; not browser global scope
function dashboard(requests: BrokerViewingRequest[]): BrokerDashboardView {
  return {
    displayName: "Broker",
    viewingRequests: requests,
    viewingRequestsTotal: requests.length,
    todaySchedule: requests,
    todayTotal: requests.length,
    upcomingPreview: requests,
    upcomingPreviewTotal: requests.length,
    // The four real metrics so the overview test fails if they stop rendering.
    kpis: [
      { id: "listings_total", label: "Listings", value: "3", provenance: "All listings you own", testId: "r1-kpi-0" },
      { id: "open_leads", label: "Open leads", value: "2", provenance: "New, contacted or qualified leads", testId: "r1-kpi-1" },
      { id: "upcoming", label: "Upcoming", value: "1", provenance: "Scheduled or confirmed, still ahead", testId: "r1-kpi-2" },
      { id: "today", label: "Today", value: "1", provenance: "Appointments today, Medellín time", testId: "r1-kpi-3" },
    ],
    attention: [],
    trends: [],
    briefing: { greeting: "Hi", summary: "", bullets: [] },
    isEmpty: false,
  };
}

describe("SAN-1204 broker viewing-request surface contract", () => {
  it("renders each request from the persisted ids so a test can correlate it", () => {
    const html = renderToStaticMarkup(
      <BrokerViewingRequests requests={[request()]} loadError={null} />,
    );

    expect(html).toContain('data-testid="viewing-requests"');
    expect(html).toContain('data-lead-id="lead-1"');
    expect(html).toContain('data-showing-id="showing-1"');
    expect(html).toContain('data-apartment-id="apt-1"');
    expect(html).toContain("Apartamento en Laureles");
    expect(html).toContain("Ana Restrepo");
    expect(html).toContain("11 Nov · 10:00");
  });

  it("renders the empty state, never a fake request", () => {
    const html = renderToStaticMarkup(<BrokerViewingRequests requests={[]} loadError={null} />);
    expect(html).toContain('data-testid="viewing-requests-empty"');
    expect(html).not.toContain('data-testid="viewing-requests"');
  });

  it("renders a load failure as an error state, never as an empty list", () => {
    const html = renderToStaticMarkup(
      <BrokerViewingRequests requests={[]} loadError="permission denied" />,
    );
    expect(html).toContain('data-testid="viewing-requests-error"');
    expect(html).toContain("permission denied");
    expect(html).not.toContain('data-testid="viewing-requests-empty"');
  });

  it("renders the loaded Overview composition instead of the Phase-A placeholders", () => {
    const html = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="overview" dashboard={dashboard([request()])} />,
    );

    expect(html).toContain('data-testid="broker-overview-fallback"');
    // Four exact metrics, not the old vertical list.
    for (const label of ["Listings", "Open leads", "Upcoming", "Today"]) {
      expect(html).toContain(label);
    }
    const kpiIndex = html.indexOf('data-testid="r1-kpi-0"');
    expect(kpiIndex).toBeGreaterThan(-1);
    const kpiBlock = html.slice(kpiIndex, kpiIndex + 400);
    expect(kpiBlock).toContain("Listings");
    expect(kpiBlock).toContain(">3<");
    // Today shows the real appointment and its Manage keeps working in Concierge.
    expect(html).toContain("Today");
    expect(html).toContain("Apartamento en Laureles");
    expect(html).not.toContain("Data pending");
  });

  it("shows the requests in the default concierge landing mode too, not only overview", () => {
    const concierge = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="concierge" dashboard={dashboard([request()])} />,
    );
    const overview = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="overview" dashboard={dashboard([request()])} />,
    );

    expect(concierge).toContain('data-testid="viewing-requests"');
    expect(concierge).toContain('data-apartment-id="apt-1"');
    // Overview does not duplicate the full request list; it shows the bounded
    // Today/Upcoming rows and the Concierge pane keeps the real actions.
    expect(overview).toContain('data-testid="broker-overview-fallback"');
    expect(overview).not.toContain('data-testid="viewing-requests"');
  });

  it.each([
    ["/app/rentals", "/app/rentals?mode=concierge"],
    ["/host/rentals", "/host/rentals"],
  ])("keeps all Overview fallback chat links working under %s", (basePath, chatHref) => {
    const view = dashboard([request()]);
    view.attention = [
      { id: "lead", kind: "lead_unanswered", title: "1 unanswered enquiry", detail: "Follow up", action: "ask_mde", ctaLabel: "Review enquiries", testId: "attention-lead" },
      { id: "listing", kind: "listing", title: "1 draft", detail: "Review listing", action: "listings", ctaLabel: "Manage listings", testId: "attention-listing" },
    ];
    const html = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="overview" dashboard={view} basePath={basePath} />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const fallback = document.querySelector('[data-testid="broker-overview-fallback"]');
    expect(fallback).not.toBeNull();
    const links = Array.from(fallback!.querySelectorAll("a"));
    for (const label of ["Ask MDE", "Review enquiries", "Open the Concierge workspace"]) {
      expect(links.find((link) => link.textContent === label)?.getAttribute("href")).toBe(chatHref);
    }
    expect(links.find((link) => link.textContent === "Manage listings")?.getAttribute("href")).toBe(`${basePath}/listings`);
    expect(links.find((link) => link.textContent === "New listing")?.getAttribute("href")).toBe(`${basePath}/onboarding`);
  });

  it.each([0, 1])("labels partial fallback Today schedules with %i displayed rows", (shown) => {
    const view = { ...dashboard(shown ? [request()] : []), todayTotal: 60 };
    const html = renderToStaticMarkup(<RentalsDynamicWorkspace mode="overview" dashboard={view} />);
    expect(html).toContain(`Showing ${shown} of 60 appointments today.`);
    expect(html).not.toContain("No viewings scheduled for today.");
  });

  it("keeps the loading state truthful before the dashboard resolves", () => {
    const html = renderToStaticMarkup(<RentalsDynamicWorkspace mode="overview" />);
    expect(html).toContain("Viewing request data is not loaded.");
    expect(html).not.toContain('data-testid="viewing-requests-empty"');
    expect(html).not.toContain('data-testid="broker-overview-fallback"');
  });
});
