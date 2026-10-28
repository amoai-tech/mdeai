import { redirect } from "next/navigation";
import { AccountLoadError } from "@/components/app/load-error";
import { MyTicketsList } from "@/components/tickets/my-tickets-list";
import { getServerUser } from "@/lib/auth/session";
import {
  listBuyerOrders,
  partitionOrdersByTime,
} from "@/lib/tickets/get-wallet-order";

export const metadata = {
  title: "Tickets · mdeai",
};

// skipcq: JS-0067 - Next.js App Router page export
export default async function PersonalTicketsPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/me/tickets");

  const result = await listBuyerOrders(user.id);
  const orders = result.status === "ok" ? result.value : [];
  const { upcoming, past } = partitionOrdersByTime(orders);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Tickets
        </h1>
        <p className="text-sm text-muted-foreground">
          Paid orders linked to this account. Opening a pass never asks for an
          email token.
        </p>
      </header>

      {result.status === "error" ? (
        <AccountLoadError
          message={result.message}
          retryHref="/app/me/tickets"
          title="Your tickets are temporarily unavailable"
        />
      ) : (
        <MyTicketsList
          orders={orders}
          upcoming={upcoming}
          past={past}
          detailBasePath="/app/me/tickets"
        />
      )}
    </section>
  );
}
