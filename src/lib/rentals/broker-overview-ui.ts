import type { BrokerDashboardView, BrokerViewingRequest } from "./broker-dashboard-types";
import {
  availableBrokerViewingActions,
  brokerViewingActionLabel,
  brokerViewingStatusLabel,
} from "./broker-viewing-action";

/**
 * SAN-1675 / SAN-1710 — the broker Overview as official CopilotKit Standard
 * Catalog operations, built from the real RLS-scoped `BrokerDashboardView`.
 *
 * No AI turn: the page ingests these operations directly (see
 * `MdeDashboardSurface`). Every value comes from the loaded view; nothing is
 * estimated. Viewing actions call the registered `brokerViewingAction`
 * function with only a showing ID; the page resolves the record and sends the
 * persisted status/time to the existing PATCH route.
 */

const A2UI_VERSION = "1.0";
export const BROKER_OVERVIEW_SURFACE_ID = "broker-overview";

/** Data-model path holding the broker's draft reschedule time for one showing. */
export function rescheduleDraftPath(showingId: string): string {
  return `/reschedule/${showingId}`;
}

type Node = Record<string, unknown> & { id: string; component: string };

function statusCounts(requests: readonly BrokerViewingRequest[]) {
  const counts = new Map<string, number>();
  for (const request of requests) {
    const label = brokerViewingStatusLabel(request.status);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([status, count]) => ({ status, requests: count }));
}

function requestNodes(request: BrokerViewingRequest, index: number): { cells: Node[]; nodes: Node[] } {
  const key = `req-${index}`;
  const call = (action: string, extra: Record<string, unknown> = {}) => ({
    functionCall: { "@call": "brokerViewingAction", args: { showingId: request.showingId, action, ...extra } },
  });
  const actions = availableBrokerViewingActions(request.status);
  const actionIds: string[] = [];
  const nodes: Node[] = [];
  for (const action of actions) {
    if (action === "reschedule") continue;
    const id = `${key}-${action}`;
    actionIds.push(id);
    nodes.push({
      id, component: "Button", size: "sm",
      variant: action === "confirm" ? "primary" : "default",
      label: brokerViewingActionLabel(action, request.status),
      onClick: call(action),
    });
  }
  const contentChildren = [`${key}-facts`];
  if (actionIds.length > 0) contentChildren.push(`${key}-actions`);
  if (actions.includes("reschedule")) contentChildren.push(`${key}-reschedule`);
  if (actions.length === 0) contentChildren.push(`${key}-closed`);
  nodes.push(
    { id: `${key}-modal`, component: "Modal", title: request.apartmentTitle ?? "Viewing request",
      // The 1.88 Modal reads a number as 4px spacing steps (480 => 1920px); pass CSS instead.
      maxWidth: "32rem",
      trigger: `${key}-open`, content: `${key}-content` },
    { id: `${key}-open`, component: "Button", size: "sm", variant: "soft", icon: "calendar-clock", label: "Manage" },
    { id: `${key}-content`, component: "Column", gap: 3, children: contentChildren },
    { id: `${key}-facts`, component: "List", marker: "none", items: [
      { label: "Renter", value: request.renterName ?? "Not provided", icon: "user" },
      { label: "Viewing time", value: request.scheduledLabel, icon: "clock" },
      { label: "Status", value: brokerViewingStatusLabel(request.status), icon: "circle-dot" },
    ] },
    { id: `${key}-actions`, component: "Row", gap: 2, wrap: "wrap", children: actionIds },
    { id: `${key}-closed`, component: "Caption", text: "This request is closed; no actions are available." },
    { id: `${key}-reschedule`, component: "Form", label: "Move this viewing", gap: 2,
      children: [`${key}-when`, `${key}-move`] },
    { id: `${key}-when`, component: "DateTimeInput", label: "New viewing time (Medellín)",
      enableDate: true, enableTime: true, timeStep: 30,
      value: { "@path": rescheduleDraftPath(request.showingId) } },
    { id: `${key}-move`, component: "Button", size: "sm", label: "Move viewing", icon: "calendar-sync",
      onClick: call("reschedule", { newWallClock: { "@path": rescheduleDraftPath(request.showingId) } }) },
  );
  const cells: Node[] = [
    { id: `${key}-row`, component: "TableRow", children: [`${key}-apt`, `${key}-renter`, `${key}-when-cell`, `${key}-status`, `${key}-manage`] },
    { id: `${key}-apt`, component: "TableCell", text: request.apartmentTitle ?? "Untitled listing" },
    { id: `${key}-renter`, component: "TableCell", text: request.renterName ?? "Not provided" },
    { id: `${key}-when-cell`, component: "TableCell", text: request.scheduledLabel },
    { id: `${key}-status`, component: "TableCell", children: [`${key}-badge`] },
    { id: `${key}-badge`, component: "Badge", size: "sm", label: brokerViewingStatusLabel(request.status) },
    { id: `${key}-manage`, component: "TableCell", children: [`${key}-modal`] },
  ];
  return { cells, nodes };
}

