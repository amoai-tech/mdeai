import { z } from "zod";
import { PERSONAL_LOAD_ERROR, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

export type BuyerOrderAccess = {
  orderId: string;
  accessToken: string;
};

const ORDER_ID = z.string().uuid();

/**
 * Resolve a wallet pass for the signed-in buyer only.
 *
 * `orders_buyer_select` already limits rows to `buyer_user_id = auth.uid()`;
 * the explicit filter keeps the ownership decision on the server even if the
 * policy is later broadened. A missing and a foreign id both return null so the
 * route can render one identical not-found.
 */
// skipcq: JS-0067
export async function getBuyerOrderForUser(
  orderId: string,
  userId: string,
): Promise<Result<BuyerOrderAccess | null>> {
  if (!ORDER_ID.safeParse(orderId).success) {
    return { status: "ok", value: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_orders")
    .select("id, access_token")
    .eq("id", orderId)
    .eq("buyer_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[tickets] getBuyerOrderForUser:", error.message);
    return { status: "error", message: PERSONAL_LOAD_ERROR };
  }

  if (!data?.access_token) {
    return { status: "ok", value: null };
  }

  return {
    status: "ok",
    value: { orderId: data.id, accessToken: data.access_token },
  };
}
