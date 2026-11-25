import type { BrokerAttentionItem, BrokerDashboardView, BrokerViewingRequest } from "./broker-dashboard-types";
import {
  availableBrokerViewingActions,
  brokerViewingActionLabel,
  brokerViewingStatusLabel,
} from "./broker-viewing-action";

/**
 * SAN-1710 — the broker Overview as official CopilotKit Standard Catalog operations,
 * built from the real RLS-scoped `BrokerDashboardView`.
 *
 * Shape: one header Row, a four-column Grid of outlined KPI Cards, an outlined
 * Needs attention Card, an outlined Today Card and a bounded Upcoming Card.
 * There is no chart and no internal tab strip: the broker sees the numbers,
 * what needs a decision and today's real appointments on first paint.
 *
 * No AI turn: the page ingests these operations directly (see `MdeDashboardSurface`).
 * Every value comes from the loaded view; nothing is estimated. Viewing actions call
 * the registered `brokerViewingAction` function with a showing ID and a private
 * dashboard mount key; the page resolves the record and sends the persisted
 * status/time to the existing PATCH route.
 */

const A2UI_VERSION = "1.0";
export const BROKER_OVERVIEW_SURFACE_ID = "broker-overview";

/** A changed persisted expectation starts a fresh draft, never re-bases an old edit. */
export function rescheduleDraftPath(request: Pick<BrokerViewingRequest, "showingId" | "status" | "scheduledAt">): string {
  return `/reschedule/${request.showingId}/${encodeURIComponent(request.status)}/${encodeURIComponent(request.scheduledAt)}`;
}

/** Badge tone for a persisted status. Closed states never look actionable. */
export function brokerViewingStatusTone(status: string): "secondary" | "success" | "warning" | "danger" {
  if (status === "scheduled") return "warning";
  if (status === "confirmed") return "success";
  if (status === "cancelled" || status === "no_show") return "danger";
  return "secondary";
}

type Node = Record<string, unknown> & { id: string; component: string };

type NavTarget = "listings" | "new_listing" | "ask_mde";

function attentionIcon(item: BrokerAttentionItem): string {
  if (item.kind === "lead_unanswered") return "users";
  if (item.kind === "viewing_pending") return "calendar";
  return "building";
}

function requestKey(request: BrokerViewingRequest, placement: string): string {
  return `${placement}-${request.showingId}`;
}

/**
 * The modal and its content for one viewing request, wired to the existing
 * authorized handler. The trigger Button is referenced by the Modal's `trigger`
 * slot, so it renders wherever the Modal node is placed; the page resolves the
 * showing from its loaded rows and the server still enforces ownership.
 */
