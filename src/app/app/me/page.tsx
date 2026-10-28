import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountLoadError } from "@/components/app/load-error";
import { getServerUser } from "@/lib/auth/session";
import { loadUserCollections } from "@/lib/saved/load-user-collections";
import { listBuyerOrders } from "@/lib/tickets/get-wallet-order";

export const metadata = {
  title: "My Account · mdeai",
};

type DestinationCardProps = {
  label: string;
  description: string;
  count: number;
  href: string;
  testId: string;
};

function DestinationCard({
  label,
  description,
  count,
  href,
  testId,
}: DestinationCardProps) {
  return (
    <li
      data-testid={testId}
      className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Open
        <span aria-hidden className="ml-1">
          →
        </span>
      </Link>
    </li>
  );
}

/**
 * SAN-1576 — Personal overview. Counts exist only after a successful query;
 * Viewings and Votes are deliberately absent until SAN-1426 / SAN-1525.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function MyAccountPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/me");

  const [saved, tickets] = await Promise.all([
    loadUserCollections(user.id),
    listBuyerOrders(user.id),
  ]);

  const failure =
    saved.status === "error" ? saved : tickets.status === "error" ? tickets : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Personal
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          My Account
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your paid tickets and saved collections, in one place.
        </p>
      </header>

      {failure ? (
        <AccountLoadError
          message={failure.message}
          retryHref="/app/me"
          title="Your account is temporarily unavailable"
        />
      ) : saved.status === "ok" && tickets.status === "ok" ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          <DestinationCard
            label="Tickets"
            description="Your paid orders and their entry passes."
            count={tickets.value.length}
            href="/app/me/tickets"
            testId="me-card-tickets"
          />
          <DestinationCard
            label="Saved"
            description="Collections you hearted from chat."
            count={saved.value.length}
            href="/app/me/saved"
            testId="me-card-saved"
          />
        </ul>
      ) : null}
    </div>
  );
}
