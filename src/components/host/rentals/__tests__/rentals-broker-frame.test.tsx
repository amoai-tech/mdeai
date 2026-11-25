// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RentalsBrokerFrame, RentalsConciergeShell } from "../rentals-concierge-shell";
import { BROKER_ASK_MDE_EVENT } from "@/lib/rentals/broker-ask-mde";
import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";

const state = vi.hoisted(() => ({
  chatMounts: 0,
  mode: "overview",
  authLoading: false,
  renderChat: false,
  submit: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/rentals",
  useSearchParams: () => new URLSearchParams(state.mode ? "mode=" + state.mode : ""),
  useRouter: () => ({ refresh: state.refresh, push: state.push, replace: vi.fn() }),
}));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: state.authLoading ? null : { id: "broker-a" }, loading: state.authLoading }),
}));
// Simulate unavailable AI: its fallback must never hide page children.
vi.mock("@/components/chat/chat-provider", () => ({
  ChatProvider: ({ children, sessionFallback }: { children: React.ReactNode; sessionFallback: React.ReactNode }) => {
    state.chatMounts++;
    return state.renderChat ? children : sessionFallback;
  },
}));
vi.mock("../rentals-concierge-center", () => ({
  RentalsConciergeCenter: () => <textarea aria-label="Test composer" />,
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
  state.mode = "overview";
  state.authLoading = false;
  state.renderChat = false;
  sessionStorage.clear();
  state.submit.mockReset();
  state.refresh.mockReset();
  state.push.mockReset();
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
    expect(screen.getByTestId("host-rentals-nav-concierge").getAttribute("href")).toBe("/app/rentals?mode=concierge");
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

  it("limits unresolved auth fallback to the one bottom chat, leaving data visible", () => {
    state.mode = "concierge";
    state.authLoading = true;
    render(<RentalsBrokerFrame><RentalsConciergeShell basePath="/app/rentals" dashboard={dashboard} /></RentalsBrokerFrame>);
    expect(screen.getByText("Loading Ask MDE…")).toBeTruthy();
    expect(screen.getByTestId("rc-right")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Concierge mobile panes" })).toBeNull();
    expect(screen.getByTestId("host-rentals-nav-listings")).toBeTruthy();
    expect(state.chatMounts).toBe(0);
  });

  it("opens Overview by default with the chat collapsed and no AI runtime mounted", () => {
    state.mode = "";
    render(<RentalsBrokerFrame><RentalsConciergeShell basePath="/app/rentals" dashboard={dashboard} /></RentalsBrokerFrame>);
    expect(screen.getByTestId("rc-right")).toBeTruthy();
    expect(screen.getByTestId("rentals-ask-mde-slot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
    expect(screen.queryByTestId("rc-center")).toBeNull();
    expect(state.chatMounts).toBe(0);
    // One page-level heading remains for the document outline.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Rentals overview");
  });

  it("opens the one bottom chat from the Overview header without leaving the page", async () => {
    state.renderChat = true;
    render(<RentalsBrokerFrame><RentalsConciergeShell basePath="/app/rentals" workspaceMode="overview" dashboard={dashboard} /></RentalsBrokerFrame>);
    const surface = await screen.findByTestId("mde-surface-broker-overview");
    fireEvent.click(within(surface).getByRole("button", { name: "Ask MDE" }));
    await waitFor(() => expect(state.chatMounts).toBeGreaterThan(0));
    expect(document.getElementById("rentals-ask-mde-panel")?.hidden).toBe(false);
    // SAN-1685: the mode is a signal, not a route change.
    expect(state.push).not.toHaveBeenCalled();
  });

  it("opens the same bottom chat from Overview and retains its panel across page changes and collapse", async () => {
    state.renderChat = true;
    const { rerender } = render(<RentalsBrokerFrame><p>Overview data</p></RentalsBrokerFrame>);
    expect(state.chatMounts).toBe(0);
    act(() => { expect(window.dispatchEvent(new Event(BROKER_ASK_MDE_EVENT, { cancelable: true }))).toBe(false); });
    await waitFor(() => expect(state.chatMounts).toBeGreaterThan(0));
    const panel = document.getElementById("rentals-ask-mde-panel")!;
    expect(panel.hidden).toBe(false);
    expect(screen.getAllByTestId("rentals-ask-mde-slot")).toHaveLength(1);
    expect(screen.getByText("Overview data")).toBeTruthy();
    const composer = await screen.findByRole("textbox", { name: "Test composer" });
    await waitFor(() => expect(document.activeElement).toBe(composer));
    fireEvent.change(composer, { target: { value: "Unsent draft" } });
    rerender(<RentalsBrokerFrame><p>Listings data</p></RentalsBrokerFrame>);
    expect(document.getElementById("rentals-ask-mde-panel")).toBe(panel);
    expect(screen.getByText("Listings data")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));
    expect(panel.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(panel.hidden).toBe(false);
    expect(document.getElementById("rentals-ask-mde-panel")).toBe(panel);
    expect(screen.getByRole("textbox", { name: "Test composer" })).toBe(composer);
    expect((composer as HTMLTextAreaElement).value).toBe("Unsent draft");
  });
});
