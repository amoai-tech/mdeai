import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLoadError } from "@/components/app/load-error";
import { EmptyState } from "@/components/empty/empty-state";
import { getServerUser } from "@/lib/auth/session";
import { loadUserViewings, type RenterViewing } from "@/lib/rentals/load-user-viewings";

export const metadata = { title: "My Viewings · mdeai" };

const LABELS: Record<string, string> = {
  scheduled: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function ViewingCard({ viewing }: { viewing: RenterViewing }) {
  const label = LABELS[viewing.status] ?? "Status not specified";
  const time = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
  }).format(new Date(viewing.scheduledAt));

  return (
    <li data-testid={`renter-viewing-${viewing.id}`} className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground">{viewing.apartmentTitle ?? "Apartment details unavailable"}</h2>
        <span data-testid="renter-viewing-status" className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
          {label}
        </span>
      </div>
      {viewing.neighborhood ? <p className="mt-1 text-sm text-muted-foreground">{viewing.neighborhood}</p> : null}
      <p className="mt-3 text-sm">
        <span className="font-medium">Requested viewing:</span>{" "}
        <time dateTime={viewing.scheduledAt}>{time} (Medellín time)</time>
      </p>
      {viewing.status === "scheduled" ? (
        <p className="mt-2 text-sm text-muted-foreground">Waiting for the broker to confirm your requested time.</p>
      ) : null}
      {viewing.apartmentTitle ? (
        <Link href={`/rentals/${viewing.apartmentId}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          View apartment details
        </Link>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This apartment is not currently visible, but your viewing request is still saved.</p>
      )}
    </li>
  );
}

// skipcq: JS-0067 - Next.js App Router page
export default async function MyViewingsPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/me/viewings");
  const result = await loadUserViewings(user.id);

  return (
    <section className="space-y-6" data-testid="renter-viewings-page">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">My Viewings</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          See the latest saved status and requested time for viewings linked to your account.
          Guest requests do not appear here until securely linked to your account.
        </p>
      </header>
      {result.status === "error" ? (
        <AccountLoadError title="Your viewings are temporarily unavailable" message={result.message} retryHref="/app/me/viewings" />
      ) : result.value.length === 0 ? (
        <EmptyState testId="renter-viewings-empty" title="No linked viewings yet" description="A viewing requested while signed in will appear here after it is saved. Guest requests need a secure identity link." icon={<CalendarClock className="size-8" />} />
      ) : (
        <>
          {result.value.length === 50 ? <p className="text-sm text-muted-foreground">Showing your 50 most recent requests.</p> : null}
          <ul className="grid gap-4 sm:grid-cols-2" data-testid="renter-viewings-list">
            {result.value.map((viewing) => <ViewingCard key={viewing.id} viewing={viewing} />)}
          </ul>
        </>
      )}
    </section>
  );
}
