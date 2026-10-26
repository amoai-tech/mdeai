/** Stable opaque checkout token: Postgres UNIQUE(access_token) deduplicates the reservation. */
export async function deriveCheckoutAccessToken(secret: string, checkoutKey: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    ),
    new TextEncoder().encode("ticket-checkout:" + checkoutKey),
  ));
  return Array.from(bytes).map((v) => v.toString(16).padStart(2, "0")).join("");
}
