import { PERSONAL_LOAD_ERROR, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import {
  walletOrderPayloadSchema,
  type BuyerOrderListItem,
  type WalletOrderPayload,
} from "./wallet-types";

export { formatEventWhen, formatWalletMoney } from "./wallet-format";

// skipcq: JS-0067
export async function getWalletOrderByToken(
  orderId: string,
  accessToken: string,
): Promise<WalletOrderPayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_anonymous_order", {
    p_order_id: orderId,
    p_access_token: accessToken,
  });

  if (error || data == null) return null;

  const parsed = walletOrderPayloadSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// skipcq: JS-0067, JS-R1005
export async function listBuyerOrders(userId?: string): Promise<Result<BuyerOrderListItem[]>> {
  const supabase = await createClient();
  let buyerId = userId;
  if (!buyerId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "ok", value: [] };
    buyerId = user.id;
  }

  const { data, error } = await supabase
    .from("event_orders")
    .select(
      "id, short_id, status, total_cents, currency, quantity, events(name, event_start_time, primary_image_url, address, city)",
    )
    .eq("buyer_user_id", buyerId)
    .in("status", ["paid", "refunded", "partial_refund"])
    .order("created_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[tickets] listBuyerOrders:", error.message);
    return { status: "error", message: PERSONAL_LOAD_ERROR };
  }

  // skipcq: JS-R1005
  const orders = data.flatMap((row) => {
    type EventRow = {
      name: string;
      event_start_time: string;
      primary_image_url: string | null;
      address: string | null;
      city: string | null;
    };
    const events = row.events as EventRow | EventRow[] | null;
    const event = Array.isArray(events) ? events[0] : events;
    if (!event) return [];

    return [
      {
        id: row.id as string,
        shortId: (row.short_id as string | null) ?? null,
        status: row.status as string,
        totalCents: row.total_cents as number,
        currency: row.currency as string,
        quantity: row.quantity as number,
        eventName: event.name,
        eventStartTime: event.event_start_time,
        imageUrl: event.primary_image_url ?? null,
        venue: event.city ?? event.address ?? null,
      },
    ];
  });

  return { status: "ok", value: orders };
}

// skipcq: JS-0067
export function partitionOrdersByTime(orders: BuyerOrderListItem[]): {
  upcoming: BuyerOrderListItem[];
  past: BuyerOrderListItem[];
} {
  const cutoff = Date.now() - 86_400_000;
  const upcoming: BuyerOrderListItem[] = [];
  const past: BuyerOrderListItem[] = [];
  for (const order of orders) {
    if (new Date(order.eventStartTime).getTime() >= cutoff) {
      upcoming.push(order);
    } else {
      past.push(order);
    }
  }
  return { upcoming, past };
}
