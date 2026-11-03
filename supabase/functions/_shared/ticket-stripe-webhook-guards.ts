/** Pure Stripe webhook guards. Signature authenticity is checked by Stripe's SDK first. */
export type TicketStripeMode = "sandbox" | "live";

export function webhookEventMatchesMode(mode: TicketStripeMode, livemode: boolean): boolean {
  return livemode === (mode === "live");
}

export function webhookSecretsAreDistinct(liveSecret?: string, sandboxSecret?: string): boolean {
  return !(liveSecret && sandboxSecret && liveSecret === sandboxSecret);
}

/** Never cancel another order using a signed but mismatched session metadata value. */
export function expiredSessionMatchesOrder(
  savedSessionId: string | null | undefined,
  eventSessionId: string,
  mode: TicketStripeMode,
): boolean {
  return typeof savedSessionId === "string" &&
    savedSessionId === eventSessionId &&
    savedSessionId.startsWith(mode === "sandbox" ? "cs_test_" : "cs_live_");
}
