import { formatMoney } from "@/lib/events/format-money";
import type { EventDashboardSummary } from "@/lib/events/load-host-event";

const LABELS = [
  { key: "revenue", label: "Revenue", testId: "detail-kpi-revenue" },
  { key: "sold", label: "Tickets sold", testId: "detail-kpi-sold" },
  { key: "checkedIn", label: "Checked in", testId: "detail-kpi-checked-in" },
] as const;

/**
 * SAN-885 — the three real numbers on one event. Values come from
 * `event_dashboard_summary`; when unavailable, show unknown, never a fake zero.
 */
export function HostEventKpiRow({
  summary,
  currency,
}: {
  summary: EventDashboardSummary | null;
  currency: string | null;
}) {
  const values: Record<(typeof LABELS)[number]["key"], string> = {
    revenue: summary?.revenue_cents == null ? "—" : formatMoney(summary.revenue_cents, currency ?? "COP"),
    sold: summary?.kpis?.tickets_sold == null ? "—" : String(summary.kpis.tickets_sold),
    checkedIn: summary?.kpis?.checked_in == null ? "—" : String(summary.kpis.checked_in),
  };

  return (
    <dl className="grid gap-3 sm:grid-cols-3" data-testid="host-event-detail-kpis">
      {LABELS.map((item) => (
        <div key={item.key} className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid={item.testId}>
            {values[item.key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
