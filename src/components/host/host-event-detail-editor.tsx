import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HostEventDetail } from "@/lib/events/load-host-event";
import { HostEventEditForm } from "./host-event-edit-form";
import { HostEventKpiRow } from "./host-event-kpi-row";
import { HostEventTierTable } from "./host-event-tier-table";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  published: "Published",
  live: "Live",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

type Props = { detail: HostEventDetail };

/**
 * SAN-885 — one saved event inside the canonical /app workspace.
 *
 * Composition only: header, real KPIs, the manual edit form and the tier
 * inventory are separate owners. Nothing here computes money or dates.
 */
export function HostEventDetailEditor({ detail }: Props) {
  const { event, tiers, summary } = detail;
  const statusLabel = STATUS_LABEL[event.status] ?? event.status;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-semibold" data-testid="host-event-detail-name">
              {event.name}
            </h1>
            <Badge variant={event.status === "published" ? "default" : "outline"}>
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.address ?? "Venue TBD"}
            {event.city ? ` · ${event.city}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/events"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            My events
          </Link>
          {event.slug ? (
            <Link
              href={`/events/${event.slug}`}
              data-testid="host-event-detail-public"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Public page
            </Link>
          ) : null}
        </div>
      </header>

      <HostEventKpiRow summary={summary} currency={event.currency} />
      <HostEventEditForm detail={detail} />
      <HostEventTierTable tiers={tiers} />
    </div>
  );
}
