import { describe, expect, it } from "vitest";
import { validateOperation } from "@copilotkit/shared";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import type { z } from "zod";
import type { BrokerDashboardView, BrokerViewingRequest } from "../broker-dashboard-types";
import {
  buildBrokerOverviewOperations as buildOperations,
  brokerViewingStatusTone,
  rescheduleDraftPath,
} from "../broker-overview-ui";

const rendererKey = "77777777-7777-4777-8777-777777777777";
const buildBrokerOverviewOperations = (view: BrokerDashboardView) => buildOperations(view, rendererKey);

const request = (overrides: Partial<BrokerViewingRequest>): BrokerViewingRequest => Object.assign({
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
}, overrides);

const kpis = [
  { id: "listings_total", label: "Listings", value: "42", provenance: "All listings you own", testId: "r1-kpi-0" },
  { id: "open_leads", label: "Open leads", value: "12", provenance: "New, contacted or qualified leads", testId: "r1-kpi-1" },
  { id: "upcoming", label: "Upcoming", value: "8", provenance: "Scheduled or confirmed, still ahead", testId: "r1-kpi-2" },
  { id: "today", label: "Today", value: "3", provenance: "Appointments today, Medellín time", testId: "r1-kpi-3" },
];

const view = (overrides: Partial<BrokerDashboardView> = {}): BrokerDashboardView => Object.assign({
  displayName: "Broker",
  kpis,
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
}, overrides);

type Node = Record<string, unknown> & { id: string; component: string };
const nodesOf = (ops: ReturnType<typeof buildBrokerOverviewOperations>) =>
  (ops[0].createSurface.components as Node[]);
const find = (nodes: Node[], id: string) => nodes.find((node) => node.id === id);
const nodeIds = (nodes: Node[]) => nodes.map((node) => node.id);

