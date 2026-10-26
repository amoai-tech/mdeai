import { redirect } from "next/navigation";
import { AdminEventsTable, type AdminEventRow } from "@/components/admin/admin-events-table";
import { getAdminGate } from "@/lib/auth/admin-gate";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Events · Admin · mdeai" };

const FILTERS = ["all", "published", "draft", "live", "cancelled"] as const;

type PageProps = {
  searchParams: Promise<{ status?: string; inactive?: string }>;
};

/**
 * SAN-515 — Super Admin event management at its canonical /app address.
 *
 * Authorization is the shared `getAdminGate()` server check (`public.is_admin()`
 * covers admin and super_admin); the navigation never acts as the boundary.
 * Ordinary accounts see a denial page and can perform no mutation.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AdminEventsPage({ searchParams }: PageProps) {
  const { status, inactive } = await searchParams;
  const gate = await getAdminGate();

  if (gate.status === "guest") redirect("/login?next=/app/admin/events");

  if (gate.status !== "ok") {
    return (
      <section className="space-y-3" data-testid="admin-events-denied">
        <h1 className="font-serif text-2xl font-semibold">Events administration</h1>
        <p className="text-sm text-muted-foreground" role="alert">
          {gate.status === "denied"
            ? "Admin access is required to manage events."
            : gate.message}
        </p>
      </section>
    );
  }

  const requested = FILTERS.includes((status ?? "all") as (typeof FILTERS)[number])
    ? (status ?? "all")
    : "all";
  const showInactive = inactive === "1";

  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id, name, status, is_active, event_start_time, organizer_id, slug")
    .order("event_start_time", { ascending: false })
    .order("id", { ascending: true })
    .limit(100);

  if (requested !== "all") query = query.eq("status", requested);
  if (!showInactive) query = query.eq("is_active", true);

  const { data, error } = await query;

  const rows: AdminEventRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Untitled event"),
    status: String(row.status ?? "draft"),
    isActive: Boolean(row.is_active),
    startsAt: String(row.event_start_time ?? ""),
    organizerId: (row.organizer_id as string | null) ?? null,
    slug: (row.slug as string | null) ?? null,
  }));

  return (
    <section className="space-y-6" data-testid="admin-events">
      <header className="space-y-2">
        <h1 className="font-serif text-2xl font-semibold">Events administration</h1>
        <p className="text-sm text-muted-foreground">
          Real event rows. Phase A: no business approval gate — publish and unpublish
          are technical state changes, and the actor is taken from your session.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Event status filter">
        {FILTERS.map((filter) => {
          const params = new URLSearchParams();
          if (filter !== "all") params.set("status", filter);
          if (showInactive) params.set("inactive", "1");
          const href = params.size ? `/app/admin/events?${params}` : "/app/admin/events";
          const active = filter === requested;
          return (
            <a
              key={filter}
              href={href}
              aria-current={active ? "page" : undefined}
              data-testid={`admin-events-filter-${filter}`}
              className={
                active
                  ? "rounded-md bg-primary/10 px-2 py-1 font-medium text-primary"
                  : "rounded-md px-2 py-1 hover:bg-muted"
              }
            >
              {filter === "all" ? "All" : filter}
            </a>
          );
        })}
      </nav>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="admin-events-error">
          Could not load events. Try again. ({error.message})
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="admin-events-empty">
          No events match this filter. This is an empty result, not an error.
        </p>
      ) : (
        <AdminEventsTable rows={rows} />
      )}

      <p className="text-xs text-muted-foreground">
        Actions are logged server-side with actor, event and before/after state. A durable
        admin-event audit table is not implemented yet.
      </p>
    </section>
  );
}
