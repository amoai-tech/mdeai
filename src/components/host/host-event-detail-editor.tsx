"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateHostEvent } from "@/app/app/events/[id]/actions";
import {
  formatBogotaInput,
  type EventUpdateFieldErrors,
  type EventUpdateResult,
} from "@/lib/events/update-event-core";
import type { HostEventDetail } from "@/lib/events/load-host-event";

type Props = { detail: HostEventDetail };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  published: "Published",
  live: "Live",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function cop(cents: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * SAN-885 — manual editor for one saved event.
 *
 * The form sends the revision it loaded (`expectedUpdatedAt`). A stale revision
 * returns CONFLICT and the UI never pretends the save succeeded.
 */
export function HostEventDetailEditor({ detail }: Props) {
  const { event, tiers, summary } = detail;
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [startTime, setStartTime] = useState(formatBogotaInput(event.eventStartTime));
  const [endTime, setEndTime] = useState(formatBogotaInput(event.eventEndTime));
  const [address, setAddress] = useState(event.address ?? "");
  const [city, setCity] = useState(event.city ?? "Medellín");
  const [revision, setRevision] = useState(event.updatedAt);
  const [result, setResult] = useState<EventUpdateResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<EventUpdateFieldErrors>({});
  const [pending, startTransition] = useTransition();

  const revenue = summary?.revenue_cents ?? 0;
  const sold = summary?.kpis?.tickets_sold ?? 0;
  const checkedIn = summary?.kpis?.checked_in ?? 0;

  function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setResult(null);
    setFieldErrors({});
    startTransition(async () => {
      const next = await updateHostEvent({
        eventId: event.id,
        expectedUpdatedAt: revision,
        name,
        description,
        eventStartTime: startTime,
        eventEndTime: endTime,
        address,
        city,
      });
      setResult(next);
      if (next.ok) {
        setRevision(next.updatedAt);
      } else if (next.fieldErrors) {
        setFieldErrors(next.fieldErrors);
      }
    });
  }

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

      <dl className="grid gap-3 sm:grid-cols-3" data-testid="host-event-detail-kpis">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Revenue</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="detail-kpi-revenue">
            {cop(revenue)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Tickets sold</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="detail-kpi-sold">
            {sold}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">Checked in</dt>
          <dd className="mt-1 text-lg font-semibold" data-testid="detail-kpi-checked-in">
            {checkedIn}
          </dd>
        </div>
      </dl>

      <form onSubmit={onSubmit} className="space-y-4" data-testid="host-event-edit-form">
        <div className="space-y-2">
          <Label htmlFor="event-name">Event name</Label>
          <Input
            id="event-name"
            name="name"
            value={name}
            onChange={(change) => setName(change.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            required
            maxLength={140}
          />
          {fieldErrors.name ? (
            <p className="text-xs text-destructive">{fieldErrors.name}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-description">Description</Label>
          <Textarea
            id="event-description"
            name="description"
            value={description}
            onChange={(change) => setDescription(change.target.value)}
            rows={5}
            maxLength={4000}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="event-start">Starts (Medellín time)</Label>
            <Input
              id="event-start"
              name="eventStartTime"
              type="datetime-local"
              value={startTime}
              onChange={(change) => setStartTime(change.target.value)}
              aria-invalid={Boolean(fieldErrors.eventStartTime)}
              required
            />
            {fieldErrors.eventStartTime ? (
              <p className="text-xs text-destructive">{fieldErrors.eventStartTime}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-end">Ends (optional)</Label>
            <Input
              id="event-end"
              name="eventEndTime"
              type="datetime-local"
              value={endTime}
              onChange={(change) => setEndTime(change.target.value)}
              aria-invalid={Boolean(fieldErrors.eventEndTime)}
            />
            {fieldErrors.eventEndTime ? (
              <p className="text-xs text-destructive">{fieldErrors.eventEndTime}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="event-address">Venue address</Label>
            <Input
              id="event-address"
              name="address"
              value={address}
              onChange={(change) => setAddress(change.target.value)}
              maxLength={240}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-city">City</Label>
            <Input
              id="event-city"
              name="city"
              value={city}
              onChange={(change) => setCity(change.target.value)}
              maxLength={80}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending} data-testid="host-event-save">
            {pending ? "Saving…" : "Save changes"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Saving updates this event only; tickets keep their IDs and sales.
          </span>
        </div>

        <div aria-live="polite" data-testid="host-event-save-status">
          {result?.ok ? (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              Saved. Refreshing keeps these values.
            </p>
          ) : null}
          {result && !result.ok ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">{result.message}</p>
              {result.code === "CONFLICT" ? (
                <a
                  href={`/app/events/${event.id}`}
                  className="mt-2 inline-flex min-h-9 items-center text-sm text-primary hover:underline"
                >
                  Reload latest changes
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>

      <section className="space-y-2" data-testid="host-event-tiers">
        <h2 className="font-serif text-lg font-semibold">Ticket tiers</h2>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ticket tiers yet. Buyers cannot purchase until tiers exist.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Sold</th>
                  <th className="py-2 pr-3">Held</th>
                  <th className="py-2">Capacity</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{tier.name}</td>
                    <td className="py-2 pr-3">{cop(tier.price_cents)}</td>
                    <td className="py-2 pr-3">{tier.qty_sold}</td>
                    <td className="py-2 pr-3">{tier.qty_pending}</td>
                    <td className="py-2">{tier.qty_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