/** The same two checks the browser surface manager runs before it applies an operation. */
function acceptedByCatalog(ops: ReturnType<typeof buildBrokerOverviewOperations>) {
  const manifest = { catalogId: mdeUI.id, components: mdeUI.manifestComponents };
  expect(validateOperation(ops[0], { manifest, knownSurfaces: new Set<string>() })).toEqual({ ok: true });
  for (const node of nodesOf(ops)) {
    const { component, ...rest } = node;
    delete (rest as Record<string, unknown>).id;
    const definition = mdeUI.components.get(component);
    expect(definition, component).toBeDefined();
    const literal = Object.fromEntries(Object.entries(rest).filter(([key, value]) =>
      !definition?.events?.[key] && !definition?.slots?.[key] &&
      !(value && typeof value === "object" && "@path" in (value as object))));
    const parsed = (definition?.props as z.ZodTypeAny).safeParse(literal);
    expect(parsed.success, `${node.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
}

describe("SAN-1710 broker Overview as official CopilotKit components", () => {
  it("is accepted by the real catalog and renders four KPI cards in one Grid", () => {
    const ops = buildBrokerOverviewOperations(view({
      attention: [{
        id: "leads", kind: "lead_unanswered", title: "5 unanswered enquiries",
        detail: "Renters are waiting for a reply.", action: "ask_mde", ctaLabel: "Ask MDE", testId: "r1-attn-leads",
      }],
      todaySchedule: [request({})],
      todayTotal: 1,
      upcomingPreview: [request({ showingId: "44444444-4444-4444-8444-444444444444", status: "confirmed" })],
      upcomingPreviewTotal: 1,
      viewingRequests: [request({})],
      viewingRequestsTotal: 1,
    }));
    acceptedByCatalog(ops);
    const nodes = nodesOf(ops);

    const grid = find(nodes, "kpis")!;
    expect(grid.component).toBe("Grid");
    expect(grid.columns).toBe(4);
    expect(grid.children).toEqual(kpis.map((kpi) => `kpi-${kpi.id}`));
    for (const kpi of kpis) {
      expect(find(nodes, `kpi-${kpi.id}`)?.component).toBe("Card");
      expect(find(nodes, `kpi-${kpi.id}`)?.variant).toBe("outline");
      expect(find(nodes, `kpi-${kpi.id}-label`)?.text).toBe(kpi.label);
      expect(find(nodes, `kpi-${kpi.id}-value`)?.text).toBe(kpi.value);
    }
  });

  it("has no chart and no internal tab strip in the initial Overview", () => {
    const nodes = nodesOf(buildBrokerOverviewOperations(view({
      todaySchedule: [request({})], todayTotal: 1, viewingRequests: [request({})], viewingRequestsTotal: 1,
    })));
    expect(nodes.some((node) => node.component === "Chart")).toBe(false);
    expect(nodes.some((node) => node.component === "Tabs")).toBe(false);
    // No component may opt itself into an inner scroll region.
    expect(nodes.every((node) => node.scrollable === undefined)).toBe(true);
    // Today and Needs attention are visible without opening anything.
    expect(find(nodes, "attention")?.component).toBe("Card");
    expect(find(nodes, "today")?.component).toBe("Card");
    expect(find(nodes, "upcoming")?.component).toBe("Card");
  });

  it("shows exact attention rows and an honest empty state", () => {
    const nodes = nodesOf(buildBrokerOverviewOperations(view({
      attention: [
        { id: "leads", kind: "lead_unanswered", title: "5 unanswered enquiries", detail: "Renters are waiting for a reply.", action: "ask_mde", ctaLabel: "Ask MDE", testId: "r1-attn-leads" },
        { id: "viewings", kind: "viewing_pending", title: "1 viewing request awaiting a decision", detail: "Confirm, decline or reschedule from Today or Upcoming.", action: null, ctaLabel: null, testId: "r1-attn-viewings" },
        { id: "listings", kind: "listing", title: "Listings need attention", detail: "3 drafts · 2 without photos", action: "listings", ctaLabel: "Manage listings", testId: "r1-attn-listings" },
      ],
    })));
    expect(find(nodes, "attn-leads-title")?.text).toBe("5 unanswered enquiries");
    expect(find(nodes, "attn-leads-cta")?.onClick).toEqual({
      functionCall: { "@call": "brokerOverviewNavigate", args: { rendererKey, target: "ask_mde" } },
    });
    expect(find(nodes, "attn-listings-cta")?.label).toBe("Manage listings");
    expect(find(nodes, "attn-viewings-cta")).toBeUndefined();

    const empty = nodesOf(buildBrokerOverviewOperations(view()));
    expect(find(empty, "attention-empty")?.text).toBe("Nothing needs your attention right now.");
    expect(find(empty, "today-empty")?.text).toBe("No viewings scheduled for today.");
    expect(find(empty, "today-caption")).toBeUndefined();
    expect(find(empty, "upcoming-empty")?.text).toBe("No upcoming appointments after today.");
    expect(find(empty, "upcoming-all-modal")).toBeUndefined();
    acceptedByCatalog(buildBrokerOverviewOperations(view()));
  });

  it.each([0, 1])("labels partial Today schedules with %i displayed rows", (shown) => {
    const ops = buildBrokerOverviewOperations(view({
      todaySchedule: shown ? [request({})] : [], todayTotal: 60,
    }));
    acceptedByCatalog(ops);
    const nodes = nodesOf(ops);
    expect(find(nodes, "today-caption")?.text).toBe(`Showing ${shown} of 60 appointments today.`);
    expect(find(nodes, "today")?.children).toContain("today-caption");
    expect(find(nodes, "today-empty")).toBeUndefined();
  });

  it("renders today chronologically with time, neighborhood, status and the real Manage action", () => {
    const late = request({ showingId: "55555555-5555-4555-8555-555555555555", scheduledAt: "2026-12-01T21:30:00.000Z", scheduledTimeLabel: "4:30 PM", status: "confirmed" });
    const early = request({ showingId: "22222222-2222-4222-8222-222222222222", scheduledAt: "2026-12-01T15:00:00.000Z", scheduledTimeLabel: "10:00 AM" });
    const nodes = nodesOf(buildBrokerOverviewOperations(view({
      todaySchedule: [early, late], todayTotal: 2,
      viewingRequests: [early, late], viewingRequestsTotal: 2,
    })));
    expect(find(nodes, "today")?.children).toEqual([
      "today-header", `today-${early.showingId}`, `today-${late.showingId}`,
    ]);
    expect(find(nodes, `today-${early.showingId}-time`)?.text).toBe("10:00 AM");
    expect(find(nodes, `today-${early.showingId}-neighborhood`)?.text).toBe("Laureles");
    expect(find(nodes, `today-${early.showingId}-badge`)?.label).toBe("Requested");
    expect(find(nodes, `today-${early.showingId}-badge`)?.color).toBe("warning");
    expect(find(nodes, `today-${late.showingId}-badge`)?.color).toBe("success");
    // The Manage slot is the modal trigger, bound to the persisted expectation.
    expect(find(nodes, `today-${early.showingId}-modal`)?.trigger).toBe(`today-${early.showingId}-open`);
    expect(find(nodes, `today-${early.showingId}-confirm`)?.onClick).toEqual({
      functionCall: { "@call": "brokerViewingAction", args: {
        rendererKey, showingId: early.showingId, expectedStatus: early.status,
        expectedScheduledAt: early.scheduledAt, action: "confirm",
      } },
    });
    expect(find(nodes, `today-${early.showingId}-when-${Date.parse(early.scheduledAt)}`)?.value)
      .toEqual({ "@path": rescheduleDraftPath(early) });
  });

  it("bounds the upcoming preview, never repeats today, and labels the exact total", () => {
    const today = request({});
    const next = [0, 1, 2, 3, 4].map((index) => request({
      showingId: `${index}4444444-4444-4444-8444-444444444444`,
      scheduledAt: `2026-12-0${index + 2}T15:00:00.000Z`,
      scheduledLabel: `Wed, Dec ${index + 2}, 10:00 AM`,
    }));
    const nodes = nodesOf(buildBrokerOverviewOperations(view({
      todaySchedule: [today], todayTotal: 1,
      upcomingPreview: next, upcomingPreviewTotal: 12,
      viewingRequests: [today, ...next], viewingRequestsTotal: 6,
    })));
    expect(find(nodes, "upcoming")?.children).toEqual([
      "upcoming-header", ...next.map((row) => `next-${row.showingId}`), "upcoming-caption",
    ]);
    expect(find(nodes, "upcoming-caption")?.text).toBe("Showing the next 5 of 12 upcoming appointments after today.");
    expect(nodeIds(nodes).some((id) => id.startsWith(`today-${next[0]!.showingId}`))).toBe(false);

    // All upcoming appointments after today (not just the preview) stay reachable.
    expect(find(nodes, "upcoming-all-open")?.label).toBe("View all requests");
    expect(find(nodes, "upcoming-all-modal")?.trigger).toBe("upcoming-all-open");
    expect(find(nodes, "all-body")?.children).toEqual(
      [today, ...next].map((row) => `all-${row.showingId}-row`),
    );
    expect(find(nodes, "upcoming-all-caption")?.text).toBe("All 6 viewing requests.");
  });

  it("labels a later request page without implying there are no appointments", () => {
    const later = { ...view({
      viewingRequests: [request({})], viewingRequestsTotal: 76, viewingRequestsOffset: 50,
    }) };
    expect(find(nodesOf(buildBrokerOverviewOperations(later)), "upcoming-all-caption")?.text)
      .toBe("Requests 51–51 of 76.");
  });

  it("binds only the persisted status's actions and reads the reschedule draft from the data model", () => {
    const confirmed = request({ status: "confirmed" });
    const closed = request({ showingId: "66666666-6666-4666-8666-666666666666", status: "completed" });
    const nodes = nodesOf(buildBrokerOverviewOperations(view({
      todaySchedule: [confirmed, closed], todayTotal: 2,
      viewingRequests: [confirmed, closed], viewingRequestsTotal: 2,
    })));
    expect(find(nodes, `today-${confirmed.showingId}-confirm`)).toBeUndefined();
    expect(find(nodes, `today-${confirmed.showingId}-cancel`)?.label).toBe("Cancel");
    expect((find(nodes, `today-${confirmed.showingId}-content`)?.children as string[]))
      .not.toContain(`today-${confirmed.showingId}-reschedule`);
    expect((find(nodes, `today-${closed.showingId}-content`)?.children as string[]))
      .toEqual([`today-${closed.showingId}-facts`, `today-${closed.showingId}-closed`]);
  });

  it("gives each placement its own modal trigger but one shared reschedule draft per request", () => {
    const row = request({});
    const nodes = nodesOf(buildBrokerOverviewOperations(view({
      todaySchedule: [row], todayTotal: 1,
      upcomingPreview: [row], upcomingPreviewTotal: 1,
      viewingRequests: [row], viewingRequestsTotal: 1,
    })));
    const placements = ["today", "next", "all"];
    const triggers = placements.map((placement) => find(nodes, `${placement}-${row.showingId}-modal`)?.trigger);
    // Three independent dialogs: no duplicate component id can steal focus or state.
    expect(triggers).toEqual(placements.map((placement) => `${placement}-${row.showingId}-open`));
    // One draft per persisted request, so an edit opened from Today also shows in
    // Upcoming and in the View all table, and a refresh cannot split the value.
    const draft = rescheduleDraftPath(row);
    for (const placement of placements) {
      expect(find(nodes, `${placement}-${row.showingId}-when-${Date.parse(row.scheduledAt)}`)?.value)
        .toEqual({ "@path": draft });
    }
  });

  it("uses a truthful badge tone for every persisted status", () => {
    expect(brokerViewingStatusTone("scheduled")).toBe("warning");
    expect(brokerViewingStatusTone("confirmed")).toBe("success");
    expect(brokerViewingStatusTone("cancelled")).toBe("danger");
    expect(brokerViewingStatusTone("no_show")).toBe("danger");
    expect(brokerViewingStatusTone("completed")).toBe("secondary");
  });
});
