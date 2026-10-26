import { TicketDetailView } from "@/components/tickets/ticket-detail-view";
import { getServerUser } from "@/lib/auth/session";
import { getBuyerOrderForUser } from "@/lib/tickets/get-buyer-order";

export const metadata = {
  title: "Ticket QR · mdeai",
};

type TicketDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

/**
 * Legacy public route. A real emailed `?token=` link still works; a signed-in
 * buyer opening their own wallet link is resolved by server-side ownership
 * instead of being told to find the email.
 */
export default async function TicketDetailPage({
  params,
  searchParams,
}: TicketDetailPageProps) {
  const { id } = await params;
  const { token } = await searchParams;

  if (token) {
    return <TicketDetailView orderId={id} accessToken={token} />;
  }

  const { user } = await getServerUser();
  if (user) {
    const result = await getBuyerOrderForUser(id, user.id);
    if (result.status === "ok" && result.value) {
      return (
        <TicketDetailView
          orderId={result.value.orderId}
          accessToken={result.value.accessToken}
        />
      );
    }
  }

  return <TicketDetailView orderId={id} accessToken={null} />;
}
