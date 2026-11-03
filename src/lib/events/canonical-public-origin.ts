/**
 * The apex host redirects to www, so a calendar saved from the apex would carry a URL
 * that costs every recipient a redirect. Pin the canonical public host.
 */
export function canonicalPublicOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.hostname === "mdeai.co") url.hostname = "www.mdeai.co";
    return url.origin;
  } catch {
    return null;
  }
}
