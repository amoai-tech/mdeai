import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventScopePicker } from "@/components/host/event-scope-picker";
import { getServerUser } from "@/lib/auth/session";
import { loadEventAttendees } from "@/lib/events/load-event-attendees";
import { loadHostEventOptions } from "@/lib/events/load-host-event-options";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Attendees · mdeai" };

const ATTENDEES_PER_PAGE = 50;

const ATTENDEE_STATUS_LABEL = new Map<string, string>(Object.entries({
  active: "Paid",
  pending: "Pending payment",
  refunded: "Refunded",
  cancelled: "Cancelled",
  used: "Checked in",
}));

type PageProps = {
  searchParams: Promise<{ event?: string; q?: string; page?: string }>;
};

/**
 * SAN-982 — the real attendee list for one organizer-owned event.
 *
 * Reads through `event_attendees_paginated` (organizer-scoped in SQL). Check-in
 * state comes from `qr_used_at`, so the page refreshes correctly after a scan.
 * Empty and failed are rendered differently; neither invents rows.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventAttendeesPage({ searchParams }: PageProps) {
  const { event: requestedEvent, q, page } = await searchParams;
  const search = (q ?? "").trim();
  const currentPage = /^(?:[1-9]\d{0,5})$/.test(page ?? "1") ? Number(page ?? "1") : 1;
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/events/attendees");

  const supabase = await createClient();
  const options = await loadHostEventOptions(supabase, user.id);

  if (requestedEvent && !options.some((option) => option.id === requestedEvent)) {
    notFound();
  }

  if (options.length === 0) {
    return (
      <section className="space-y-4" data-testid="host-attendees-empty">
        <h1 className="font-serif text-2xl font-semibold">Attendees</h1>
        <p className="text-sm text-muted-foreground">
          You have no events yet, so there are no attendees to show.
        </p>
        <Link href="/app/events/new" className="text-sm text-primary hover:underline">
          Create an event
        </Link>
      </section>
    );
  }

  const selectedId = requestedEvent ?? options[0].id;
  const result = await loadEventAttendees(supabase, user.id, selectedId, {
    search, limit: ATTENDEES_PER_PAGE, offset: (currentPage - 1) * ATTENDEES_PER_PAGE,
  });

  if (result.status === "not_found") notFound();

  if (result.status === "error") {
    return (
      <section className="space-y-3" data-testid="host-attendees-error">
        <h1 className="font-serif text-2xl font-semibold">Attendees</h1>
        <p className="text-sm text-destructive">{result.message}</p>
        <Link
          href={`/app/events/attendees?event=${selectedId}`}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </Link>
      </section>
    );
  }

  const { attendees } = result;
  const checkedIn = attendees.rows.filter((row) => row.qr_used_at).length;
  const totalPages = Math.max(1, Math.ceil(attendees.total / attendees.limit));
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams({ event: attendees.event.id });
    if (search) params.set("q", search);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/app/events/attendees?${params.toString()}`;
  };
  // A search narrowing or a deleted attendee can invalidate a saved page URL.
  if (currentPage > totalPages) redirect(pageHref(totalPages));

  return (
    <section className="space-y-6" data-testid="host-attendees">
      <header className="space-y-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold">Attendees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {attendees.event.name} · {attendees.total} attendee
            {attendees.total === 1 ? "" : "s"}
            {attendees.rows.length > 0 ? ` · ${checkedIn} checked in on this page` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <EventScopePicker
            options={options}
            selectedId={attendees.event.id}
            basePath="/app/events/attendees"
            testId="host-attendees-event-picker"
          />
          <form action="/app/events/attendees" method="get" className="flex items-end gap-2">
            <input type="hidden" name="event" value={attendees.event.id} />
            <label className="flex flex-col gap-1 text-xs uppercase text-muted-foreground">
              Search
              <input
                name="q"
                defaultValue={search}
                placeholder="Name or email"
                className="min-h-11 rounded-md border border-border bg-background px-3 text-sm normal-case"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              Filter
            </button>
          </form>
        </div>
      </header>

      {attendees.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="host-attendees-none">
          {search
            ? `No attendee matches “${search}” for this event.`
            : "No attendees yet. Tickets sold appear here after a paid order."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="host-attendees-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Order</th>
                <th className="py-2">Checked in</th>
              </tr>
            </thead>
            <tbody>
              {attendees.rows.map((row) => {
                const status = (row.status ?? "").toLowerCase();
                return (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{row.full_name ?? "—"}</td>
                    <td className="py-2 pr-3">{row.email ?? "—"}</td>
                    <td className="py-2 pr-3">{row.tier_name ?? "—"}</td>
                    <td className="py-2 pr-3" data-attendee-status={status}>
                      {ATTENDEE_STATUS_LABEL.get(status) ?? (row.status || "Unknown")}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.order_short_id ?? "—"}</td>
                    <td className="py-2">
                      {row.qr_used_at ? (
                        <span className="text-foreground">
                          {new Date(row.qr_used_at).toLocaleString("en-US", {
                            timeZone: "America/Bogota",
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Showing {attendees.rows.length} of {attendees.total} on page {currentPage}.
          Refunded and cancelled attendees stay listed with their real status.
        </p>
        <nav aria-label="Attendee pages" data-testid="host-attendees-pagination"
          className="flex items-center gap-3">
          {currentPage > 1 ? (
            <Link data-testid="host-attendees-prev" href={pageHref(currentPage - 1)}
              className="min-h-11 rounded-md border border-border px-3 py-2 hover:bg-muted">
              Previous
            </Link>
          ) : null}
          <span>Page {currentPage} of {totalPages}</span>
          {currentPage < totalPages ? (
            <Link data-testid="host-attendees-next" href={pageHref(currentPage + 1)}
              className="min-h-11 rounded-md border border-border px-3 py-2 hover:bg-muted">
              Next
            </Link>
          ) : null}
        </nav>
      </div>
    </section>
  );
}
