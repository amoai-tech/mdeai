import { notFound, redirect } from "next/navigation";
import { AccountLoadError } from "@/components/app/load-error";
import { TicketDetailView } from "@/components/tickets/ticket-detail-view";
import { getServerUser } from "@/lib/auth/session";
import { getBuyerOrderForUser } from "@/lib/tickets/get-buyer-order";

export const metadata = {
  title: "Your ticket · mdeai",
};

type PersonalTicketDetailProps = {
  params: Promise<{ id: string }>;
};

/**
 * SAN-1576 — resolve the pass for the signed-in buyer, never from a URL token.
 * Missing and foreign ids both call notFound(), so the response leaks nothing.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function PersonalTicketDetailPage({
  params,
}: PersonalTicketDetailProps) {
  const { id } = await params;
  const { user } = await getServerUser();
  if (!user) redirect(`/login?next=/app/me/tickets/${id}`);

  const result = await getBuyerOrderForUser(id, user.id);

  if (result.status === "error") {
    return (
      <AccountLoadError
        message={result.message}
        retryHref={`/app/me/tickets/${id}`}
        title="Your ticket is temporarily unavailable"
      />
    );
  }

  if (!result.value) notFound();

  return (
    <TicketDetailView
      orderId={result.value.orderId}
      accessToken={result.value.accessToken}
      ticketsHref="/app/me/tickets"
    />
  );
}
