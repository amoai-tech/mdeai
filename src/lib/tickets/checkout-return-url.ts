// Never derive a Stripe return origin from Host or X-Forwarded-Host headers.
// Only server-controlled deployment configuration can choose its domain.
export function trustedCheckoutOrigin(
  configured: string | undefined,
  vercelUrl: string | undefined,
  isProduction: boolean,
): string {
  const candidate = configured ||
    (vercelUrl ? "https://" + vercelUrl : undefined) ||
    (!isProduction ? "http://localhost:3001" : undefined);
  if (!candidate) throw new Error("CHECKOUT_ORIGIN_NOT_CONFIGURED");
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("CHECKOUT_ORIGIN_INVALID");
  }
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(isLocal && !isProduction &&
      url.protocol === "http:")) ||
    url.username || url.password ||
    url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("CHECKOUT_ORIGIN_INVALID");
  }
  return url.origin;
}

export function buildTicketCheckoutReturnUrls(
  origin: string,
  requestedPath: string,
): { successUrl: string; cancelUrl: string } {
  // Only event details are allowed as ticket Checkout return targets.
  // Reject schemeless URLs and browser backslash normalization as well.
  if (
    !requestedPath.startsWith("/events/") ||
    requestedPath.startsWith("//") || requestedPath.includes("\\") ||
    requestedPath.includes("#")
  ) {
    throw new Error("CHECKOUT_RETURN_PATH_INVALID");
  }
  let target: URL;
  try {
    target = new URL(requestedPath, origin);
  } catch {
    throw new Error("CHECKOUT_RETURN_PATH_INVALID");
  }
  if (target.origin !== origin || !target.pathname.startsWith("/events/")) {
    throw new Error("CHECKOUT_RETURN_PATH_INVALID");
  }
  target.searchParams.delete("checkout");
  target.searchParams.delete("session_id");
  const base = target.href;
  const separator = target.search ? "&" : "?";
  // Stripe requires this exact literal placeholder, not %7B...%7D.
  return {
    successUrl: base + separator +
      "checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: base + separator + "checkout=cancelled",
  };
}
