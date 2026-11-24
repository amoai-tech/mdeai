import { describe, expect, it } from "vitest";
import { validateOperation } from "@copilotkit/shared";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import type { z } from "zod";
import type { BrokerDashboardView, BrokerViewingRequest } from "../broker-dashboard-types";
import { buildBrokerOverviewOperations, rescheduleDraftPath } from "../broker-overview-ui";

const request = (overrides: Partial<BrokerViewingRequest>): BrokerViewingRequest => ({
  leadId: "11111111-1111-4111-8111-111111111111",
  showingId: "22222222-2222-4222-8222-222222222222",
  apartmentId: "33333333-3333-4333-8333-333333333333",
  apartmentTitle: "Laureles 2BR",
  renterName: "Ana",
  scheduledAt: "2026-12-01T15:00:00.000Z",
  scheduledLabel: "Tue 1 Dec, 10:00",
  createdAt: "2026-11-20T15:00:00.000Z",
  status: "scheduled",
  ...overrides,
});

const view = (requests: BrokerViewingRequest[], total = requests.length): BrokerDashboardView => ({
  displayName: "Broker",
  kpis: [
    { id: "a", label: "Active listings", value: "4", provenance: "apartments", testId: "r1-kpi-0" },
    { id: "b", label: "Avg response time", value: "Data pending", provenance: "none", testId: "r1-kpi-3" },
  ],
  attention: [],
  viewingRequests: requests,
  viewingRequestsTotal: total,
  trends: [],
  briefing: { greeting: "", summary: "", bullets: [] },
  isEmpty: requests.length === 0,
});

type Node = Record<string, unknown> & { id: string; component: string };
const nodesOf = (ops: ReturnType<typeof buildBrokerOverviewOperations>) =>
  (ops[0].createSurface.components as Node[]);

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

describe("broker Overview as official CopilotKit components (SAN-1675)", () => {
  it("is accepted by the real catalog for an open, a confirmed and a closed request", () => {
    const ops = buildBrokerOverviewOperations(view([
      request({}),
      request({ showingId: "44444444-4444-4444-8444-444444444444", status: "confirmed", renterName: null }),
      request({ showingId: "55555555-5555-4555-8555-555555555555", status: "completed", apartmentTitle: null }),
    ], 60));
    acceptedByCatalog(ops);
  });

  it("is accepted with no requests and shows honest empty states instead of a zero chart", () => {
    const ops = buildBrokerOverviewOperations(view([]));
    acceptedByCatalog(ops);
    const nodes = nodesOf(ops);
    expect(nodes.find((n) => n.id === "status-chart")).toBeDefined();
    expect((nodes.find((n) => n.id === "summary")?.children as string[])).toEqual(["kpis", "status-empty"]);
    expect(nodes.find((n) => n.id === "viewings")?.component).toBe("Caption");
  });

  it("charts real counts by status and labels a truncated page", () => {
    const nodes = nodesOf(buildBrokerOverviewOperations(view([
      request({}), request({ showingId: "44444444-4444-4444-8444-444444444444", status: "confirmed" }),
      request({ showingId: "66666666-6666-4666-8666-666666666666" }),
    ], 9)));
    const chart = nodes.find((n) => n.id === "status-chart")!;
    expect(chart.data).toEqual([{ status: "Requested", requests: 2 }, { status: "Confirmed", requests: 1 }]);
    expect(chart.title).toBe("Viewing requests by status (latest 3 of 9)");
    expect(chart.yAxis).toEqual({ label: "Requests", min: 0, max: 4 });
    // KPI values are passed through verbatim; "Data pending" never becomes 0.
    expect((nodes.find((n) => n.id === "kpis")!.items as Array<{ value: string }>).map((i) => i.value)).toEqual(["4", "Data pending"]);
  });

  it("binds only the persisted status's actions, by showing ID, and reads the reschedule draft from the data model", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const nodes = nodesOf(buildBrokerOverviewOperations(view([request({ showingId: id })])));
    expect(nodes.find((n) => n.id === "req-0-confirm")?.onClick).toEqual({
      functionCall: { "@call": "brokerViewingAction", args: { showingId: id, action: "confirm" } },
    });
    expect(nodes.find((n) => n.id === "req-0-move")?.onClick).toEqual({
      functionCall: { "@call": "brokerViewingAction",
        args: { showingId: id, action: "reschedule", newWallClock: { "@path": rescheduleDraftPath(id) } } },
    });
    expect(nodes.find((n) => n.id === "req-0-when")?.value).toEqual({ "@path": rescheduleDraftPath(id) });
    // A confirmed request can only be cancelled; a closed one has no actions.
    const confirmed = nodesOf(buildBrokerOverviewOperations(view([request({ status: "confirmed" })])));
    expect(confirmed.some((n) => n.id === "req-0-confirm")).toBe(false);
    expect(confirmed.find((n) => n.id === "req-0-cancel")?.label).toBe("Cancel");
    expect((confirmed.find((n) => n.id === "req-0-content")?.children as string[])).not.toContain("req-0-reschedule");
    const closed = nodesOf(buildBrokerOverviewOperations(view([request({ status: "completed" })])));
    expect((closed.find((n) => n.id === "req-0-content")?.children as string[])).toEqual(["req-0-facts", "req-0-closed"]);
  });
});
