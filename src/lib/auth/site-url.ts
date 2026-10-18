import { headers } from "next/headers";

/**
 * Normalize the server-configured OAuth callback origin. A bare hostname is accepted because
 * historical Vercel configuration contains "mdeai.co" rather than "https://mdeai.co".
 * Never accept a URL with credentials, a path, or insecure non-local HTTP.
 */
export function normalizeSiteOrigin(value: string): string {
  const raw = value.trim();
  // Fail deliberately on a blank value. `new URL("https://")` does throw, but that is the
  // parser's error, not this function's contract — do not depend on it.
  if (raw === "") throw new Error("Invalid authentication site origin configuration");
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" && !local) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid authentication site origin configuration");
  }
  return url.origin;
}

/**
 * OAuth and magic-link callbacks must return to the deployment where sign-in began.
 * Use Vercel's trusted deployment hostname on previews, never a production site URL.
 * In production, use the configured canonical domain; locally, use the dev origin.
 */
export async function getSiteOrigin(): Promise<string> {
  if (process.env.VERCEL_ENV === "preview") {
    const deploymentHost = process.env.VERCEL_URL?.trim() || process.env.VERCEL_BRANCH_URL?.trim();
    if (!deploymentHost) {
      throw new Error("Missing VERCEL_URL for preview authentication callback");
    }
    const origin = normalizeSiteOrigin(deploymentHost);
    if (!new URL(origin).hostname.endsWith(".vercel.app")) {
      throw new Error("Invalid Vercel preview authentication origin");
    }
    return origin;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return normalizeSiteOrigin(configured);

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  if (host) return normalizeSiteOrigin(`${proto}://${host}`);
  return "http://localhost:3001";
}

/**
 * A placeholder origin that can never be a real destination. Candidate paths are resolved
 * against it so the URL parser — not a hand-written blocklist — decides whether the value
 * stays on this site.
 */
const RESOLUTION_BASE = "https://mde.invalid";

/**
 * Sanitise the `next` return path used after sign-in.
 *
 * This value arrives from the query string or a form field, so it is attacker-controlled.
 * Only a path that resolves to the same origin is allowed; anything else falls back.
 *
 * The naive `startsWith("/") && !startsWith("//")` check is not enough: for special-scheme
 * URLs, browsers treat `\` exactly like `/`, so `/\evil.com` resolves to
 * `https://evil.com/`. Resolving against a placeholder origin catches that class instead of
 * enumerating the ways a string can escape the site.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/",
): string {
  // A repeated query parameter arrives as an array (`?next=a&next=b`); anything that is
  // not a string is not a path, and must not throw inside an auth route.
  if (typeof next !== "string" || next.length === 0) return fallback;

  // Browsers strip tabs, newlines and other control characters before parsing, so
  // "/\t/evil.com" would become "//evil.com". Reject them at the source.
  for (let index = 0; index < next.length; index += 1) {
    const code = next.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  // Only a site-relative path can be valid. This also rejects "https://…", "//…",
  // "javascript:…" and Windows-style separators without relying on the resolver alone.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }

  try {
    const resolved = new URL(next, RESOLUTION_BASE);
    if (resolved.origin !== RESOLUTION_BASE) return fallback;
    if (!resolved.pathname.startsWith("/")) return fallback;
  } catch {
    return fallback;
  }

  return next;
}