export function buildBrokerOverviewOperations(view: BrokerDashboardView) {
  const requests = view.viewingRequests;
  const counts = statusCounts(requests);
  const perRequest = requests.map(requestNodes);
  const truncated = view.viewingRequestsTotal > requests.length;

  const summaryChildren = ["kpis"];
  summaryChildren.push(counts.length > 0 ? "status-chart" : "status-empty");

  const components: Node[] = [
    { id: "root", component: "Column", gap: 3, children: ["header", "tabs"] },
    { id: "header", component: "Row", gap: 2, align: "center", children: ["header-icon", "header-title", "header-badge"] },
    { id: "header-icon", component: "Icon", name: "layout-dashboard", size: "sm" },
    { id: "header-title", component: "Title", text: "Overview", size: "md" },
    { id: "header-badge", component: "Badge", size: "sm", label: "Live data" },
    { id: "tabs", component: "Tabs", tabs: [
      { title: "Summary", child: "summary" },
      { title: `Viewings (${view.viewingRequestsTotal})`, child: "viewings" },
      { title: `Needs attention (${view.attention.length})`, child: "attention" },
    ] },
    { id: "summary", component: "Column", gap: 3, children: summaryChildren },
    { id: "kpis", component: "List", marker: "none",
      items: view.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, description: kpi.provenance })) },
    { id: "status-chart", component: "Chart", chartType: "bar", xKey: "status",
      series: [{ key: "requests", label: "Viewing requests" }], data: counts, height: 200, showLegend: false,
      // Counts are whole numbers: a max divisible by 4 keeps the 5 default ticks on integers.
      format: "number", yAxis: { label: "Requests", min: 0, max: Math.max(4, Math.ceil(Math.max(0, ...counts.map((c) => c.requests)) / 4) * 4) },
      title: truncated
        ? `Viewing requests by status (latest ${requests.length} of ${view.viewingRequestsTotal})`
        : "Viewing requests by status (all requests)" },
    { id: "status-empty", component: "Caption", text: "No viewing requests yet, so there is nothing to chart." },
    ...(requests.length > 0
      ? [
          { id: "viewings", component: "Column", gap: 2, children: truncated ? ["viewings-table", "viewings-more"] : ["viewings-table"] },
          { id: "viewings-table", component: "Table", children: ["viewings-head", "viewings-body"] },
          { id: "viewings-head", component: "TableSection", header: true, children: ["viewings-head-row"] },
          { id: "viewings-head-row", component: "TableRow", header: true,
            children: ["h-apt", "h-renter", "h-when", "h-status", "h-manage"] },
          { id: "h-apt", component: "TableCell", header: true, text: "Apartment" },
          { id: "h-renter", component: "TableCell", header: true, text: "Renter" },
          { id: "h-when", component: "TableCell", header: true, text: "Viewing time" },
          { id: "h-status", component: "TableCell", header: true, text: "Status" },
          { id: "h-manage", component: "TableCell", header: true, text: "Action" },
          { id: "viewings-body", component: "TableSection", rowDivider: true,
            children: perRequest.map((_, index) => `req-${index}-row`) },
          { id: "viewings-more", component: "Caption",
            text: `Showing the latest ${requests.length} of ${view.viewingRequestsTotal} requests.` },
          ...perRequest.flatMap(({ cells, nodes }) => [...cells, ...nodes]),
        ]
      : [{ id: "viewings", component: "Caption", text: "No viewing requests yet. They appear here when renters submit them." }]),
    view.attention.length > 0
      ? { id: "attention", component: "List", marker: "none",
          items: view.attention.map((item) => ({ label: item.title, description: item.detail, icon: "circle-alert" })) }
      : { id: "attention", component: "Caption", text: "Nothing needs your attention right now." },
  ];

  return [{ version: A2UI_VERSION, createSurface: { surfaceId: BROKER_OVERVIEW_SURFACE_ID, components } }];
}
