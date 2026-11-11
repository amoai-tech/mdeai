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
    renterName: "Ana Restrepo",
    scheduledAt: "2026-11-11T15:00:00.000Z",
    scheduledLabel: "11 Nov · 10:00",
    createdAt: "2026-11-10T15:00:00.000Z",
    status: "requested",
    ...over,
  };
}

// skipcq: JS-0067 - module-local test helper; not browser global scope
function dashboard(requests: BrokerViewingRequest[]): BrokerDashboardView {
  return {
    viewingRequests: requests,
    viewingRequestsTotal: requests.length,
    // A real KPI so the overview test fails if the dashboard metrics stop rendering.
    kpis: [
      { id: "kpi-active", label: "Active listings", value: "3", provenance: "test", testId: "kpi-active-listings" },
    ],
  } as unknown as BrokerDashboardView;
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

  it("renders the loaded dashboard instead of the Phase-A placeholders", () => {
    const html = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="overview" dashboard={dashboard([request()])} />,
    );

    expect(html).toContain('data-testid="viewing-requests"');
    expect(html).toContain('data-apartment-id="apt-1"');
    // The overview must render dashboard metrics, not just the requests list.
    // Assert inside the KPI card itself, so an unrelated "3" (a gap class, a count)
    // cannot satisfy the test.
    const kpiIndex = html.indexOf('data-testid="kpi-active-listings"');
    expect(kpiIndex).toBeGreaterThan(-1);
    const kpiBlock = html.slice(kpiIndex, kpiIndex + 400);
    expect(kpiBlock).toContain("Active listings");
    expect(kpiBlock).toContain(">3<");
    expect(html).not.toContain("Data pending");
  });

  it("shows the requests in the default concierge landing mode too, not only overview", () => {
    const concierge = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="concierge" dashboard={dashboard([request()])} />,
    );
    const overview = renderToStaticMarkup(
      <RentalsDynamicWorkspace mode="overview" dashboard={dashboard([request()])} />,
    );

    for (const html of [concierge, overview]) {
      expect(html).toContain('data-testid="viewing-requests"');
      expect(html).toContain('data-apartment-id="apt-1"');
    }
  });

  it("keeps the loading state truthful before the dashboard resolves", () => {
    const html = renderToStaticMarkup(<RentalsDynamicWorkspace mode="overview" />);
    expect(html).toContain('data-testid="viewing-requests-empty"');
  });
});
