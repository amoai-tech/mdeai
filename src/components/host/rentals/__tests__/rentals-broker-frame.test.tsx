// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RentalsBrokerFrame, RentalsConciergeShell } from "../rentals-concierge-shell";
import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";

const state = vi.hoisted(() => ({
  chatMounts: 0,
  submit: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/rentals",
  useSearchParams: () => new URLSearchParams("mode=overview"),
  useRouter: () => ({ refresh: state.refresh, push: vi.fn(), replace: vi.fn() }),
}));
// Simulate unresolved browser auth: ChatProvider would hide its entire subtree.
vi.mock("@/components/chat/chat-provider", () => ({
  ChatProvider: ({ sessionFallback }: { sessionFallback: React.ReactNode }) => {
    state.chatMounts++;
    return sessionFallback;
  },
}));
vi.mock("../rentals-concierge-center", () => ({
  RentalsConciergeCenter: () => <div>Live chat</div>,
}));
vi.mock("@/lib/rentals/submit-broker-viewing-action", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/rentals/submit-broker-viewing-action")>(),
  submitBrokerViewingAction: state.submit,
}));

const dashboard: BrokerDashboardView = {
  displayName: "Broker",
  kpis: [
    { id: "listings_total", label: "Listings", value: "4", provenance: "All listings you own", testId: "r1-kpi-0" },
    { id: "open_leads", label: "Open leads", value: "0", provenance: "New, contacted or qualified leads", testId: "r1-kpi-1" },
    { id: "upcoming", label: "Upcoming", value: "0", provenance: "Scheduled or confirmed, still ahead", testId: "r1-kpi-2" },
    { id: "today", label: "Today", value: "0", provenance: "Appointments today, Medellín time", testId: "r1-kpi-3" },
  ],
  attention: [],
  todaySchedule: [],
  todayTotal: 0,
  upcomingPreview: [],
  upcomingPreviewTotal: 0,
  viewingRequests: [],
  viewingRequestsTotal: 0,
  trends: [],
  briefing: { greeting: "", summary: "", bullets: [] },
  isEmpty: false,
};

afterEach(() => {
  cleanup();
  state.chatMounts = 0;
  state.submit.mockReset();
  state.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("SAN-1683 broker frame without live chat", () => {
  it("keeps the server-rendered header, navigation and page visible before browser auth resolves", () => {
    const html = renderToStaticMarkup(
      <RentalsBrokerFrame><p>Server-loaded listings</p></RentalsBrokerFrame>,
    );
    expect(html).toContain("Rentals workspace");
    expect(html).toContain("Server-loaded listings");
    expect(html).toContain("host-rentals-nav-listings");
    expect(state.chatMounts).toBe(0);
  });

  it("renders the official header and listings without mounting chat or fetching AI", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<RentalsBrokerFrame><p>Server-loaded listings</p></RentalsBrokerFrame>);
    await screen.findByTestId("mde-surface-rentals-workspace-header");
    expect(screen.getByText("Server-loaded listings")).toBeTruthy();
    expect(screen.getByTestId("host-rentals-nav-listings")).toBeTruthy();
    expect(state.chatMounts).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps real Overview data in official surfaces and dispatches the existing viewing action without chat", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const request = {
      leadId: "11111111-1111-4111-8111-111111111111",
      showingId: "22222222-2222-4222-8222-222222222222",
      apartmentId: "33333333-3333-4333-8333-333333333333",
      apartmentTitle: "Laureles 2BR",
      apartmentNeighborhood: "Laureles",
      renterName: "Ana",
      scheduledAt: "2026-12-01T15:00:00.000Z",
      scheduledLabel: "Tue, Dec 1, 10:00 AM",
      scheduledTimeLabel: "10:00 AM",
      createdAt: "2026-11-20T15:00:00.000Z",
      status: "scheduled",
    };
    state.submit.mockResolvedValue({ ok: true });
    render(<RentalsBrokerFrame><RentalsConciergeShell basePath="/app/rentals" workspaceMode="overview" dashboard={{
      ...dashboard,
      todaySchedule: [request], todayTotal: 1,
      upcomingPreview: [request], upcomingPreviewTotal: 1,
      viewingRequests: [request], viewingRequestsTotal: 1,
    }} /></RentalsBrokerFrame>);
    const surface = await screen.findByTestId("mde-surface-broker-overview");
    expect(within(surface).getByText("Listings")).toBeTruthy();
    expect(within(surface).getAllByText("Today").length).toBeGreaterThan(0);
    expect(within(surface).queryByRole("tab")).toBeNull();
    expect(within(surface).getByText("Nothing needs your attention right now.")).toBeTruthy();
    expect(screen.getAllByTestId("host-rentals-nav")).toHaveLength(1);
    expect(screen.getByTestId("host-rentals-nav-concierge").getAttribute("href")).toBe("/app/rentals");
    expect(screen.getByTestId("host-rentals-nav-overview").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByTestId("rc-left")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Concierge mobile panes" })).toBeNull();
    // Today's real appointment row carries the existing Manage action.
    expect(within(surface).getAllByText("Laureles 2BR").length).toBeGreaterThan(0);
    const manage = within(surface).getAllByRole("button", { name: "Manage" })[0]!;
    fireEvent.click(manage);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Confirm$/ }));
    await waitFor(() => expect(state.submit).toHaveBeenCalledWith({
      showingId: request.showingId,
      action: "confirm",
      expectedStatus: request.status,
      expectedScheduledAt: request.scheduledAt,
      newWallClock: undefined,
    }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));
    expect(state.chatMounts).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps navigation visible and distinguishes a failed load from an empty dashboard", () => {
    const { rerender } = render(
      <RentalsBrokerFrame>
        <RentalsConciergeShell basePath="/app/rentals" workspaceMode="overview" loadError="Database unavailable" />
      </RentalsBrokerFrame>,
    );
    expect(screen.getByTestId("host-rentals-nav")).toBeTruthy();
    expect(screen.getByTestId("broker-overview-error")).toBeTruthy();
    expect(screen.getByText("Database unavailable")).toBeTruthy();
    // A failed load is never rendered as four confident zeroes.
    expect(screen.queryByTestId("r1-kpi-0")).toBeNull();
    expect(screen.queryByTestId("mde-surface-broker-overview")).toBeNull();
    rerender(
      <RentalsBrokerFrame>
        <RentalsConciergeShell basePath="/app/rentals" workspaceMode="overview" dashboard={null} />
      </RentalsBrokerFrame>,
    );
    expect(screen.getByText("Viewing request data is not loaded.")).toBeTruthy();
    expect(screen.queryByTestId("broker-overview-error")).toBeNull();
    expect(screen.queryByTestId("mde-surface-broker-overview")).toBeNull();
  });

  it("limits unresolved auth fallback to the concierge chat pane", () => {
    render(<RentalsBrokerFrame><RentalsConciergeShell basePath="/app/rentals" dashboard={dashboard} /></RentalsBrokerFrame>);
    expect(screen.getByText("Loading Ask MDE…")).toBeTruthy();
    expect(screen.getByTestId("rc-right")).toBeTruthy();
    expect(screen.getByTestId("rc-left")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Concierge mobile panes" })).toBeTruthy();
    expect(screen.getByTestId("host-rentals-nav-listings")).toBeTruthy();
    expect(state.chatMounts).toBeGreaterThan(0);
  });
});