function requestModalNodes(request: BrokerViewingRequest, rendererKey: string, placement: string): Node[] {
  const key = requestKey(request, placement);
  const dateKey = `${key}-when-${Date.parse(request.scheduledAt)}`;
  const call = (action: string, extra: Record<string, unknown> = {}) => ({
    functionCall: { "@call": "brokerViewingAction", args: { rendererKey, showingId: request.showingId, expectedStatus: request.status, expectedScheduledAt: request.scheduledAt, action, ...extra } },
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
  return [
    ...nodes,
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
      children: [dateKey, `${key}-move`] },
    { id: dateKey, component: "DateTimeInput", label: "New viewing time (Medellín)",
      enableDate: true, enableTime: true, timeStep: 30,
      value: { "@path": rescheduleDraftPath(request) } },
    { id: `${key}-move`, component: "Button", size: "sm", label: "Move viewing", icon: "calendar-sync",
      onClick: call("reschedule", { newWallClock: { "@path": rescheduleDraftPath(request) } }) },
  ];
}

/** One row of the full-requests table. The Manage cell hosts the modal node. */
function requestTableRow(request: BrokerViewingRequest, placement: string): Node[] {
  const key = requestKey(request, placement);
  return [
    { id: `${key}-row`, component: "TableRow", children: [`${key}-apt`, `${key}-renter`, `${key}-when-cell`, `${key}-status`, `${key}-manage`] },
    { id: `${key}-apt`, component: "TableCell", text: request.apartmentTitle ?? "Untitled listing" },
    { id: `${key}-renter`, component: "TableCell", text: request.renterName ?? "Not provided" },
    { id: `${key}-when-cell`, component: "TableCell", text: request.scheduledLabel },
    { id: `${key}-status`, component: "TableCell", children: [`${key}-badge`] },
    { id: `${key}-badge`, component: "Badge", size: "sm", label: brokerViewingStatusLabel(request.status), color: brokerViewingStatusTone(request.status) },
    { id: `${key}-manage`, component: "TableCell", children: [`${key}-modal`] },
  ];
}

/** One appointment row: local time, real listing and neighborhood, status, Manage. */
function appointmentRow(request: BrokerViewingRequest, placement: "today" | "next"): Node[] {
  const key = requestKey(request, placement);
  const when = placement === "today" ? request.scheduledTimeLabel : request.scheduledLabel;
  const bodyChildren = [`${key}-title`];
  if (request.apartmentNeighborhood) bodyChildren.push(`${key}-neighborhood`);
  return [
    { id: key, component: "Row", gap: 3, align: "center", wrap: "wrap", minWidth: 0,
      children: [`${key}-time`, `${key}-body`, `${key}-badge`, `${key}-modal`] },
    { id: `${key}-time`, component: "Text", text: when, fontWeight: "semibold", tabularNums: true },
    // Keep a readable title floor; the status badge and Manage wrap under it on
    // narrow widths instead of truncating the listing name to an ellipsis.
    { id: `${key}-body`, component: "Column", gap: 0, flex: 1, minWidth: "10rem", children: bodyChildren },
    { id: `${key}-title`, component: "Text", text: request.apartmentTitle ?? "Your listing", maxLines: 2 },
    ...(request.apartmentNeighborhood
      ? [{ id: `${key}-neighborhood`, component: "Caption", size: "sm", text: request.apartmentNeighborhood } as Node]
      : []),
    { id: `${key}-badge`, component: "Badge", size: "sm", label: brokerViewingStatusLabel(request.status), color: brokerViewingStatusTone(request.status) },
  ];
}

function upcomingCaption(shown: number, total: number): string {
  if (total <= shown) return `All ${total} upcoming appointment${total === 1 ? "" : "s"} after today.`;
  return `Showing the next ${shown} of ${total} upcoming appointments after today.`;
}

function requestsPageCaption(view: BrokerDashboardView): string {
  const offset = view.viewingRequestsOffset ?? 0;
  const total = view.viewingRequestsTotal;
  if (total === 0) return "No viewing requests yet.";
  if (offset > 0) return `Requests ${offset + 1}–${offset + view.viewingRequests.length} of ${total}.`;
  return view.viewingRequests.length < total
    ? `Showing the latest ${view.viewingRequests.length} of ${total} requests.`
    : `All ${total} viewing requests.`;
}

export function buildBrokerOverviewOperations(
  view: BrokerDashboardView,
  rendererKey: string,
) {
  const navigate = (target: NavTarget) => ({
    functionCall: { "@call": "brokerOverviewNavigate", args: { rendererKey, target } },
  });

  const todayIsPartial = view.todaySchedule.length < view.todayTotal;
  const todayRows = view.todaySchedule.flatMap((request) => [
    ...requestModalNodes(request, rendererKey, "today"),
    ...appointmentRow(request, "today"),
  ]);
  const upcomingRows = view.upcomingPreview.flatMap((request) => [
    ...requestModalNodes(request, rendererKey, "next"),
    ...appointmentRow(request, "next"),
  ]);
  const requestTableRows = view.viewingRequests.flatMap((request) => [
    ...requestModalNodes(request, rendererKey, "all"),
    ...requestTableRow(request, "all"),
  ]);

  const upcomingHeaderChildren = ["upcoming-heading"];
  if (view.viewingRequestsTotal > 0) upcomingHeaderChildren.push("upcoming-all-modal");

  const components: Node[] = [
    { id: "root", component: "Column", gap: 4, minWidth: 0,
      children: ["header", "kpis", "attention", "today", "upcoming"] },

    // ── Page header: title, one definition, and the two real actions ─────────
    { id: "header", component: "Row", gap: 2, align: "center", justify: "spaceBetween", wrap: "wrap", minWidth: 0,
      children: ["header-titles", "header-actions"] },
    // A 14rem floor keeps the title and definition readable on a phone: the two
    // actions wrap to their own line instead of squeezing the heading.
    { id: "header-titles", component: "Column", gap: 1, flex: 1, minWidth: "14rem", children: ["header-title", "header-subtitle"] },
    { id: "header-title", component: "Title", size: "2xl", text: "Overview" },
    { id: "header-subtitle", component: "Caption", size: "sm", text: "Manage your rentals, enquiries and appointments." },
    { id: "header-actions", component: "Row", gap: 2, wrap: "wrap", children: ["header-ask", "header-new"] },
    { id: "header-ask", component: "Button", size: "sm", variant: "soft", icon: "sparkles", label: "Ask MDE", onClick: navigate("ask_mde") },
    { id: "header-new", component: "Button", size: "sm", variant: "primary", icon: "plus", label: "New listing", onClick: navigate("new_listing") },

    // ── Exactly four metrics: four columns at desktop, 2×2 at 320/390 ────────
    { id: "kpis", component: "Grid", columns: 4, gap: 3,
      children: view.kpis.slice(0, 4).map((kpi) => `kpi-${kpi.id}`) },
    ...view.kpis.slice(0, 4).flatMap((kpi): Node[] => [
      { id: `kpi-${kpi.id}`, component: "Card", variant: "outline", gap: 2,
        children: [`kpi-${kpi.id}-label`, `kpi-${kpi.id}-value`] },
      { id: `kpi-${kpi.id}-label`, component: "Caption", size: "sm", text: kpi.label },
      { id: `kpi-${kpi.id}-value`, component: "Title", size: "2xl", text: kpi.value },
    ]),

    // ── Needs attention: exact aggregate counts with honest actions ──────────
    { id: "attention", component: "Card", variant: "outline", gap: 3, children: ["attention-title", ...(
      view.attention.length > 0
        ? view.attention.map((item) => `attn-${item.id}`)
        : ["attention-empty"]
    )] },
    { id: "attention-title", component: "Title", size: "lg", text: "Needs attention" },
    ...(view.attention.length > 0 ? view.attention.flatMap((item): Node[] => {
      const key = `attn-${item.id}`;
      const row: Node = { id: key, component: "Row", gap: 2, align: "center", wrap: "wrap", minWidth: 0,
        children: [`${key}-icon`, `${key}-body`, ...(item.action ? [`${key}-cta`] : [])] };
      const body: Node[] = [
        { id: `${key}-body`, component: "Column", gap: 0, flex: 1, minWidth: "9rem", children: [`${key}-title`, `${key}-detail`] },
        { id: `${key}-title`, component: "Text", text: item.title, fontWeight: "medium" },
        { id: `${key}-detail`, component: "Caption", size: "sm", text: item.detail },
      ];
      const icon: Node = { id: `${key}-icon`, component: "Icon", name: attentionIcon(item), size: "sm", color: "secondary" };
      const cta: Node[] = item.action ? [{
        id: `${key}-cta`, component: "Button", size: "sm", variant: "borderless",
        label: item.ctaLabel ?? "Open", onClick: navigate(item.action),
      }] : [];
      return [row, icon, ...body, ...cta];
    }) : [{ id: "attention-empty", component: "Caption", text: "Nothing needs your attention right now." }]),

    // ── Today: the real local-day schedule, chronological ───────────────────
    { id: "today", component: "Card", variant: "outline", gap: 3, children: ["today-header", ...(
      view.todaySchedule.length > 0
        ? view.todaySchedule.map((request) => requestKey(request, "today"))
        : todayIsPartial ? [] : ["today-empty"]
    ), ...(todayIsPartial ? ["today-caption"] : [])] },
    { id: "today-header", component: "Row", gap: 2, align: "baseline", justify: "spaceBetween", wrap: "wrap",
      children: ["today-title", "today-zone"] },
    { id: "today-title", component: "Title", size: "lg", text: "Today" },
    { id: "today-zone", component: "Caption", size: "sm", text: "Medellín time" },
    ...(view.todaySchedule.length > 0
      ? todayRows
      : todayIsPartial ? [] : [{ id: "today-empty", component: "Caption", text: "No viewings scheduled for today." }]),
    ...(todayIsPartial ? [{
      id: "today-caption", component: "Caption", size: "sm",
      text: `Showing ${view.todaySchedule.length} of ${view.todayTotal} appointments today.`,
    }] : []),

    // ── Upcoming after today: bounded preview + full request access ──────────
    { id: "upcoming", component: "Card", variant: "outline", gap: 3, children: [
      "upcoming-header",
      ...(view.upcomingPreview.length > 0
        ? [...view.upcomingPreview.map((request) => requestKey(request, "next")), "upcoming-caption"]
        : ["upcoming-empty"]),
    ] },
    { id: "upcoming-header", component: "Row", gap: 2, align: "center", justify: "spaceBetween", wrap: "wrap",
      children: upcomingHeaderChildren },
    { id: "upcoming-heading", component: "Column", gap: 0, flex: 1, minWidth: 0,
      children: ["upcoming-title", "upcoming-subtitle"] },
    { id: "upcoming-title", component: "Title", size: "lg", text: "Upcoming after today" },
    { id: "upcoming-subtitle", component: "Caption", size: "sm", text: "After today" },
    ...(view.upcomingPreview.length > 0
      ? [...upcomingRows, {
          id: "upcoming-caption", component: "Caption", size: "sm",
          text: upcomingCaption(view.upcomingPreview.length, view.upcomingPreviewTotal),
        }]
      : [{ id: "upcoming-empty", component: "Caption", text: "No upcoming appointments after today." }]),

    // The full bounded request page stays reachable without a second tab strip.
    ...(view.viewingRequestsTotal > 0 ? [
      { id: "upcoming-all-modal", component: "Modal", title: "Viewing requests", maxWidth: "44rem",
        trigger: "upcoming-all-open", content: "upcoming-all-content" },
      { id: "upcoming-all-open", component: "Button", size: "sm", variant: "soft", label: "View all requests" },
      { id: "upcoming-all-content", component: "Column", gap: 3, children: ["upcoming-all-caption", "all-table"] },
      { id: "upcoming-all-caption", component: "Caption", size: "sm", text: requestsPageCaption(view) },
      { id: "all-table", component: "Table", caption: "Viewing requests", children: ["all-head", "all-body"] },
      { id: "all-head", component: "TableSection", header: true, children: ["all-head-row"] },
      { id: "all-head-row", component: "TableRow", header: true,
        children: ["all-h-apt", "all-h-renter", "all-h-when", "all-h-status", "all-h-manage"] },
      { id: "all-h-apt", component: "TableCell", header: true, text: "Apartment" },
      { id: "all-h-renter", component: "TableCell", header: true, text: "Renter" },
      { id: "all-h-when", component: "TableCell", header: true, text: "Viewing time" },
      { id: "all-h-status", component: "TableCell", header: true, text: "Status" },
      { id: "all-h-manage", component: "TableCell", header: true, text: "Action" },
      { id: "all-body", component: "TableSection", rowDivider: true,
        children: view.viewingRequests.map((request) => `${requestKey(request, "all")}-row`) },
      ...requestTableRows,
    ] : []),
  ];

  return [{ version: A2UI_VERSION, createSurface: { surfaceId: BROKER_OVERVIEW_SURFACE_ID, components } }];
}
